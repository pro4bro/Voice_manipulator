import json
import wave
from pathlib import Path
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_lipsync_document import setup
from app.domain.models import VoiceOutput, VoiceOutputSegment
from app.domain.lipsync import LipSyncAudio
from app.adapters.lipsync_preflight import prepare_lipsync
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.lipsync_routes import lipsync_router
from app.domain.lipsync_preflight import needs_more_detection


def speech_fixture(tmp_path):
    projects, project, media, asset, store, doc = setup(tmp_path)
    output_id, path = store.outputs.reserve(project.id)
    with wave.open(str(path), "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(b"\0\0" * 240000)
    turns = [VoiceOutputSegment(row_id=f"r{i}", voice_id=f"v{i}", voice_name=f"Actor {i}", speaker_profile_id=f"speaker{i}",
        engine="fixture", generator_id="fixture", text="test turn", start=start, end=end) for i, (start, end) in enumerate(((0, 4), (4, 8)))]
    store.outputs.save(project.id, VoiceOutput(id=output_id, name="Fixture, not generated speech", text="test", voice_id="v0", voice_name="Actor 0", speaker_profile_id="speaker0",
        engine="fixture", generator_id="fixture", duration=10, sample_rate=24000, audio_path=path.relative_to(Path(project.project_path)).as_posix(), segments=turns))
    doc.audio = LipSyncAudio(output_id=output_id, out_point=10)
    return projects, project, media, asset, store, store.save(project.id, doc)


def test_preflight_intersects_turns_and_persists_only_portable_plan_not_render(tmp_path):
    _, project, _, _, store, doc = speech_fixture(tmp_path)
    plan = prepare_lipsync(store, project.id, doc)
    tasks = plan["speechCandidates"]
    assert [(part["speakerProfileId"], part["timelineStart"], part["timelineEnd"], part["sourceStart"]) for part in tasks] == [("speaker0", 1, 4, 2), ("speaker1", 4, 7, 5)]
    assert all(part["faceId"] is None and part["status"] == "requires-face-binding" for part in tasks)
    assert plan["executed"] is False and plan["readyForRender"] is False
    record = store.root(project.id) / "jobs/lipsync" / f"preflight-{plan['id']}.json"
    assert record.is_file() and str(tmp_path) not in record.read_text(encoding="utf-8")
    assert len(plan["inputs"][0]["sha256"]) == 64
    assert plan["id"] == prepare_lipsync(store, project.id, doc)["id"]
    changed = doc.model_copy(deep=True)
    changed.clips[0].start = 2
    with pytest.raises(ScriptRevisionConflict): prepare_lipsync(store, project.id, changed)
    changed = store.save(project.id, changed)
    assert prepare_lipsync(store, project.id, changed)["id"] != plan["id"]


def test_full_source_reports_conflicting_duplicate_audio_anchors_and_api_validation(tmp_path):
    projects, project, media, _, store, doc = speech_fixture(tmp_path)
    doc.clips.append(doc.clips[0].model_copy(update={"id": "duplicate", "start": 4}))
    doc.sync_scope.mode = "source"
    doc = store.save(project.id, doc)
    plan = prepare_lipsync(store, project.id, doc)
    assert any("audio khác nhau" in reason for reason in plan["blockers"])
    app = FastAPI()
    app.include_router(lipsync_router(store.catalog, projects, media, store.outputs))
    client = TestClient(app)
    assert client.get(f"/api/projects/{project.id}/lipsync").json()["revision"] == doc.revision
    response = client.post(f"/api/projects/{project.id}/lipsync/coverage", json=doc.model_dump(by_alias=True))
    assert response.status_code == 200 and len(response.json()["sync"]) == 2
    bad = client.post("/api/lipsync/engines/latentsync-lipsync/settings", json={"parameters": {"bbox_shift": 1}})
    assert bad.status_code == 422
    assert client.post(f"/api/projects/{project.id}/lipsync/preflight", json=doc.model_dump(by_alias=True)).json()["executed"] is False


def test_main_app_registers_lipsync_routes_after_app_creation(tmp_path):
    from dataclasses import replace
    from app.main import create_app
    from app.settings import Settings
    app = create_app(settings=replace(Settings.from_env(), data_root=tmp_path / "app-data"))
    client = TestClient(app)
    assert len(client.get("/api/engine-catalog?task=lip-sync").json()) == 3
    assert client.get("/api/projects/missing/lipsync").status_code == 404
    assert client.post("/api/lipsync/engines/latentsync-lipsync/settings", json={"parameters": {"seed": 3}}).json()["parameters"]["seed"] == 3


def test_preflight_requires_detection_to_cover_sync_source_intervals():
    tasks = [{"assetId": "a", "sourceStart": 2, "sourceEnd": 5}]
    partial = [{"assetId": "a", "sourceStart": 2, "sourceEnd": 3}]
    assert needs_more_detection(tasks, partial)
    assert not needs_more_detection(tasks, partial + [{"assetId": "a", "sourceStart": 3, "sourceEnd": 5}])
