import shutil
import wave
from pathlib import Path
import pytest
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.file_reference_bindings import FileReferenceBindings
from app.domain.models import MediaAssetCreate, ProjectCreate, VoiceOutput, VoiceOutputSegment
from app.domain.voice_script_document import VoiceScriptDocument
from app.domain.reference_bindings import ReferenceAssignment


def fixture(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="References", location=str(tmp_path / "projects")))
    media, outputs, scripts = FileMediaLibrary(projects), FileVoiceOutputs(projects), FileVoiceScript(projects)
    root = Path(project.project_path)
    refs = []
    for i in range(2):
        path = root / "assets" / f"ref-{i}.wav"
        path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), "wb") as audio:
            audio.setparams((1, 2, 24000, 0, "NONE", "not compressed")); audio.writeframes(b"\x01\x00" * 120000)
        refs.append(media.create(project.id, MediaAssetCreate(name=f"Ref {i}", source_extension=".wav", media_kind="audio",
            source_path=str(path), analysis_path=str(path), origin="import", duration=5, reference_selected=True)))
    script = scripts.save(project.id, VoiceScriptDocument.model_validate({"segments": [{"id": "seg"}],
        "rows": [{"id": "r1", "segmentId": "seg", "text": "Hello 🙂 world."}]}))
    output_id, audio_path = outputs.reserve(project.id)
    shutil.copy2(root / refs[0].analysis_path, audio_path)
    output = outputs.save(project.id, VoiceOutput(id=output_id, name="PCM fixture, not TTS", text="one two", voice_id="v", voice_name="Voice", speaker_profile_id="s", engine="fixture", generator_id="fixture", duration=5, sample_rate=24000,
        audio_path=audio_path.relative_to(root).as_posix(), words=[{"text": "one", "start": 1, "end": 2}, {"text": "two", "start": 3, "end": 4}],
        segments=[VoiceOutputSegment(row_id="r1", voice_id="v", voice_name="Voice", speaker_profile_id="s", engine="fixture", generator_id="fixture", text="one two", start=1, end=4)]))
    store = FileReferenceBindings(projects, media, outputs, scripts)
    payload = {"scope": {"kind": "voice-output", "id": output.id, "revision": output.created_at.isoformat()}, "expectedRevision": 0,
        "targets": [{"id": "range-a", "start": 1, "end": 2, "wordIndexes": [0], "text": "one"}, {"id": "range-b", "start": 3, "end": 4, "wordIndexes": [1], "text": "two"}],
        "sources": [{"assetId": refs[0].id, "start": .5, "end": 2, "properties": ["timing", "volume"], "strength": .8, "priority": 2},
                    {"assetId": refs[1].id, "start": 1, "end": 3, "properties": ["emotion", "whisper"], "strength": .5, "priority": 1}]}
    return projects, project, media, refs, scripts, script, store, payload


def test_multi_range_source_mapping_is_atomic_portable_and_idempotent(tmp_path):
    projects, project, media, refs, _, _, store, payload = fixture(tmp_path)
    first = store.assign(project.id, ReferenceAssignment.model_validate(payload))
    assert first.revision == 1 and len(first.bindings) == 2
    assert [(binding.target.start, binding.target.end) for binding in first.bindings] == [(1, 2), (3, 4)]
    assert all(binding.status == "requested" and binding.sources[0].properties == ["timing", "volume"] for binding in first.bindings)
    payload["expectedRevision"] = 1
    second = store.assign(project.id, ReferenceAssignment.model_validate(payload))
    assert [binding.id for binding in second.bindings] == [binding.id for binding in first.bindings]
    media.set_reference_selected_many(project.id, [refs[0].id], False)
    moved = tmp_path / "moved"
    shutil.move(project.project_path, moved); projects.open(moved)
    reopened = FileReferenceBindings(projects, media, store.outputs, store.scripts).get(project.id)
    assert len(reopened.bindings) == 2 and reopened.bindings[0].warnings
    assert reopened.bindings[0].sources[0].audio_sha256 == first.bindings[0].sources[0].audio_sha256


def test_stale_or_invalid_target_cannot_partially_assign(tmp_path):
    _, project, _, _, _, _, store, payload = fixture(tmp_path)
    payload["targets"][1]["end"] = 6
    with pytest.raises(ValueError): store.assign(project.id, ReferenceAssignment.model_validate(payload))
    assert store.get(project.id).revision == 0
    payload["targets"][1]["end"] = 4
    store.assign(project.id, ReferenceAssignment.model_validate(payload))
    with pytest.raises(ScriptRevisionConflict): store.assign(project.id, ReferenceAssignment.model_validate(payload))
    assert store.get(project.id).revision == 1


def test_script_utf16_text_span_and_changed_target_are_checked(tmp_path):
    _, project, _, _, scripts, script, store, payload = fixture(tmp_path)
    payload["scope"] = {"kind": "script", "id": project.id, "revision": str(script.revision)}
    payload["targets"] = [{"id": "text-r1", "rowIds": ["r1"], "textRanges": [{"rowId": "r1", "start": 6, "end": 8}], "text": "🙂"}]
    saved = store.assign(project.id, ReferenceAssignment.model_validate(payload))
    assert saved.bindings[0].target.text == "🙂"
    script.rows[0].text = "Other words."
    scripts.save(project.id, script)
    assert store.get(project.id).bindings[0].status == "stale"


def test_changed_or_missing_source_remains_visible_and_path_traversal_is_rejected(tmp_path):
    _, project, media, refs, _, _, store, payload = fixture(tmp_path)
    store.assign(project.id, ReferenceAssignment.model_validate(payload))
    audio = media.resolve_audio_path(project.id, refs[0].id)
    audio.write_bytes(b"changed")
    assert store.get(project.id).bindings[0].status == "stale"
    audio.unlink()
    assert store.get(project.id).bindings[0].status == "missing"
    payload["scope"]["id"] = "../../outside"
    with pytest.raises(ValueError): ReferenceAssignment.model_validate(payload)


def test_many_targets_load_each_output_revision_once_per_snapshot(tmp_path, monkeypatch):
    _, project, _, _, _, _, store, payload = fixture(tmp_path)
    loaded = []
    get = store.outputs.get
    def counted(project_id, output_id):
        loaded.append(output_id)
        return get(project_id, output_id)
    monkeypatch.setattr(store.outputs, "get", counted)
    store.assign(project.id, ReferenceAssignment.model_validate(payload))
    # One planning snapshot and one post-commit availability snapshot.
    # audio_path also validates the same output record, so allow two reads each.
    assert len(loaded) <= 4


def test_reassigning_same_sentence_after_a_script_save_updates_its_binding_in_place(tmp_path):
    _, project, _, _, scripts, script, store, payload = fixture(tmp_path)
    payload["scope"] = {"kind": "script", "id": project.id, "revision": str(script.revision)}
    payload["targets"] = [{"id": "sentence-r1", "rowIds": ["r1"], "text": script.rows[0].text}]
    first = store.assign(project.id, ReferenceAssignment.model_validate(payload))
    script.settings.note = "New direction on the clip"
    saved = scripts.save(project.id, script)
    payload["scope"]["revision"] = str(saved.revision)
    payload["expectedRevision"] = first.revision
    second = store.assign(project.id, ReferenceAssignment.model_validate(payload))
    assert len(second.bindings) == 1
    assert second.bindings[0].id == first.bindings[0].id
    assert second.bindings[0].scope.revision == str(saved.revision)

def test_delete_is_revision_checked_and_preserves_other_targets_and_sources(tmp_path):
    _, project, media, refs, _, _, store, payload = fixture(tmp_path)
    first = store.assign(project.id, ReferenceAssignment.model_validate(payload))
    with pytest.raises(ScriptRevisionConflict): store.delete(project.id, first.bindings[0].id, 0)
    assert len(store.get(project.id).bindings) == 2
    saved = store.delete(project.id, first.bindings[0].id, first.revision)
    assert saved.revision == 2
    assert [binding.id for binding in saved.bindings] == [first.bindings[1].id]
    assert media.resolve_audio_path(project.id, refs[0].id).is_file()
