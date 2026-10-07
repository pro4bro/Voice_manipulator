from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

from app.adapters.engine_worker import EngineWorkerError, EngineWorkerProcess
from app.adapters.processing_cancellation import ProcessingStopError


def test_request_cancellation_is_keyed_and_kills_only_the_matching_live_worker(tmp_path):
    script = tmp_path / "blocking_worker.py"
    marker = tmp_path / "received-request.json"
    script.write_text(
        "import json, pathlib, sys, time\n"
        "prefix = '@@PRO4BRO@@'\n"
        "print(prefix + json.dumps({'ready': True}), flush=True)\n"
        "for line in sys.stdin:\n"
        "    request = json.loads(line)\n"
        "    if request.get('command') == 'shutdown': break\n"
        f"    pathlib.Path({str(marker)!r}).write_text(request['id'], encoding='utf-8')\n"
        "    if request['id'] == 'project-a-request': time.sleep(30)\n"
        "    print(prefix + json.dumps({'id': request['id'], 'ok': True}), flush=True)\n",
        encoding="utf-8",
    )
    worker = EngineWorkerProcess(Path(sys.executable), script, label="blocking test", idle_seconds=0)
    errors: list[Exception] = []

    def request(key: str) -> None:
        try:
            worker.request({"text": key}, cancellation_id=key)
        except Exception as exc:  # expected when the process is killed
            errors.append(exc)

    active = threading.Thread(target=request, args=("project-a-request",), daemon=True)
    queued = threading.Thread(target=request, args=("project-b-request",), daemon=True)
    active.start()
    deadline = time.monotonic() + 5
    while not marker.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert marker.read_text(encoding="utf-8") == "project-a-request"

    queued.start()
    deadline = time.monotonic() + 5
    while "project-b-request" not in worker._pending_request_ids and time.monotonic() < deadline:
        time.sleep(0.01)
    assert "project-b-request" in worker._pending_request_ids
    assert worker.cancel_request("unowned-request") is False
    assert worker.cancel_request("project-b-request") is True
    assert worker.running  # cancelling a queued owner leaves the active owner alive
    assert worker.cancel_request("project-a-request") is True

    active.join(timeout=5)
    queued.join(timeout=5)
    assert not active.is_alive() and not queued.is_alive()
    assert len(errors) == 2 and all(isinstance(error, EngineWorkerError) for error in errors)
    assert not worker.running
    assert worker.request({"text": "fresh"}, cancellation_id="fresh") == {"id": "fresh", "ok": True}
    assert worker.running
    worker.shutdown()


def test_active_cancel_fails_when_killed_worker_does_not_exit(tmp_path):
    class UnreapedProcess:
        killed = False

        def poll(self):
            return None

        def kill(self):
            self.killed = True

        def wait(self, timeout):
            raise subprocess.TimeoutExpired(cmd="worker", timeout=timeout)

    worker = EngineWorkerProcess(Path(sys.executable), tmp_path / "unused.py", label="stubborn test worker")
    process = UnreapedProcess()
    worker._process = process  # type: ignore[assignment]
    worker._active_request_id = "owned-request"

    with pytest.raises(ProcessingStopError, match="remained alive"):
        worker.cancel_request("owned-request")

    assert process.killed
