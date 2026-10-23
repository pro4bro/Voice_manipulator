from __future__ import annotations

import hashlib
import json
import threading
import time
import wave
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.activity_center import ActivityCenter
from app.adapters.output_timing_repair_routes import make_output_timing_repair_router
from app.adapters.output_timing_repair import OutputTimingRepair
from app.adapters.output_timing_repair import OutputTimingRepairConflict
from app.domain.output_timing_repair import OutputTimingRepairJob
from test_voice_fix import setup_fix


@pytest.fixture(autouse=True)
def isolated_timing_activity(monkeypatch):
    center = ActivityCenter()
    monkeypatch.setattr("app.adapters.output_timing_repair.CENTER", center)
    return center


class FakeRecognizer:
    def __init__(self, *, partial=False, fail=False):
        self.partial, self.fail = partial, fail
        self.model = "medium"
        self.calls = []

    def recognize(self, audio: Path, language: str | None, cancellation_id: str | None = None):
        with wave.open(str(audio), "rb") as wav:
            duration = wav.getnframes() / wav.getframerate()
        self.calls.append((language, cancellation_id, duration))
        if self.fail:
            raise RuntimeError("ASR unavailable")
        words = ["xin", "chào"] if len(self.calls) == 1 else ["tạm", "biệt"]
        if self.partial and len(self.calls) == 2:
            return [{"text": "tạm", "start": .05, "end": min(.15, duration)}]
        width = duration / len(words)
        return [{"text": word, "start": i * width, "end": (i + 1) * width}
            for i, word in enumerate(words)]


def wait_job(service, project_id, output_id, job_id, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = service.get_job(project_id, output_id, job_id)
        if job.status not in {"queued", "running"}:
            return job
        time.sleep(.01)
    raise AssertionError("timing repair job did not finish")


def setup_repair(tmp_path, recognizer=None):
    project, outputs, lease, speaker, _scripts, _edits, output, _engine = setup_fix(tmp_path)
    recognizer = recognizer or FakeRecognizer()
    service = OutputTimingRepair(projects=speaker.projects, outputs=outputs, recognizer=recognizer, lease=lease)
    return project, outputs, lease, output, recognizer, service


def request_for(service, project_id, output_id):
    return {"expectedKey": service.plan(project_id, output_id)["expectedKey"]}


def test_timing_repair_proposes_trusted_partial_alignment_and_applies_identical_audio_idempotently(tmp_path):
    project, outputs, lease, source, recognizer, service = setup_repair(tmp_path, FakeRecognizer(partial=True))
    source_path = outputs.audio_path(project.id, source.id)
    source_bytes = source_path.read_bytes()
    source_hash = hashlib.sha256(source_bytes).hexdigest()

    plan = service.plan(project.id, source.id)
    assert plan["processingAvailable"] is True and plan["blockers"] == []
    assert plan["total"] == len(source.segments) == 2
    started = service.start(project.id, source.id, request_for(service, project.id, source.id)["expectedKey"])
    job = wait_job(service, project.id, source.id, started.id)
    assert job.status == "complete" and job.done == job.total == 2, job.error
    assert job.proposal_sha256 and service._sha(service.proposal_path(project.id, job.id)) == job.proposal_sha256
    proposal = json.loads(service.proposal_path(project.id, job.id).read_text(encoding="utf-8"))
    assert proposal["wordTimingVersion"] == 2
    assert proposal["recognizer"]["model"] == "medium"
    measured = [word for word in proposal["words"] if word["timingTrusted"] is True]
    assert len(measured) == 3, proposal["words"]  # one unmatched word remains explicitly estimated
    assert {word["segmentIndex"] for word in measured} == {0, 1}
    assert all(word["speakerId"] == source.segments[word["segmentIndex"]].speaker_profile_id for word in measured)
    assert len(recognizer.calls) == 2 and all(call[1] for call in recognizer.calls)
    assert lease.holder() is None
    assert len(outputs.list(project.id)) == 1  # no output appears before explicit Apply

    first = service.apply(project.id, source.id, {"jobId": job.id, "expectedKey": job.key})
    second = service.apply(project.id, source.id, {"jobId": job.id, "expectedKey": job.key})
    assert first["output"].id == second["output"].id != source.id
    assert outputs.audio_path(project.id, first["output"].id).read_bytes() == source_bytes
    assert first["output"].parameters["timingRepair"]["sourceOutputId"] == source.id
    assert outputs.audio_path(project.id, source.id).read_bytes() == source_bytes
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source_hash
    assert len(outputs.list(project.id)) == 2


def test_timing_repair_plan_key_pins_recognizer_model_and_timing_policy(tmp_path):
    project, _outputs, _lease, source, recognizer, service = setup_repair(tmp_path)
    medium = service.plan(project.id, source.id)
    recognizer.model = "large-v3"
    large = service.plan(project.id, source.id)
    assert medium["expectedKey"] != large["expectedKey"]
    assert large["recognizer"]["model"] == "large-v3"
    assert large["wordTimingVersion"] == 2


def test_timing_repair_zero_trusted_matches_fails_without_applicable_proposal(tmp_path, isolated_timing_activity):
    project, outputs, lease, source, _recognizer, service = setup_repair(tmp_path, FakeRecognizer(fail=True))
    started = service.start(project.id, source.id, request_for(service, project.id, source.id)["expectedKey"])
    job = wait_job(service, project.id, source.id, started.id)
    assert job.status == "failed" and job.proposal_sha256 is None
    task, = isolated_timing_activity.tasks()
    assert task.status == "failed" and "trusted" in (task.error or "").lower()
    assert "trusted" in (job.error or "").lower()
    with pytest.raises((ValueError, RuntimeError)):
        service.apply(project.id, source.id, {"jobId": job.id, "expectedKey": job.key})
    assert len(outputs.list(project.id)) == 1 and lease.holder() is None


def test_timing_repair_reports_live_segment_progress_and_published_proposal(tmp_path, isolated_timing_activity):
    class HeldRecognizer(FakeRecognizer):
        def __init__(self):
            super().__init__()
            self.entered = threading.Event()
            self.release = threading.Event()

        def recognize(self, audio, language, cancellation_id=None):
            self.entered.set()
            assert self.release.wait(timeout=5)
            return super().recognize(audio, language, cancellation_id)

    recognizer = HeldRecognizer()
    project, _outputs, _lease, source, _recognizer, service = setup_repair(tmp_path, recognizer)
    started = service.start(project.id, source.id, request_for(service, project.id, source.id)["expectedKey"])
    assert recognizer.entered.wait(timeout=3)
    task, = isolated_timing_activity.tasks()
    assert task.id == f"alignment:{started.id}" and task.status == "running"
    assert task.kind == "alignment" and task.project_id == project.id
    assert task.asset_id is None and task.footage_id is None
    assert "Output Timing Repair" in task.label and task.fraction == 0
    recognizer.release.set()
    job = wait_job(service, project.id, source.id, started.id)
    assert job.status == "complete" and service.proposal_path(project.id, job.id).is_file()
    task, = isolated_timing_activity.tasks()
    assert task.status == "complete" and task.fraction == 1


def test_timing_repair_rejects_stale_source_and_tampered_proposal(tmp_path):
    project, outputs, _lease, source, _recognizer, service = setup_repair(tmp_path)
    key = request_for(service, project.id, source.id)["expectedKey"]
    started = service.start(project.id, source.id, key)
    job = wait_job(service, project.id, source.id, started.id)
    source_path = outputs.audio_path(project.id, source.id)
    original = source_path.read_bytes()
    source_path.write_bytes(original + b"changed")
    with pytest.raises((OutputTimingRepairConflict, ValueError)):
        service.apply(project.id, source.id, {"jobId": job.id, "expectedKey": job.key})
    source_path.write_bytes(original)

    proposal_path = service.proposal_path(project.id, job.id)
    proposal_path.write_text("{}", encoding="utf-8")
    assert service.get_job(project.id, source.id, job.id).status == "stale"
    with pytest.raises((ValueError, RuntimeError)):
        service.apply(project.id, source.id, {"jobId": job.id, "expectedKey": job.key})
    assert len(outputs.list(project.id)) == 1


@pytest.mark.parametrize(("mutation", "reason"), [
    ("audio", "source-audio"),
    ("metadata", "source-metadata"),
    ("recognizer", "recognizer"),
    ("policy", "timing-policy"),
    ("proposal", "proposal"),
])
def test_completed_job_reports_specific_stale_reason(tmp_path, mutation, reason):
    project, outputs, _lease, source, recognizer, service = setup_repair(tmp_path)
    started = service.start(project.id, source.id, request_for(service, project.id, source.id)["expectedKey"])
    job = wait_job(service, project.id, source.id, started.id)
    if mutation == "audio":
        path = outputs.audio_path(project.id, source.id)
        path.write_bytes(path.read_bytes() + b"x")
    elif mutation == "metadata":
        outputs.save(project.id, source.model_copy(update={"name": "Changed metadata"}))
    elif mutation == "recognizer":
        recognizer.model = "large-v3"
    elif mutation == "policy":
        service._timing_policy_version = 999
    elif mutation == "proposal":
        service.proposal_path(project.id, job.id).write_text("tampered", encoding="utf-8")
    stale = service.get_job(project.id, source.id, job.id)
    assert stale.status == "stale"
    assert stale.stale_reason == reason
    assert service.get_job(project.id, source.id, job.id).stale_reason == reason


def test_stale_reason_preserves_terminal_state_and_legacy_jobs_use_identity(tmp_path):
    project, outputs, _lease, source, _recognizer, service = setup_repair(tmp_path)
    legacy = OutputTimingRepairJob(project_id=project.id, output_id=source.id,
        key="0" * 64, status="stale", total=len(source.segments))
    service._write_job(legacy)
    stored = json.loads(service.job_path(project.id, legacy.id).read_text(encoding="utf-8"))
    stored.pop("staleReason", None)
    service.job_path(project.id, legacy.id).write_text(json.dumps(stored), encoding="utf-8")
    stale = service.get_job(project.id, source.id, legacy.id)
    assert stale.status == "stale" and stale.stale_reason == "identity"

    started = service.start(project.id, source.id, request_for(service, project.id, source.id)["expectedKey"])
    finished = wait_job(service, project.id, source.id, started.id)
    path = outputs.audio_path(project.id, source.id)
    path.write_bytes(path.read_bytes() + b"changed")
    outputs.save(project.id, source.model_copy(update={"name": "also changed"}))
    classified = service.get_job(project.id, source.id, finished.id)
    assert classified.stale_reason == "source-audio"  # source audio takes precedence over metadata
    path.write_bytes(path.read_bytes()[:-7])
    assert service.get_job(project.id, source.id, finished.id).stale_reason == "source-audio"

    interrupted = OutputTimingRepairJob(project_id=project.id, output_id=source.id,
        key="0" * 64, status="running", total=len(source.segments))
    service._write_job(interrupted)
    recovered = OutputTimingRepair(service.projects, service.outputs, _recognizer, _lease).get_job(
        project.id, source.id, interrupted.id)
    assert recovered.status == "failed" and recovered.stale_reason is None


def test_timing_repair_http_contract_and_reopen_marks_running_job_interrupted(tmp_path):
    project, _outputs, _lease, source, recognizer, service = setup_repair(tmp_path)
    app = FastAPI()
    app.include_router(make_output_timing_repair_router(service))
    client = TestClient(app)
    prefix = f"/api/projects/{project.id}/voice-outputs/{source.id}/timing-repair"
    plan = client.get(prefix + "/plan").json()
    assert plan["processingAvailable"] is True and plan["expectedKey"]
    response = client.post(prefix + "/jobs", json={"expectedKey": plan["expectedKey"]})
    assert response.status_code == 200
    started = response.json()
    finished = wait_job(service, project.id, source.id, started["id"])
    assert client.get(prefix + f"/jobs/{finished.id}").json()["status"] == "complete"
    assert len(recognizer.calls) == 2

    interrupted = OutputTimingRepairJob(project_id=project.id, output_id=source.id,
        key=plan["expectedKey"], status="running", total=len(source.segments))
    service._write_job(interrupted)
    reopened = OutputTimingRepair(service.projects, service.outputs, recognizer, _lease)
    recovered = reopened.get_job(project.id, source.id, interrupted.id)
    assert recovered.status == "failed" and "interrupted" in recovered.error.lower()
    assert len(recognizer.calls) == 2  # reopening never resumes ASR


def test_timing_repair_stop_cancels_only_its_active_recognition_and_releases_lease(tmp_path):
    import threading

    class BlockingRecognizer:
        def __init__(self):
            self.entered, self.release = threading.Event(), threading.Event()
            self.active_id = None
            self.cancelled = []

        def recognize(self, audio, language, cancellation_id=None):
            self.active_id = cancellation_id
            self.entered.set()
            self.release.wait(3)
            return [{"text": "xin", "start": 0.0, "end": .1}]

        def cancel_request(self, cancellation_id):
            self.cancelled.append(cancellation_id)
            self.release.set()
            return True

    recognizer = BlockingRecognizer()
    project, _outputs, lease, source, _r, service = setup_repair(tmp_path, recognizer)
    started = service.start(project.id, source.id, request_for(service, project.id, source.id)["expectedKey"])
    assert recognizer.entered.wait(2)
    service.stop(project.id, source.id, started.id)
    finished = wait_job(service, project.id, source.id, started.id)
    assert finished.status == "cancelled"
    assert recognizer.cancelled == [recognizer.active_id]
    assert lease.holder() is None


def test_timing_repair_plan_blocks_out_of_bounds_segment_geometry(tmp_path):
    project, outputs, _lease, source, _recognizer, service = setup_repair(tmp_path)
    invalid_segments = list(source.segments)
    invalid_segments[-1] = invalid_segments[-1].model_copy(update={"end": source.duration + 1})
    outputs.save(project.id, source.model_copy(update={"segments": invalid_segments}))
    plan = service.plan(project.id, source.id)
    assert plan["processingAvailable"] is False
    assert any("outside" in blocker for blocker in plan["blockers"])
    assert not service._threads
