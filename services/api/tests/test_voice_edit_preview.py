import hashlib
import json
import wave
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.adapters.voice_edit_preview import VoiceEditPreview
from app.adapters.voice_edit_routes import make_voice_edit_router
from app.domain.voice_edits import VoiceEditCommand, StretchOperation
from test_voice_edits import setup_store


@pytest.mark.parametrize("damage", ["missing-report", "bad-wav", "wrong-hash", "wrong-frames"])
def test_preview_rebuilds_incomplete_or_corrupt_cache_before_reuse(tmp_path, monkeypatch, damage):
    _, project, oid, store = setup_store(tmp_path)
    preview = VoiceEditPreview(store)
    calls = []
    def render(source, destination, operations):
        frames = 264000
        with wave.open(str(destination), "wb") as pcm:
            pcm.setparams((1, 2, 24000, 0, "NONE", "none")); pcm.writeframes(b"\0\0" * frames)
        calls.append(1)
        return {"actualFrames": frames, "clippedSamples": 0}
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", render)
    doc = store.change(project.id, oid, VoiceEditCommand(revision=0, scriptRevision=1,
        operation=StretchOperation(startFrame=48000, endFrame=96000, targetFrames=72000)), persist=False)
    folder = store.outputs.audio_path(project.id, oid).parent / "previews"; folder.mkdir()
    preview.render(project.id, oid, doc)
    path = next(folder.glob("*.wav")); report_path = path.with_suffix(".json")
    if damage == "missing-report": report_path.unlink()
    elif damage == "bad-wav": path.write_bytes(b"broken")
    else:
        report = json.loads(report_path.read_text())
        report["sourceSha256" if damage == "wrong-hash" else "actualFrames"] = "wrong" if damage == "wrong-hash" else 1
        report_path.write_text(json.dumps(report))
    preview.render(project.id, oid, doc)
    assert len(calls) == 2
    preview.validate(path, doc.source_sha256, doc.frames)


def test_failed_render_does_not_commit_and_preview_does_not_change_history(tmp_path, monkeypatch):
    _, project, oid, store = setup_store(tmp_path)
    app = FastAPI(); app.include_router(make_voice_edit_router(store))
    payload = {"revision": 0, "scriptRevision": 1, "operation": {"startFrame": 0, "endFrame": 24000, "targetFrames": 48000}}
    def fail(*args): raise ValueError("no-fit")
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fail)
    with TestClient(app) as client:
        assert client.post(f"/api/projects/{project.id}/voice-outputs/{oid}/edit", json=payload).status_code == 400
        assert client.post(f"/api/projects/{project.id}/voice-outputs/{oid}/edit/preview", json=payload).status_code == 400
    assert store.get(project.id, oid).revision == 0
