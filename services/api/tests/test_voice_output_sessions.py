import hashlib
import json
import shutil
import wave
from dataclasses import replace
from pathlib import Path

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_output_sessions import FileVoiceOutputSessions
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.file_voice_edits import FileVoiceEdits
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.domain.models import ProjectCreate, VoiceOutput
from app.domain.voice_script_document import ScriptSegment, ScriptSentence, VoiceScriptDocument
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
    edits.change(project.id, copied.id, VoiceEditCommand(revision=0, script_revision=edits.scripts.get(project.id).revision, action="stretch",
        operation=StretchOperation(start_frame=0, end_frame=1000, target_frames=1200)))
    assert edits.get(project.id, copied.id).revision == 1
    assert edits.get(project.id, first.id).revision == 0
    with pytest.raises(ScriptRevisionConflict):
        sessions.create_version(project.id, book["revision"], first.id)
    blank = sessions.create_session(project.id, cloned_book["revision"])
    assert blank["sessions"][-1]["versions"][0]["outputId"] is None
    second = make_output(outputs, project.id, "Second")
    state = sessions.state(project.id, blank["activeVersionId"])
    filled = sessions.publish(project.id, blank["activeVersionId"], state.revision, second, state.script, state.config, full=True)
    assert filled["sessions"][-1]["versions"][0]["outputId"] == second.id
    outputs.delete(project.id, first.id)
    assert sessions.get(project.id)["sessions"][0]["versions"][0]["outputId"] == first.id
    third = make_output(outputs, project.id, "Third")
    assert sessions.get(project.id)["sessions"][0]["versions"][0]["outputId"] == first.id
    assert len(sessions.get(project.id)["sessions"]) == 2  # uncommitted artifacts never invent Sessions
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


def test_version_state_api_validates_saved_script_active_slot_and_revision(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Version state API", location=str(tmp_path / "projects")))
    make_output(FileVoiceOutputs(projects), project.id, "Original")
    client = TestClient(create_app(project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    base = f"/api/projects/{project.id}/voice-output-sessions"
    book = client.get(base).json()
    version = book["sessions"][0]["versions"][0]
    version_id = version["id"]
    state = version["state"]
    state_url = base + f"/versions/{version_id}/state"

    missing_revision = client.put(state_url, json={"script": state["script"], "config": {}})
    assert missing_revision.status_code == 422
    negative_revision = client.put(state_url, json={"revision": -1, "script": state["script"], "config": {}})
    assert negative_revision.status_code == 422

    unsaved_script = _version_script(state["script"]["revision"], "Not saved to Script")
    rejected_unsaved = client.put(state_url, json={"revision": state["revision"],
        "script": unsaved_script.model_dump(by_alias=True), "config": {"speed": 1.25}})
    assert rejected_unsaved.status_code == 409

    saved = client.put(state_url, json={"revision": state["revision"],
        "script": state["script"], "config": {"speed": 1.25, "generationEngine": "omnivoice"}})
    assert saved.status_code == 200
    saved_state = next(item for item in saved.json()["sessions"][0]["versions"] if item["id"] == version_id)["state"]
    assert saved_state["revision"] == state["revision"] + 1
    assert saved_state["config"] == {"speed": 1.25, "generationEngine": "omnivoice"}
    stale = client.put(state_url, json={"revision": state["revision"],
        "script": state["script"], "config": {"speed": 1.5}})
    assert stale.status_code == 409

    new_slot = client.post(base, json={"revision": saved.json()["revision"]})
    assert new_slot.status_code == 200
    inactive = client.put(state_url, json={"revision": saved_state["revision"],
        "script": saved_state["script"], "config": saved_state["config"]})
    assert inactive.status_code == 409


def test_full_generation_request_requires_captured_version_and_whole_script(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Full request validation", location=str(tmp_path / "projects")))
    scripts = FileVoiceScript(projects)
    script = scripts.save(project.id, VoiceScriptDocument(segments=[ScriptSegment(id="segment-1")], rows=[
        ScriptSentence(id="row-1", text="hello world", voice_id="unregistered-but-not-planned", segment_id="segment-1")
    ]))
    client = TestClient(create_app(project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    session_url = f"/api/projects/{project.id}/voice-output-sessions"
    book = client.get(session_url).json()
    version = book["sessions"][0]["versions"][0]
    request_url = f"/api/projects/{project.id}/voice-script/read"
    base = {"versionId": version["id"], "versionRevision": version["state"]["revision"],
        "scriptRevision": script.revision, "gapSeconds": 0,
        "rows": [{"id": "row-1", "voiceId": "unregistered-but-not-planned", "text": "hello world",
                  "segmentId": "segment-1"}]}

    missing_force = client.post(request_url, json=base)
    assert missing_force.status_code == 400 and "toàn bộ" in missing_force.json()["detail"].lower()
    partial_full = client.post(request_url, json={**base, "forceRegenerate": True,
        "rows": [{"id": "other-row", "voiceId": "unregistered-but-not-planned", "text": "hello world"}]})
    assert partial_full.status_code == 400 and "toàn bộ" in partial_full.json()["detail"].lower()
    stale_script = client.post(request_url, json={**base, "forceRegenerate": True,
        "scriptRevision": script.revision - 1})
    assert stale_script.status_code == 409


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


@pytest.mark.parametrize("slot_kind", ["session", "version"])
def test_disabled_active_slot_rejects_state_audio_and_clone_mutations(tmp_path, slot_kind):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Disabled slots", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    original = make_output(outputs, project.id, "Original")
    original_path = outputs.audio_path(project.id, original.id)
    original_bytes = original_path.read_bytes()
    sessions = FileVoiceOutputSessions(outputs)
    book = sessions.get(project.id)
    session_id, version_id = book["activeSessionId"], book["activeVersionId"]
    state = sessions.state(project.id, version_id)
    slot_id = session_id if slot_kind == "session" else version_id

    disabled = sessions.slot_action(project.id, book["revision"], slot_id, "disable")
    assert disabled["activeSessionId"] is None and disabled["activeVersionId"] is None
    assert sessions.find(disabled, version_id)[0 if slot_kind == "session" else 1]["disabled"]

    candidate = make_output(outputs, project.id, "Uncommitted candidate")
    with pytest.raises(ScriptRevisionConflict, match="Disable"):
        sessions.publish(project.id, version_id, state.revision, candidate, state.script,
            state.config, full=True)
    with pytest.raises(ScriptRevisionConflict):
        sessions.save_state(project.id, version_id, state.revision, state.script, state.config)

    output_ids_before_clone = {item.id for item in outputs.list(project.id)}
    with pytest.raises(ValueError):
        sessions.create_version(project.id, disabled["revision"], source_version_id=version_id)
    with pytest.raises(ValueError, match="Disable"):
        sessions.select(project.id, disabled["revision"], version_id)
    after = sessions.get(project.id)
    assert len(after["sessions"]) == 1
    assert len(after["sessions"][0]["versions"]) == 1
    assert {item.id for item in outputs.list(project.id)} == output_ids_before_clone
    assert sessions.state(project.id, version_id).output_id == original.id
    assert original_path.read_bytes() == original_bytes


def test_adopt_external_output_creates_only_requested_version_and_preserves_paths(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Adopt external output", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    original = make_output(outputs, project.id, "Existing managed output")
    client = TestClient(create_app(project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    base = f"/api/projects/{project.id}/voice-output-sessions"
    initial = client.get(base).json()

    unrelated_raw = make_output(outputs, project.id, "Unrelated processor intermediate")
    final = make_output(outputs, project.id, "Processor result")
    final_audio = outputs.audio_path(project.id, final.id)
    final_bytes = final_audio.read_bytes()
    response = client.post(base + "/adopt", json={"revision": initial["revision"], "outputId": final.id})

    assert response.status_code == 200
    body = response.json()
    assert body["output"]["id"] == final.id
    assert body["output"]["audioPath"] == f"assets/voice-output/{final.id}/audio.wav"
    sessions = body["sessions"]["sessions"]
    assert len(sessions) == 2
    adopted = next(session for session in sessions if session["id"] == body["sessions"]["activeSessionId"])
    assert len(adopted["versions"]) == 1
    state = adopted["versions"][0]["state"]
    assert state["outputId"] == final.id
    assert {clip["outputId"] for layer in state["composition"]["layers"] for clip in layer["clips"]} == {final.id}
    assert unrelated_raw.id not in state["ownedOutputIds"]
    assert original.id not in state["ownedOutputIds"]
    assert final_audio.read_bytes() == final_bytes


def test_adopt_existing_output_selects_its_version_and_disabled_mapping_rejects(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Adopt existing output", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    original = make_output(outputs, project.id, "Managed output")
    client = TestClient(create_app(project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    base = f"/api/projects/{project.id}/voice-output-sessions"
    book = client.get(base).json()
    existing_version = book["activeVersionId"]
    new_blank = client.post(base, json={"revision": book["revision"]}).json()
    before_count = sum(len(session["versions"]) for session in new_blank["sessions"])

    adopted = client.post(base + "/adopt", json={"revision": new_blank["revision"], "outputId": original.id})
    assert adopted.status_code == 200
    selected = adopted.json()["sessions"]
    assert selected["activeVersionId"] == existing_version
    assert sum(len(session["versions"]) for session in selected["sessions"]) == before_count
    disabled = client.post(base + "/slots", json={"revision": selected["revision"],
        "id": existing_version, "kind": "disable"})
    assert disabled.status_code == 200
    before_rejected = client.get(base).json()
    rejected = client.post(base + "/adopt", json={"revision": before_rejected["revision"], "outputId": original.id})
    assert rejected.status_code == 409
    assert client.get(base).json() == before_rejected


def test_adopt_invalid_or_missing_output_does_not_mutate_session_book(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Invalid adoption", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    invalid = make_output(outputs, project.id, "Truncated WAV")
    client = TestClient(create_app(project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    base = f"/api/projects/{project.id}/voice-output-sessions"
    book = client.get(base).json()
    # Keep the session snapshot fixed, then damage only the external audio.
    session_path = Path(projects.get(project.id).project_path) / "scripts" / "voice-output-sessions.json"
    original_state = session_path.read_bytes()
    outputs.audio_path(project.id, invalid.id).write_bytes(b"RIFF")

    rejected = client.post(base + "/adopt", json={"revision": book["revision"], "outputId": invalid.id})
    missing = client.post(base + "/adopt", json={"revision": book["revision"], "outputId": "missing-output"})
    assert rejected.status_code == 400
    assert missing.status_code == 404
    assert session_path.read_bytes() == original_state


def _version_script(revision=0, text="First version text"):
    return VoiceScriptDocument(revision=revision,
        segments=[ScriptSegment(id="segment-1", name="Narration")],
        rows=[ScriptSentence(id="row-1", text=text, voice_id="voice", speaker_profile_id="speaker",
            segment_id="segment-1")])


def test_empty_project_get_creates_one_initial_version_with_existing_script(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Empty Voice Output", location=str(tmp_path / "projects")))
    scripts = FileVoiceScript(projects)
    saved_script = scripts.save(project.id, _version_script(scripts.get(project.id).revision, "Saved before first Output"))
    sessions = FileVoiceOutputSessions(FileVoiceOutputs(projects), scripts)

    book = sessions.get(project.id)
    version_id = book["activeVersionId"]
    state = sessions.state(project.id, version_id)
    assert len(book["sessions"]) == 1 and len(book["sessions"][0]["versions"]) == 1
    assert book["sessions"][0]["versions"][0]["outputId"] is None
    assert state.output_id is None and state.composition is None
    assert state.script == saved_script
    reopened = FileVoiceOutputSessions(FileVoiceOutputs(projects), FileVoiceScript(projects)).get(project.id)
    assert reopened["activeVersionId"] == version_id and len(reopened["sessions"]) == 1


def test_version_script_config_and_sidecars_restore_after_clone_and_select(tmp_path):
    from app.domain.reference_bindings import (
        ReferenceBinding, ReferenceBindingDocument, ReferenceScope, ReferenceSource, ReferenceTarget,
    )

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Version state", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    original = make_output(outputs, project.id, "Original")
    original_bytes = outputs.audio_path(project.id, original.id).read_bytes()
    original_hash = hashlib.sha256(original_bytes).hexdigest()
    scripts = FileVoiceScript(projects)
    sessions = FileVoiceOutputSessions(outputs, scripts)
    scripts.after_save = sessions.capture_active_script

    book = sessions.get(project.id)
    assert len(book["sessions"]) == 1
    version_a = book["activeVersionId"]
    script_a = scripts.save(project.id, _version_script(scripts.get(project.id).revision, "A distinct row text"))
    config_a = {"generatorParameters": {"omni": {"temperature": 0.4}}, "speed": 1.1,
        "gain": -2, "generationEngine": "omnivoice"}
    state_a = sessions.state(project.id, version_a)
    bindings = ReferenceBindingDocument(revision=5, bindings=[ReferenceBinding(
        id="binding-a", scope=ReferenceScope(kind="voice-output", id=original.id,
            revision=original.created_at.isoformat()),
        target=ReferenceTarget(id="target-a", row_ids=["row-1"], text="A distinct row text"),
        sources=[ReferenceSource(asset_id="asset-ref", start=0, end=0.05, properties=["volume"],
            audio_sha256="ref-sha", name="Reference")],
    )])
    sidecar_root = sessions.root(project.id) / "scripts"
    sidecar_root.mkdir(parents=True, exist_ok=True)
    (sidecar_root / "reference-bindings.json").write_text(
        bindings.model_dump_json(by_alias=True), encoding="utf-8")
    plan_a = {"version": 1, "revision": 7, "plans": [{"rowId": "row-1", "planId": "plan-a", "budget": 0.75}]}
    (sidecar_root / "timing-plans.json").write_text(json.dumps(plan_a), encoding="utf-8")
    sessions.save_state(project.id, version_a, state_a.revision, script_a, config_a)

    # Clone copies the Script/config snapshots and all immutable audio refs into
    # independent output IDs, while the sidecar's output scope follows the clone.
    saved_book = sessions.get(project.id)
    cloned_book, clone_output = sessions.create_version(project.id, saved_book["revision"], source_version_id=version_a)
    version_b = cloned_book["activeVersionId"]
    assert clone_output is not None and clone_output.id != original.id
    state_b = sessions.state(project.id, version_b)
    assert state_b.script.model_copy(update={"revision": script_a.revision}) == script_a
    assert state_b.config == config_a
    assert state_b.output_id == clone_output.id
    assert state_b.composition["layers"][0]["clips"][0]["outputId"] == clone_output.id
    clone_bindings = ReferenceBindingDocument.model_validate_json((sidecar_root / "reference-bindings.json").read_text(encoding="utf-8"))
    assert clone_bindings.revision == 6
    assert clone_bindings.bindings[0].scope.id == clone_output.id
    assert clone_bindings.bindings[0].scope.revision == clone_output.created_at.isoformat()
    assert json.loads((sidecar_root / "timing-plans.json").read_text(encoding="utf-8"))["plans"] == plan_a["plans"]

    config_b = {"generatorParameters": {"omni": {"temperature": 0.8}}, "speed": 0.9,
        "gain": 1, "generationEngine": "omnivoice-expressive"}
    script_b = scripts.save(project.id, _version_script(scripts.get(project.id).revision, "B has separate text"))
    state_b = sessions.state(project.id, version_b)
    sessions.save_state(project.id, version_b, state_b.revision, script_b, config_b)

    # Checkout restores each Version's state snapshot and sidecars. A fresh
    # manager models application restart against the same portable project.
    book = sessions.select(project.id, sessions.get(project.id)["revision"], version_a)
    assert sessions.state(project.id, version_a).config == config_a
    assert sessions.state(project.id, version_a).script.rows[0].text == "A distinct row text"
    assert scripts.get(project.id).rows[0].text == "A distinct row text"
    restored_a = ReferenceBindingDocument.model_validate_json((sidecar_root / "reference-bindings.json").read_text(encoding="utf-8"))
    assert restored_a.bindings[0].scope.id == original.id
    assert restored_a.bindings[0].scope.revision == original.created_at.isoformat()
    book = sessions.select(project.id, book["revision"], version_b)
    assert scripts.get(project.id).rows[0].text == "B has separate text"
    reopened = FileVoiceOutputSessions(outputs, scripts)
    active = reopened.get(project.id)
    assert active["activeVersionId"] == version_b
    restored_b = reopened.state(project.id, version_b)
    assert restored_b.config == config_b
    assert restored_b.script.rows[0].text == "B has separate text"
    clone_sidecar = ReferenceBindingDocument.model_validate_json((sidecar_root / "reference-bindings.json").read_text(encoding="utf-8"))
    assert clone_sidecar.bindings[0].scope.id == clone_output.id
    assert outputs.audio_path(project.id, original.id).read_bytes() == original_bytes
    assert hashlib.sha256(outputs.audio_path(project.id, original.id).read_bytes()).hexdigest() == original_hash


def test_full_publish_replaces_only_selected_version_composition(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Full ownership", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    original = make_output(outputs, project.id, "Original")
    sessions = FileVoiceOutputSessions(outputs)
    book = sessions.get(project.id)
    version_a = book["activeVersionId"]
    cloned_book, clone_output = sessions.create_version(project.id, book["revision"], source_version_id=version_a)
    version_b = cloned_book["activeVersionId"]
    assert clone_output is not None
    source_bytes = outputs.audio_path(project.id, original.id).read_bytes()
    replacement = make_output(outputs, project.id, "New Full")
    state_b = sessions.state(project.id, version_b)
    published = sessions.publish(project.id, version_b, state_b.revision, replacement,
        state_b.script, state_b.config, full=True)
    current = sessions.state(project.id, version_b)
    untouched = sessions.state(project.id, version_a)
    assert current.output_id == replacement.id
    assert current.composition["layers"][0]["clips"][0]["outputId"] == replacement.id
    assert untouched.output_id == original.id
    assert untouched.composition["layers"][0]["clips"][0]["outputId"] == original.id
    assert outputs.audio_path(project.id, original.id).read_bytes() == source_bytes
    assert len(published["sessions"][0]["versions"]) == 2


def test_legacy_edit_journal_is_baked_into_a_valid_owned_version_preview(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Legacy stretch", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    source = make_output(outputs, project.id, "Legacy")
    source_path = outputs.audio_path(project.id, source.id)
    source_bytes = source_path.read_bytes()
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    scripts = FileVoiceScript(projects)
    edits = FileVoiceEdits(outputs, scripts)
    edits.change(project.id, source.id, VoiceEditCommand(revision=0, script_revision=scripts.get(project.id).revision,
        action="stretch", operation=StretchOperation(start_frame=0, end_frame=1200, target_frames=1500)))

    # First read performs the existing-output adoption/migration path.
    sessions = FileVoiceOutputSessions(outputs, scripts)
    book = sessions.get(project.id)
    version_id = book["activeVersionId"]
    state = sessions.state(project.id, version_id)
    assert state.output_id != source.id
    assert source.id in state.owned_output_ids and state.output_id in state.owned_output_ids
    migrated = outputs.get(project.id, state.output_id)
    assert migrated.parameters["voiceVersionMigration"]["sourceOutputId"] == source.id
    assert migrated.audio_path == f"assets/voice-output/{state.output_id}/audio.wav"
    with wave.open(str(outputs.audio_path(project.id, source.id)), "rb") as original_pcm:
        assert original_pcm.getnframes() == 2400
    with wave.open(str(outputs.audio_path(project.id, state.output_id)), "rb") as migrated_pcm:
        assert (migrated_pcm.getnchannels(), migrated_pcm.getsampwidth(), migrated_pcm.getframerate()) == (1, 2, 24000)
        assert migrated_pcm.getnframes() == 2700
        assert len(migrated_pcm.readframes(2700)) == 5400
    assert source_path.read_bytes() == source_bytes
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source_hash
    again = sessions.get(project.id)
    assert again["activeVersionId"] == version_id
    assert sessions.state(project.id, version_id).output_id == state.output_id
    assert len(outputs.list(project.id)) == 2
