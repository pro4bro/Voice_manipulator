from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

from studio_app import server


def test_cancel_before_job_registration_prevents_child_launch(monkeypatch) -> None:
    async def run() -> None:
        progress_id = "cancel-before-register"
        await server._cancel_inference_job(progress_id)
        job = server._register_inference_job(progress_id)

        async def unexpected_worker(_kind):
            raise AssertionError("cancelled work must not start a child")

        monkeypatch.setattr(server, "_get_inference_worker", unexpected_worker)
        with pytest.raises(HTTPException) as error:
            await server._run_cancellable_inference(job, "transcribe", {})
        assert error.value.status_code == 409
        assert job.cancelled

    asyncio.run(run())


def test_cancel_terminates_and_reaps_only_the_owned_blocking_subprocess() -> None:
    async def run() -> None:
        progress_id = "owned-blocking-process"
        job = server._register_inference_job(progress_id)
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
        )
        job.process = process
        server.inference_workers["transcribe"] = process
        try:
            assert await server._cancel_inference_job(progress_id) is True
            assert process.returncode is not None
            assert server.inference_workers.get("transcribe") is None
            assert job.cancelled is True
        finally:
            server.inference_jobs.pop(progress_id, None)
            server.inference_workers.pop("transcribe", None)
            if process.returncode is None:
                process.kill()
                await process.wait()

    asyncio.run(run())


def test_cancel_reports_502_when_killed_child_does_not_exit(monkeypatch) -> None:
    class StubbornProcess:
        returncode = None

        def terminate(self):
            pass

        def kill(self):
            pass

        async def wait(self):
            await asyncio.sleep(60)

    async def run() -> None:
        monkeypatch.setattr(server, "CANCEL_TERMINATE_TIMEOUT_SECONDS", 0.01)
        monkeypatch.setattr(server, "CANCEL_KILL_TIMEOUT_SECONDS", 0.01)
        progress_id = "stubborn-owned-process"
        job = server._register_inference_job(progress_id)
        process = StubbornProcess()
        job.process = process
        server.inference_workers["transcribe"] = process
        try:
            with pytest.raises(HTTPException) as error:
                await server._cancel_inference_job(progress_id)
            assert error.value.status_code == 502
            assert job.cancelled is True
            assert job.process is process
            assert server.inference_workers.get("transcribe") is process
        finally:
            server.inference_jobs.pop(progress_id, None)
            server.inference_workers.pop("transcribe", None)

    asyncio.run(run())


def test_persistent_job_worker_is_reused_and_cancelled_worker_cannot_publish(tmp_path, monkeypatch) -> None:
    async def run() -> None:
        server.inference_workers.clear()
        server.inference_jobs.clear()
        for task in server.inference_worker_idle_tasks.values():
            task.cancel()
        server.inference_worker_idle_tasks.clear()
        monkeypatch.setattr(server, "queued_inference_lock", asyncio.Lock())

        worker_script = r'''
import json, pathlib, sys, time
marker = "@@PRO4BRO_JOB@@"
for line in sys.stdin:
    request = json.loads(line)
    if request.get("kind") == "shutdown":
        break
    if request.get("block"):
        print(marker + json.dumps({"kind":"progress", "progress_id":request["progress_id"], "value":20}), flush=True)
        time.sleep(60)
    if request.get("marker"):
        pathlib.Path(request["marker"]).write_text("late", encoding="utf-8")
    pathlib.Path(request["result_path"]).write_text(json.dumps({"result":{"value":request.get("value")}}), encoding="utf-8")
    print(marker + json.dumps({"kind":"done", "progress_id":request["progress_id"]}), flush=True)
'''

        async def fake_get_worker(kind):
            worker = server.inference_workers.get(kind)
            if worker is not None and worker.returncode is None:
                return worker
            worker = await asyncio.create_subprocess_exec(
                sys.executable,
                "-c",
                worker_script,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
            )
            server.inference_workers[kind] = worker
            return worker

        monkeypatch.setattr(server, "_get_inference_worker", fake_get_worker)
        first = server._register_inference_job("persistent-one")
        assert await server._run_cancellable_inference(first, "transcribe", {"value": 1}) == {"value": 1}
        warm_worker = server.inference_workers["transcribe"]
        second = server._register_inference_job("persistent-two")
        assert await server._run_cancellable_inference(second, "transcribe", {"value": 2}) == {"value": 2}
        assert server.inference_workers["transcribe"] is warm_worker

        marker = tmp_path / "late-result.txt"
        active = server._register_inference_job("persistent-cancel")
        pending = asyncio.create_task(server._run_cancellable_inference(
            active,
            "transcribe",
            {"block": True, "marker": str(marker)},
        ))
        while active.process is None:
            await asyncio.sleep(0.01)
        assert await server._cancel_inference_job(active.progress_id) is True
        with pytest.raises(HTTPException) as error:
            await pending
        assert error.value.status_code == 409
        assert marker.is_file() is False
        assert "transcribe" not in server.inference_workers

        for task in server.inference_worker_idle_tasks.values():
            task.cancel()
        server.inference_worker_idle_tasks.clear()
        for worker in server.inference_workers.values():
            if worker.returncode is None:
                worker.kill()
                await worker.wait()
        server.inference_workers.clear()
        server.inference_jobs.clear()

    asyncio.run(run())


def test_release_rejects_active_slot_and_reaps_idle_warm_worker() -> None:
    async def run() -> None:
        server.inference_workers.clear()
        server.inference_worker_models.clear()
        monkeypatch_lock = asyncio.Lock()
        await monkeypatch_lock.acquire()
        original_lock = server.queued_inference_lock
        server.queued_inference_lock = monkeypatch_lock
        try:
            with pytest.raises(HTTPException) as error:
                await server.release_inference_models()
            assert error.value.status_code == 409
        finally:
            monkeypatch_lock.release()
            server.queued_inference_lock = original_lock

        worker = await asyncio.create_subprocess_exec(
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
        )
        server.inference_workers["transcribe"] = worker
        server.inference_worker_models["transcribe"] = {"large-v3"}
        assert await server.release_inference_models() == {"released": True}
        assert worker.returncode is not None
        assert server.inference_workers == {}
        assert server.inference_worker_models == {}

    asyncio.run(run())


def test_switching_inference_kind_retires_other_warm_gpu_worker(monkeypatch) -> None:
    async def run() -> None:
        server.inference_workers.clear()
        server.inference_worker_models.clear()
        server.inference_jobs.clear()
        for task in server.inference_worker_idle_tasks.values():
            task.cancel()
        server.inference_worker_idle_tasks.clear()
        monkeypatch.setattr(server, "queued_inference_lock", asyncio.Lock())
        previous = await asyncio.create_subprocess_exec(
            sys.executable, "-c", "import time; time.sleep(60)",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        )
        server.inference_workers["diarize"] = previous
        server.inference_worker_models["diarize"] = {"pyannote"}

        async def next_worker(kind):
            assert kind == "transcribe"
            script = r'''
import json, pathlib, sys
marker = "@@PRO4BRO_JOB@@"
for line in sys.stdin:
    request = json.loads(line)
    pathlib.Path(request["result_path"]).write_text(json.dumps({"result":{"ok":True}}))
    print(marker + json.dumps({"kind":"done", "progress_id":request["progress_id"]}), flush=True)
'''
            worker = await asyncio.create_subprocess_exec(
                sys.executable, "-c", script,
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            )
            server.inference_workers[kind] = worker
            return worker

        monkeypatch.setattr(server, "_get_inference_worker", next_worker)
        job = server._register_inference_job("kind-switch")
        assert await server._run_cancellable_inference(job, "transcribe", {}) == {"ok": True}
        assert previous.returncode is not None
        assert "diarize" not in server.inference_workers
        current = server.inference_workers["transcribe"]
        for task in server.inference_worker_idle_tasks.values():
            task.cancel()
        server.inference_worker_idle_tasks.clear()
        if current.returncode is None:
            current.kill()
            await current.wait()
        server.inference_workers.clear()
        server.inference_worker_models.clear()
        server.inference_jobs.clear()

    asyncio.run(run())
