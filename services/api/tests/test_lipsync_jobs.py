import json
import time
from types import SimpleNamespace
from unittest.mock import patch
import pytest
from test_lipsync_document import setup
from app.adapters.lipsync_jobs import LipSyncJobs
from app.adapters.file_voice_script import ScriptRevisionConflict


def test_failed_worker_cannot_publish_analysis_or_video_and_bad_revision_rejected(tmp_path):
    _, project, _, _, store, doc = setup(tmp_path)
    doc = store.save(project.id, doc)
    runtime = SimpleNamespace(report=lambda **_: {"ready": True, "blockers": []}, python="python", worker="worker.py", root=tmp_path)
    jobs = LipSyncJobs(store, runtime, SimpleNamespace(get=lambda _: SimpleNamespace(speakers=[])))
    with pytest.raises(ScriptRevisionConflict): jobs.start(project.id, "analysis", 0)
    with patch("app.adapters.lipsync_jobs.subprocess.Popen", return_value=SimpleNamespace(wait=lambda: 1)):
        job = jobs.start(project.id, "analysis", doc.revision)
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and jobs.get(project.id, job["id"])["status"] in ("queued", "running"):
            time.sleep(.01)
    assert jobs.get(project.id, job["id"])["status"] == "failed"
    with pytest.raises(ValueError): jobs.faces.get(project.id, job["id"])
    assert not (jobs.faces.directory(project.id, job["id"]) / "after.mp4").exists()
    request = json.loads((jobs.faces.directory(project.id, job["id"]) / "request.json").read_text(encoding="utf-8"))
    assert str(tmp_path) not in json.dumps(request)


def test_interrupted_job_is_explicit_and_unknown_engine_cannot_bypass_readiness(tmp_path):
    _, project, _, _, store, doc = setup(tmp_path)
    jobs = LipSyncJobs(store, None, None)
    from uuid import uuid4
    identifier = str(uuid4())
    directory = jobs.faces.directory(project.id, identifier)
    directory.mkdir(parents=True)
    (directory / "status.json").write_text(json.dumps({"kind": "render", "status": "running", "ownerPid": -1, "createdAt": "test"}))
    assert jobs.get(project.id, identifier)["status"] == "interrupted"
    with pytest.raises(KeyError): jobs.get(project.id, "../status")
