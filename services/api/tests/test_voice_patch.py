from __future__ import annotations

import hashlib
import json
import shutil
import struct
import wave
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.file_voice_edits import FileVoiceEdits
from app.adapters.file_voice_patch import FileVoicePatch
from app.adapters.voice_patch_routes import make_voice_patch_router
from app.domain.voice_edits import StretchOperation, VoiceEditCommand
from app.domain.voice_patch import VoicePatchTransferRequest
from test_voice_fix import setup_fix
from app.settings import Settings


def read_pcm(path: Path) -> bytes:
    with wave.open(str(path), "rb") as audio:
        return audio.readframes(audio.getnframes())


def fake_preview_stretch(source: Path, destination: Path, operations: list[dict]):
    pcm = read_pcm(source)
    for operation in operations:
        start, end, target = operation["startFrame"], operation["endFrame"], operation["targetFrames"]
        region = pcm[start * 2:end * 2]
        sample = region[:2] or b"\0\0"
        pcm = pcm[:start * 2] + sample * target + pcm[end * 2:]
    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(pcm)
    return {"actualFrames": len(pcm) // 2, "clippedSamples": 0}


def setup_patch(tmp_path):
    project, outputs, _lease, _speaker, scripts, _edits, output, _engine = setup_fix(tmp_path)
    edits = FileVoiceEdits(outputs, scripts)
    store = FileVoicePatch(edits)
    return project, outputs, scripts, edits, output, store


def request(project, output, script, edits, *, row_id="r1"):
    return VoicePatchTransferRequest(expectedRevision=0, outputId=output.id, rowId=row_id,
        expectedScriptRevision=script.revision, expectedEditRevision=edits.revision)


def test_transfer_saves_portable_whole_row_draft_and_reopens(tmp_path):
    project, outputs, scripts, edits, output, store = setup_patch(tmp_path)
    script, edit = scripts.get(project.id), edits.get(project.id, output.id)
    document = store.transfer(project.id, request(project, output, script, edit))
    draft = document.draft

    assert document.revision == 1
    assert draft.status == "ready" and draft.processing_available is False
    assert draft.row_id == "r1" and draft.start_frame == 0 and draft.end_frame == 12000
    assert draft.text == "Xin chào" and draft.replacement_text == "Xin chào"
    assert draft.source_sha256 == hashlib.sha256(outputs.audio_path(project.id, output.id).read_bytes()).hexdigest()
    serialized = store.path(project.id).read_text(encoding="utf-8")
    assert str(project.project_path) not in serialized
    reopened = FileVoicePatch(edits).get(project.id)
    assert reopened == document


def test_transfer_uses_current_script_text_and_optimistic_revisions(tmp_path):
    project, _outputs, scripts, edits, output, store = setup_patch(tmp_path)
    script = scripts.get(project.id)
    script.rows[0].text = "Câu thay thế"
    script = scripts.save(project.id, script)
    edit = edits.get(project.id, output.id)

    stale_revision = request(project, output, script, edit)
    stale_revision.expected_script_revision -= 1
    with pytest.raises(ValueError, match="Script changed"):
        store.transfer(project.id, stale_revision)
    body = request(project, output, script, edit)
    body.expected_revision = 0
    draft = store.transfer(project.id, body).draft
    assert draft.text == "Xin chào" and draft.replacement_text == "Câu thay thế"
    stale_body = body.model_copy(update={"expected_revision": 0})
    with pytest.raises(ValueError, match="draft changed"):
        store.transfer(project.id, stale_body)


def test_current_stretch_preview_maps_row_and_get_never_renders(tmp_path, monkeypatch):
    project, outputs, scripts, edits, output, store = setup_patch(tmp_path)
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_preview_stretch)
    script = scripts.get(project.id)
    edit = edits.change(project.id, output.id, VoiceEditCommand(revision=0, scriptRevision=script.revision,
        operation=StretchOperation(startFrame=12000, endFrame=20400, targetFrames=12600)))
    document = store.transfer(project.id, request(project, output, script, edit, row_id="r2"))
    assert document.draft.start_frame == 24600 and document.draft.end_frame == 36598

    preview_files = list((outputs.audio_path(project.id, output.id).parent / "previews").glob("*"))
    reopened = store.get(project.id)
    assert reopened.draft.status == "ready"
    assert list((outputs.audio_path(project.id, output.id).parent / "previews").glob("*")) == preview_files


def test_get_marks_draft_stale_when_script_edit_or_output_metadata_changes(tmp_path):
    project, outputs, scripts, edits, output, store = setup_patch(tmp_path)
    script = scripts.get(project.id)
    edit = edits.get(project.id, output.id)
    draft = store.transfer(project.id, request(project, output, script, edit)).draft
    script.rows[0].text = "Changed later"
    scripts.save(project.id, script)
    assert store.get(project.id).draft.status == "stale"
    assert store.get(project.id).draft.reason

    current = scripts.get(project.id)
    changed = outputs.get(project.id, output.id).model_copy(update={"name": "Metadata changed"})
    outputs.save(project.id, changed)
    assert store.get(project.id).draft.status == "stale"
    assert draft.source_metadata_sha256 != store._output_metadata_hash(changed)


def test_validate_returns_current_source_for_round19_without_rendering(tmp_path):
    project, outputs, scripts, edits, output, store = setup_patch(tmp_path)
    script, edit = scripts.get(project.id), edits.get(project.id, output.id)
    draft = store.transfer(project.id, request(project, output, script, edit)).draft
    validated = store.validate(project.id, store.get(project.id).revision)
    assert validated["draft"].source_sha256 == draft.source_sha256
    assert validated["output"].id == output.id
    assert read_pcm(validated["audio_path"]) == read_pcm(outputs.audio_path(project.id, output.id))


def test_script_voice_change_does_not_relabel_source_speaker(tmp_path):
    project, _outputs, scripts, edits, output, store = setup_patch(tmp_path)
    script = scripts.get(project.id)
    script.rows[0].voice_id = "different-voice"
    script.rows[0].speaker_profile_id = None
    script = scripts.save(project.id, script)
    document = store.transfer(project.id, request(project, output, script, edits.get(project.id, output.id)))
    assert document.draft.voice_id == output.segments[0].voice_id
    assert document.draft.speaker_profile_id == output.segments[0].speaker_profile_id


def test_move_and_reopen_keeps_draft_portable(tmp_path):
    project, outputs, scripts, edits, output, store = setup_patch(tmp_path)
    script, edit = scripts.get(project.id), edits.get(project.id, output.id)
    draft = store.transfer(project.id, request(project, output, script, edit)).draft
    moved = tmp_path / "moved-project"
    shutil.move(project.project_path, moved)
    outputs.projects.open(moved)
    reopened = FileVoicePatch(edits).get(project.id)
    assert reopened.draft.status == "ready"
    assert reopened.draft.source_sha256 == draft.source_sha256
    validated = FileVoicePatch(edits).validate(project.id, reopened.revision)
    assert validated["audio_path"].is_relative_to(moved)


def test_missing_preview_and_missing_output_are_reported_without_rebuild(tmp_path, monkeypatch):
    project, outputs, scripts, edits, output, store = setup_patch(tmp_path)
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_preview_stretch)
    script = scripts.get(project.id)
    edit = edits.change(project.id, output.id, VoiceEditCommand(revision=0, scriptRevision=script.revision,
        operation=StretchOperation(startFrame=12000, endFrame=20400, targetFrames=12600)))
    store.transfer(project.id, request(project, output, script, edit))
    for path in (outputs.audio_path(project.id, output.id).parent / "previews").glob("*.wav"):
        path.unlink()
    status = store.get(project.id).draft.status
    assert status == "missing"
    assert not list((outputs.audio_path(project.id, output.id).parent / "previews").glob("*.wav"))


def test_get_marks_late_timeline_or_source_change_stale(tmp_path):
    project, outputs, scripts, edits, output, store = setup_patch(tmp_path)
    script, edit = scripts.get(project.id), edits.get(project.id, output.id)
    store.transfer(project.id, request(project, output, script, edit))
    edit = edits.change(project.id, output.id, VoiceEditCommand(revision=0, scriptRevision=script.revision,
        operation=StretchOperation(startFrame=12000, endFrame=20400, targetFrames=12600)))
    assert store.get(project.id).draft.status == "stale"
    assert edit.revision == 1

    source = outputs.audio_path(project.id, output.id)
    pcm = bytearray(read_pcm(source))
    pcm[0] ^= 1
    with wave.open(str(source), "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(pcm)
    assert store.get(project.id).draft.status == "stale"


def test_http_transfer_contract_and_stale_conflict(tmp_path):
    project, _outputs, scripts, edits, output, store = setup_patch(tmp_path)
    app = FastAPI()
    app.include_router(make_voice_patch_router(store))
    endpoint = f"/api/projects/{project.id}/voice-patch/source"
    with TestClient(app) as client:
        empty = client.get(endpoint)
        assert empty.status_code == 200 and empty.json() == {"revision": 0, "draft": None}
        script, edit = scripts.get(project.id), edits.get(project.id, output.id)
        payload = {"expectedRevision": 0, "outputId": output.id, "rowId": "r1",
            "expectedScriptRevision": script.revision, "expectedEditRevision": edit.revision}
        saved = client.post(endpoint, json=payload)
        assert saved.status_code == 200, saved.text
        assert saved.json()["draft"]["processingAvailable"] is False
        assert client.post(endpoint, json=payload).status_code == 409
        assert client.get(endpoint).json()["draft"]["status"] == "ready"


def test_production_app_transfers_output_without_inference(tmp_path):
    from app.main import create_app
    project, outputs, scripts, edits, output, _store = setup_patch(tmp_path)
    original = outputs.audio_path(project.id, output.id).read_bytes()
    app = create_app(project_repository=outputs.projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "app-data"))
    endpoint = f"/api/projects/{project.id}/voice-patch/source"
    with TestClient(app) as client:
        assert client.get(endpoint).json() == {"revision": 0, "draft": None}
        payload = dict(expectedRevision=0, outputId=output.id, rowId="r1",
            expectedScriptRevision=scripts.get(project.id).revision,
            expectedEditRevision=edits.get(project.id, output.id).revision)
        response = client.post(endpoint, json=payload)
        assert response.status_code == 200, response.text
        assert response.json()["draft"]["outputId"] == output.id
        assert client.get(endpoint).json() == response.json()
        audio = client.get(response.json()["draft"]["audioUrl"])
        assert audio.status_code == 200 and audio.content == original
    assert outputs.audio_path(project.id, output.id).read_bytes() == original

