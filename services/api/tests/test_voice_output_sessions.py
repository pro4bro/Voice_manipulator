import shutil
import wave
from dataclasses import replace

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_output_sessions import FileVoiceOutputSessions
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.file_voice_edits import FileVoiceEdits
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.domain.models import ProjectCreate, VoiceOutput
from app.domain.voice_edits import VoiceEditCommand, VoiceEditDocument, StretchOperation
from app.settings import Settings


def make_output(outputs, project_id, name):
    output_id, audio = outputs.reserve(project_id)
    with wave.open(str(audio), "wb") as pcm:
        pcm.setnchannels(1)
        pcm.setsampwidth(2)
        pcm.setframerate(24000)
        pcm.writeframes(b"\x00\x00" * 2400)
    return outputs.save(project_id, VoiceOutput(id=output_id, name=name, text="Xin chào", voice_id="voice", voice_name="An",
        speaker_profile_id="speaker", engine="omnivoice", generator_id="omni", duration=.1, sample_rate=24000,
        audio_path=f"assets/voice-output/{output_id}/audio.wav"))


def test_session_version_copy_is_independent_and_survives_project_move(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Voice", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    first = make_output(outputs, project.id, "First")
    sessions = FileVoiceOutputSessions(outputs)
    book = sessions.get(project.id)
    assert len(book["sessions"]) == 1
    original_audio = outputs.audio_path(project.id, first.id)
    original_bytes = original_audio.read_bytes()
    original_edit = VoiceEditDocument(output_id=first.id, source_sha256=__import__("hashlib").sha256(original_bytes).hexdigest(), sample_rate=24000, source_frames=2400)
    (original_audio.parent / "edits.json").write_text(original_edit.model_dump_json(by_alias=True), encoding="utf-8")
    cloned_book, copied = sessions.create_version(project.id, book["revision"], first.id)
    assert copied.id != first.id and outputs.audio_path(project.id, copied.id).read_bytes() == original_bytes
    assert len(cloned_book["sessions"][0]["versions"]) == 2
    cloned_edit = VoiceEditDocument.model_validate_json((outputs.audio_path(project.id, copied.id).parent / "edits.json").read_text(encoding="utf-8"))
    assert cloned_edit.output_id == copied.id and cloned_edit.revision == 0
    edits = FileVoiceEdits(outputs, FileVoiceScript(projects))
    edits.change(project.id, copied.id, VoiceEditCommand(revision=0, script_revision=0, action="stretch",
        operation=StretchOperation(start_frame=0, end_frame=1000, target_frames=1200)))
    assert edits.get(project.id, copied.id).revision == 1
    assert edits.get(project.id, first.id).revision == 0
    with pytest.raises(ScriptRevisionConflict):
        sessions.create_version(project.id, book["revision"], first.id)
    blank = sessions.create_session(project.id, cloned_book["revision"])
    assert blank["sessions"][-1]["versions"][0]["outputId"] is None
    second = make_output(outputs, project.id, "Second")
    filled = sessions.get(project.id)
    assert filled["sessions"][-1]["versions"][0]["outputId"] == second.id
    outputs.delete(project.id, first.id)
    assert sessions.get(project.id)["sessions"][0]["versions"][0]["outputId"] is None
    third = make_output(outputs, project.id, "Third")
    assert sessions.get(project.id)["sessions"][0]["versions"][0]["outputId"] is None
    assert sessions.get(project.id)["sessions"][-1]["versions"][0]["outputId"] == third.id
    assert outputs.audio_path(project.id, copied.id).read_bytes() == original_bytes
    moved = tmp_path / "moved"
    shutil.move(project.project_path, moved)
    projects.open(moved)
    assert FileVoiceOutputSessions(FileVoiceOutputs(projects)).get(project.id)["sessions"][1]["versions"][0]["outputId"] == second.id


def test_session_api_creates_and_selects_versions_with_revision_fence(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Voice", location=str(tmp_path / "projects")))
    original = make_output(FileVoiceOutputs(projects), project.id, "Original")
    client = TestClient(create_app(project_repository=projects, settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    base = f"/api/projects/{project.id}/voice-output-sessions"
    book = client.get(base).json()
    cloned = client.post(base + "/versions", json={"revision": book["revision"], "sourceOutputId": original.id})
    assert cloned.status_code == 200
    result = cloned.json()
    assert result["output"]["id"] != original.id
    assert result["output"]["parameters"]["voiceOutputVersion"]["sourceOutputId"] == original.id
    assert client.post(base + "/versions", json={"revision": book["revision"], "sourceOutputId": original.id}).status_code == 409
    selected = client.post(base + "/select", json={"revision": result["sessions"]["revision"], "versionId": book["activeVersionId"]})
    assert selected.status_code == 200 and selected.json()["activeVersionId"] == book["activeVersionId"]
    new_session = client.post(base, json={"revision": selected.json()["revision"]})
    assert new_session.status_code == 200 and new_session.json()["sessions"][-1]["versions"][0]["outputId"] is None


def test_version_rejects_invalid_audio_without_publishing_a_copy(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Voice", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    original = make_output(outputs, project.id, "Original")
    sessions = FileVoiceOutputSessions(outputs)
    book = sessions.get(project.id)
    outputs.audio_path(project.id, original.id).write_bytes(b"not a wav")
    with pytest.raises(ValueError, match="WAV"):
        sessions.create_version(project.id, book["revision"], original.id)
    assert [item.id for item in outputs.list(project.id)] == [original.id]
    assert len(sessions.get(project.id)["sessions"][0]["versions"]) == 1
