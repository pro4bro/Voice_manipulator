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


@pytest.mark.parametrize("broken", [b"not a WAV container", b"RIFF\x24\x00\x00\x00WAVEfmt \x10"])
def test_malformed_cache_reads_fail_cleanly_and_preview_can_rebuild(tmp_path, monkeypatch, broken):
    _, project, output_id, store = setup_store(tmp_path)
    source = store.outputs.audio_path(project.id, output_id)
    original = source.read_bytes()
    calls = []

    def render(source, destination, operations):
        calls.append(operations)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(destination), "wb") as wav:
            wav.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
            wav.writeframes(b"\0\0" * 252000)
        return {"actualFrames": 252000, "targetFrames": 252000, "paddingFrames": 0,
            "maxBoundaryStep": 0.0, "clippedSamples": 0, "boundariesWithinLimit": True}

    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", render)
    command = VoiceEditCommand(revision=0, scriptRevision=1,
        operation=StretchOperation(startFrame=48000, endFrame=72000, targetFrames=36000))
    doc = store.change(project.id, output_id, command, persist=False)
    previews = VoiceEditPreview(store)
    url, report = previews.render(project.id, output_id, doc)
    path = previews.path(project.id, output_id, url.split("/")[-2])
    path.write_bytes(broken)
    report["audioSha256"] = hashlib.sha256(broken).hexdigest()
    path.with_suffix(".json").write_text(json.dumps(report), encoding="utf-8")
    app = FastAPI()
    app.include_router(make_voice_edit_router(store))
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get(url).status_code == 404
        waveform = client.get(url.removesuffix("/audio") + "/waveform")
        assert waveform.status_code == 400
        assert "PCM" in waveform.json()["detail"]
        recovered = client.post(f"/api/projects/{project.id}/voice-outputs/{output_id}/edit/preview",
            json=command.model_dump(by_alias=True))
        assert recovered.status_code == 200
        assert recovered.json()["previewDiagnostics"]["cacheHit"] is False
        assert client.get(url).status_code == 200
        assert client.get(url.removesuffix("/audio") + "/waveform").status_code == 200
    assert len(calls) == 2
    assert store.get(project.id, output_id).revision == 0
    assert source.read_bytes() == original
