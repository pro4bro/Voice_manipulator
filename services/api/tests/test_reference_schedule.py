import shutil
import json
import wave
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.adapters.reference_schedule_routes import make_reference_schedule_router

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_reference_bindings import FileReferenceBindings
from app.adapters.file_reference_schedules import FileReferenceSchedules
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.file_voice_script import FileVoiceScript
from app.domain.models import MediaAssetCreate, ProjectCreate, VoiceOutput, VoiceOutputSegment
from app.domain.reference_bindings import ReferenceAssignment
from app.domain.reference_schedule import ReferenceScheduleApplyRequest, ReferenceScheduleConflict, ReferenceScheduleRequest, binding_fingerprint
from app.domain.voice_edits import StretchOperation, VoiceEditCommand
from app.domain.voice_script_document import VoiceScriptDocument


def setup(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Reference schedules", location=str(tmp_path / "projects")))
    media, outputs, scripts = FileMediaLibrary(projects), FileVoiceOutputs(projects), FileVoiceScript(projects)
    root = Path(project.project_path)
    assets = []
    for index in range(2):
        path = root / "assets" / f"ref-{index}.wav"
        path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), "wb") as audio:
            audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
            audio.writeframes(b"\x01\x00" * 120000)
        assets.append(media.create(project.id, MediaAssetCreate(name=f"Ref {index}", source_extension=".wav",
            media_kind="audio", source_path=str(path), analysis_path=str(path), origin="import", duration=5,
            reference_selected=True)))
    script = scripts.save(project.id, VoiceScriptDocument.model_validate({"segments": [{"id": "seg"}],
        "rows": [{"id": "r1", "segmentId": "seg", "text": "One two."}]}))
    output_id, audio_path = outputs.reserve(project.id)
    shutil.copy2(root / assets[0].analysis_path, audio_path)
    output = outputs.save(project.id, VoiceOutput(id=output_id, name="fixture", text="one two", voice_id="v",
        voice_name="Voice", speaker_profile_id="s", engine="fixture", generator_id="fixture", duration=5,
        sample_rate=24000, audio_path=audio_path.relative_to(root).as_posix(),
        words=[{"text": "one", "start": 1, "end": 2}, {"text": "two", "start": 3, "end": 4}],
        segments=[VoiceOutputSegment(row_id="r1", voice_id="v", voice_name="Voice", speaker_profile_id="s",
            engine="fixture", generator_id="fixture", text="one two", start=1, end=4)]))
    bindings = FileReferenceBindings(projects, media, outputs, scripts)
    assignment = ReferenceAssignment.model_validate({
        "scope": {"kind": "voice-output", "id": output.id, "revision": output.created_at.isoformat()},
        "expectedRevision": 0,
        "targets": [{"id": "range-a", "start": 1, "end": 2, "wordIndexes": [0], "text": "one"}],
        "sources": [
            {"assetId": assets[0].id, "start": .5, "end": 2, "properties": ["timing", "volume"], "strength": .8, "priority": 2},
            {"assetId": assets[1].id, "start": 1, "end": 3, "properties": ["timing", "volume"], "strength": .5, "priority": 1},
        ],
    })
    binding = bindings.assign(project.id, assignment).bindings[0]
    schedules = FileReferenceSchedules(bindings, scripts)
    return projects, project, media, assets, scripts, outputs, bindings, binding, schedules


def request(binding, *, seed=31, values=False, times=False):
    return ReferenceScheduleRequest(binding_id=binding.id, seed=seed, random_values=values, random_times=times)


def test_four_randomization_modes_are_deterministic_and_cover_target(tmp_path):
    _, project, _, _, _, _, _, binding, store = setup(tmp_path)
    project_id = project.id
    fixed = store.preview(project_id, request(binding))
    assert len(fixed.events) == 2
    assert {event.source_asset_id for event in fixed.events} == {binding.sources[0].asset_id}
    assert all((event.target_start, event.target_end) == (1, 2) for event in fixed.events)

    values = store.preview(project_id, request(binding, values=True))
    assert values == store.preview(project_id, request(binding, values=True))
    assert values.key != store.preview(project_id, request(binding, seed=32, values=True)).key
    reordered = binding.model_copy(update={"sources": list(reversed(binding.sources))})
    assert binding_fingerprint(binding) == binding_fingerprint(reordered)
    assert all(event.source_asset_id in {source.asset_id for source in binding.sources} for event in values.events)

    times = store.preview(project_id, request(binding, times=True))
    assert len(times.events) == 4
    for property_name in {event.property for event in times.events}:
        events = sorted((event for event in times.events if event.property == property_name), key=lambda event: event.target_start)
        assert events[0].target_start == pytest.approx(1)
        assert events[-1].target_end == pytest.approx(2)
        assert all(left.target_end == pytest.approx(right.target_start) for left, right in zip(events, events[1:]))
        assert all(event.target_end - event.target_start >= .25 for event in events)
    both = store.preview(project_id, request(binding, values=True, times=True))
    assert both == store.preview(project_id, request(binding, values=True, times=True))
    assert all(event.applied is False and event.capability == "unsupported" for event in both.events)


def test_schedule_key_ignores_unrelated_binding_and_persisted_seed_survives_reopen(tmp_path):
    projects, project, media, assets, scripts, outputs, bindings, binding, store = setup(tmp_path)
    original = store.preview(project.id, request(binding, values=True, times=True))
    second_assignment = ReferenceAssignment.model_validate({
        "scope": {"kind": "voice-output", "id": binding.scope.id, "revision": binding.scope.revision},
        "expectedRevision": bindings.get(project.id).revision,
        "targets": [{"id": "range-b", "start": 3, "end": 4, "wordIndexes": [1], "text": "two"}],
        "sources": [s.model_dump(by_alias=True) for s in binding.sources],
    })
    bindings.assign(project.id, second_assignment)
    assert store.preview(project.id, request(binding, values=True, times=True)).key == original.key
    applied = ReferenceScheduleApplyRequest(**request(binding, values=True, times=True).model_dump(),
        expected_revision=0, expected_key=original.key)
    saved = store.apply(project.id, applied)
    assert saved.revision == 1 and saved.schedules[0].seed == 31
    moved = tmp_path / "moved-project"
    shutil.move(project.project_path, moved)
    reopened = projects.open(moved)
    reopened_bindings = FileReferenceBindings(projects, media, outputs, scripts)
    reopened_store = FileReferenceSchedules(reopened_bindings, scripts)
    loaded = reopened_store.get(reopened.id)
    assert loaded.revision == 1 and loaded.schedules[0].seed == 31
    assert loaded.schedules[0].key == original.key and loaded.schedules[0].status == "ready"


def test_locks_stale_sources_and_overlapping_timeline_edits_fail_closed(tmp_path):
    projects, project, media, assets, scripts, outputs, bindings, binding, store = setup(tmp_path)
    script = scripts.get(project.id)
    script.settings.locked = ["gainDb"]
    scripts.save(project.id, script)
    with pytest.raises(ReferenceScheduleConflict, match="locked"):
        store.preview(project.id, request(binding, times=True))

    script = scripts.get(project.id)
    script.settings.locked = []
    scripts.save(project.id, script)
    edit_store = store.edits
    edit_store.change(project.id, binding.scope.id, VoiceEditCommand(revision=0, script_revision=scripts.get(project.id).revision,
        action="stretch", operation=StretchOperation(start_frame=36000, end_frame=48000, target_frames=24000)))
    with pytest.raises(ReferenceScheduleConflict, match="reassign"):
        store.preview(project.id, request(binding))

    # Restore an untouched source binding and prove GET reports freshness loss.
    edit_path = outputs.audio_path(project.id, binding.scope.id).parent / "edits.json"
    edit_path.unlink()
    preview = store.preview(project.id, request(binding))
    saved = store.apply(project.id, ReferenceScheduleApplyRequest(**request(binding).model_dump(),
        expected_revision=0, expected_key=preview.key))
    source_audio = media.resolve_audio_path(project.id, assets[0].id)
    source_audio.write_bytes(b"changed")
    stale = FileReferenceSchedules(bindings, scripts).get(project.id)
    assert stale.schedules[0].status == "stale"
    assert "binding" in stale.schedules[0].status_reason.lower()
    assert saved.revision == 1


def test_apply_uses_optimistic_revision_and_untimed_target_is_rejected(tmp_path):
    _, project, _, _, _, _, bindings, binding, store = setup(tmp_path)
    plan = store.preview(project.id, request(binding))
    command = ReferenceScheduleApplyRequest(**request(binding).model_dump(), expected_revision=0, expected_key=plan.key)
    store.apply(project.id, command)
    with pytest.raises(ReferenceScheduleConflict, match="another window"):
        store.apply(project.id, command)
    script = store.scripts.get(project.id)
    untimed = ReferenceAssignment.model_validate({
        "scope": {"kind": "script", "id": project.id, "revision": str(script.revision)},
        "expectedRevision": bindings.get(project.id).revision,
        "targets": [{"id": "row", "rowIds": ["r1"], "text": "One two."}],
        "sources": [source.model_dump(by_alias=True) for source in binding.sources],
    })
    text_binding = next(item for item in bindings.assign(project.id, untimed).bindings if item.scope.kind == "script")
    with pytest.raises(ReferenceScheduleConflict, match="timed target"):
        store.preview(project.id, request(text_binding))


def test_corrupt_saved_event_is_not_returned_as_a_ready_schedule(tmp_path):
    _, project, _, _, _, _, _, binding, store = setup(tmp_path)
    plan = store.preview(project.id, request(binding))
    store.apply(project.id, ReferenceScheduleApplyRequest(**request(binding).model_dump(), expected_revision=0, expected_key=plan.key))
    path = store._path(project.id)
    document = json.loads(path.read_text(encoding="utf-8"))
    document["schedules"][0]["events"][0]["targetEnd"] += 1
    path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(ValueError, match="integrity"):
        store.get(project.id)


def test_schedule_http_preview_apply_reopen_keeps_seed_and_events(tmp_path):
    _, project, _, _, scripts, _, bindings, binding, _store = setup(tmp_path)
    app = FastAPI(); app.include_router(make_reference_schedule_router(bindings, scripts))
    endpoint = f"/api/projects/{project.id}/reference-schedules"
    payload = {"bindingId": binding.id, "seed": 42, "randomValues": True, "randomTimes": True}
    with TestClient(app) as client:
        preview = client.post(endpoint + "/preview", json=payload)
        assert preview.status_code == 200, preview.text
        assert not client.get(endpoint).json()["schedules"]
        applied = client.post(endpoint, json={**payload, "expectedRevision": 0, "expectedKey": preview.json()["key"]})
        assert applied.status_code == 200, applied.text
        assert client.get(endpoint).json()["schedules"][0] == applied.json()["schedules"][0]
        assert client.post(endpoint, json={**payload, "expectedRevision": 0, "expectedKey": preview.json()["key"]}).status_code == 409
        assert all(not event["applied"] for event in preview.json()["events"])


def test_production_app_registers_all_round_routes(tmp_path):
    from dataclasses import replace
    from app.main import create_app
    from app.settings import Settings
    projects, project, _, _, scripts, _, _, binding, _ = setup(tmp_path)
    app = create_app(project_repository=projects, settings=replace(Settings.from_env(), data_root=tmp_path / "app-data"))
    client = TestClient(app)
    prefix = f"/api/projects/{project.id}"
    assert client.get(prefix + "/reference-schedules").status_code == 200
    assert client.post("/api/voice-script/delivery-capabilities", json=scripts.get(project.id).model_dump(by_alias=True)).status_code == 200
    assert client.get(prefix + f"/voice-outputs/{binding.scope.id}/edit").status_code == 200
    assert client.get(prefix + f"/voice-outputs/{binding.scope.id}/render").status_code == 404
