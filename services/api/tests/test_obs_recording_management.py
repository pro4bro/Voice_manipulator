import asyncio
import json
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.obs_livelink_audio import FileObsLiveLinkAudio
from app.adapters.obs_livelink_connection import LiveLinkError, ObsLiveLinkConnection
from app.adapters.obs_livelink_deletions import deleted_recording_ids
from app.adapters.obs_livelink_detailed_stt import ObsLiveLinkDetailedStt
from app.adapters.obs_livelink_runtime import ObsLiveLinkRuntime
from app.adapters.obs_recording_management import make_obs_recording_management_router
from app.domain.models import MediaAssetCreate, ProjectCreate
from app.domain.obs_livelink_state import ObsCaptureRecording
from app.adapters.file_project_repository import FileProjectRepository


@pytest.fixture
def obs_project(tmp_path):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="OBS journal management"))
    pairing = tmp_path / "pairing.json"
    install_id = str(uuid4())
    token = "Bearer " + "x" * 40
    pairing.write_text(json.dumps({"installId": install_id, "token": "x" * 40}))
    connection = ObsLiveLinkConnection(pairing)
    runtime = ObsLiveLinkRuntime(connection, projects, tmp_path / "machine")
    media = FileMediaLibrary(projects)
    audio = FileObsLiveLinkAudio(connection, runtime, projects, media, None)
    detailed_stt = ObsLiveLinkDetailedStt(media, object())
    hello = {"installId": install_id, "processInstanceId": str(uuid4()),
             "pluginVersion": "0.4.0", "obsVersion": "32.2.2",
             "protocolMin": 3, "protocolMax": 3, "channels": []}
    snapshot = runtime.sync(hello, connection.hello(token, hello))
    runtime.sync_current(connection.claim(project_id=project.id, project_name=project.name, owner_id="owner"))
    app = FastAPI()
    app.include_router(make_obs_recording_management_router(
        projects, runtime, media, detailed_stt, audio,
    ))
    client = TestClient(app)
    return tmp_path, projects, project, runtime, media, audio, detailed_stt, client, token, hello, snapshot


def write_stopped_journal(project, recording_id, *, status="stopped", archive_status="error"):
    folder = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder.mkdir(parents=True)
    journal = {"protocolVersion": 3, "recording": {
        "recordingId": recording_id, "projectId": project.id, "status": status,
        "connectionId": "test-connection", "archiveStatus": archive_status, "startedMonotonicNs": 1,
        "endedMonotonicNs": 2,
    }, "channels": []}
    (folder / "recording.json").write_text(json.dumps(journal), encoding="utf-8")
    return folder


def url(project, recording_id):
    return f"/api/projects/{project.id}/obs-livelink/recordings/{recording_id}"


def test_stopped_failed_journal_recycles_restores_and_permanently_tombstones_without_resurrection(obs_project):
    _, _, project, runtime, _, _, _, client, token, hello, snapshot = obs_project
    recording_id = str(uuid4())
    folder = write_stopped_journal(project, recording_id)
    pcm = folder / "channels" / "channel" / "chunks" / "000000000000.pcm"
    pcm.parent.mkdir(parents=True)
    pcm.write_bytes(b"retained PCM")
    (folder / "detailed-stt-state.json").write_text(json.dumps({
        "version": 1, "recordingId": recording_id, "segmentSeconds": 60,
        "model": "large-v3", "tracks": {},
    }), encoding="utf-8")
    response = client.post(url(project, recording_id) + "/recycle")
    assert response.status_code == 200, response.text
    deleted_at = response.json()["deletedAt"]
    assert deleted_at
    assert json.loads((folder / "recording.json").read_text())["deletedAt"] == deleted_at
    assert pcm.read_bytes() == b"retained PCM"
    stale_recording = ObsCaptureRecording.model_validate(
        json.loads((folder / "recording.json").read_text())["recording"])
    runtime._state = runtime._state.model_copy(update={"completed_recordings": [stale_recording]})
    runtime._persist()
    assert runtime.status()["recentRecordings"] == []
    assert json.loads((folder / "recording.json").read_text())["deletedAt"] == deleted_at

    restored = client.post(url(project, recording_id) + "/restore")
    assert restored.status_code == 200, restored.text
    assert restored.json()["deletedAt"] is None
    assert "deletedAt" not in json.loads((folder / "recording.json").read_text())
    assert pcm.read_bytes() == b"retained PCM"

    assert client.post(url(project, recording_id) + "/recycle").status_code == 200
    removed = client.delete(url(project, recording_id))
    assert removed.status_code == 200, removed.text
    assert recording_id in deleted_recording_ids(Path(project.project_path))
    assert not folder.exists()
    assert client.post(url(project, recording_id) + "/restore").status_code == 404
    # A stale machine/outbox recovery may replay the old journal after the
    # folder is copied back; the existing permanent tombstone still fences it.
    folder.mkdir(parents=True)
    (folder / "recording.json").write_text(json.dumps({"recording": {
        "recordingId": recording_id, "projectId": project.id,
        "connectionId": snapshot["connectionId"], "status": "stopped",
        "archiveStatus": "error", "startedMonotonicNs": 1, "endedMonotonicNs": 2,
    }, "channels": []}), encoding="utf-8")
    assert client.post(url(project, recording_id) + "/restore").status_code == 404
    with pytest.raises(LiveLinkError, match="permanently deleted"):
        runtime.recover_recording(token, install_id=hello["installId"],
            connection_id=snapshot["connectionId"], epoch=snapshot["connectionEpoch"],
            recording_id=recording_id)


def test_real_application_lists_recycled_journals_and_allows_restore_then_delete(obs_project):
    from dataclasses import replace

    from app.main import create_app
    from app.settings import Settings

    tmp_path, projects, project, _, _, _, _, _, *_ = obs_project
    recording_id = str(uuid4())
    folder = write_stopped_journal(project, recording_id)
    pcm = folder / "channels" / "channel" / "chunks" / "000000000000.pcm"
    pcm.parent.mkdir(parents=True)
    pcm.write_bytes(b"retained PCM")
    (folder / "detailed-stt-state.json").write_text(json.dumps({
        "version": 1, "recordingId": recording_id, "segmentSeconds": 60,
        "model": "large-v3", "tracks": {},
    }), encoding="utf-8")
    app = create_app(project_repository=projects,
                     settings=replace(Settings.from_env(), data_root=tmp_path / "api-data"))
    client = TestClient(app)
    recordings_url = f"/api/projects/{project.id}/obs-livelink/recordings"
    item_url = recordings_url + f"/{recording_id}"

    assert [row["recording"]["recordingId"] for row in client.get(recordings_url).json()] == [recording_id]
    assert client.post(item_url + "/recycle").status_code == 200
    assert client.get(recordings_url).json() == []
    recycled = client.get(recordings_url + "?includeDeleted=true").json()
    assert recycled[0]["recording"]["recordingId"] == recording_id
    assert recycled[0]["deletedAt"]
    assert client.post(item_url + "/restore").status_code == 200
    assert [row["recording"]["recordingId"] for row in client.get(recordings_url).json()] == [recording_id]
    assert pcm.read_bytes() == b"retained PCM"
    assert client.post(item_url + "/recycle").status_code == 200
    assert client.delete(item_url).status_code == 200
    assert recording_id in deleted_recording_ids(Path(project.project_path))
    assert not folder.exists()


def test_zero_pcm_stopped_journal_can_be_recycled_and_active_capture_is_guarded(obs_project):
    _, _, project, runtime, _, _, _, client, *_ = obs_project
    zero_pcm_id = str(uuid4())
    zero_folder = write_stopped_journal(project, zero_pcm_id)
    assert not list(zero_folder.rglob("*.pcm"))
    assert client.post(url(project, zero_pcm_id) + "/recycle").status_code == 200

    active_id = str(uuid4())
    active_folder = write_stopped_journal(project, active_id, status="recording", archive_status="pending")
    state = runtime._state
    assert state is not None
    response = client.post(url(project, active_id) + "/recycle")
    assert response.status_code == 409
    assert active_folder.exists()
    assert "deletedAt" not in json.loads((active_folder / "recording.json").read_text())


def test_asset_backed_obs_recordings_stay_on_the_normal_media_pool_menu(obs_project):
    _, _, project, _, media, _, _, client, *_ = obs_project
    recording_id = str(uuid4())
    write_stopped_journal(project, recording_id)
    media.create(project.id, MediaAssetCreate(
        name="Published OBS take", source_extension=".mka", media_kind="audio",
        source_path=f"assets/obs-livelink/{recording_id}/source.mka",
        obs_recording_id=recording_id, origin="record",
    ))
    response = client.post(url(project, recording_id) + "/recycle")
    assert response.status_code == 409


def test_running_detailed_stt_and_archive_finalization_block_recycle(obs_project, monkeypatch):
    _, _, project, _, _, audio, detailed_stt, client, *_ = obs_project
    stt_id = str(uuid4())
    stt_folder = write_stopped_journal(project, stt_id)
    monkeypatch.setattr(detailed_stt, "status", lambda *_: {"active": True})
    response = client.post(url(project, stt_id) + "/recycle")
    assert response.status_code == 409
    assert stt_folder.exists()

    pending_id = str(uuid4())
    pending_folder = write_stopped_journal(project, pending_id, archive_status="pending")
    monkeypatch.setattr(detailed_stt, "status", lambda *_: {"active": False})
    response = client.post(url(project, pending_id) + "/recycle")
    assert response.status_code == 409
    assert pending_folder.exists()

    locked_id = str(uuid4())
    locked_folder = write_stopped_journal(project, locked_id)
    lock = audio._recording_lock(locked_id)
    lock.acquire()
    try:
        response = client.post(url(project, locked_id) + "/recycle")
        assert response.status_code == 409
        assert locked_folder.exists()
    finally:
        lock.release()

    checkpoint_id = str(uuid4())
    checkpoint_folder = write_stopped_journal(project, checkpoint_id)
    processing_lock = asyncio.Lock()
    asyncio.run(processing_lock.acquire())
    detailed_stt._locks[checkpoint_id] = processing_lock
    try:
        response = client.post(url(project, checkpoint_id) + "/recycle")
        assert response.status_code == 409
        assert checkpoint_folder.exists()
        assert "deletedAt" not in json.loads((checkpoint_folder / "recording.json").read_text())
    finally:
        processing_lock.release()


def test_soft_recycled_recording_rejects_direct_archive_retry_finalize_and_detailed_stt(obs_project):
    _, _, project, _, media, audio, detailed_stt, _, *_ = obs_project
    recording_id = str(uuid4())
    folder = write_stopped_journal(project, recording_id)
    journal_path = folder / "recording.json"
    journal = json.loads(journal_path.read_text(encoding="utf-8"))
    journal["deletedAt"] = "2026-10-13T00:00:00+00:00"
    journal_path.write_text(json.dumps(journal), encoding="utf-8")
    (folder / "detailed-stt-state.json").write_text(json.dumps({
        "version": 1, "recordingId": recording_id, "segmentSeconds": 60,
        "model": "large-v3", "tracks": {"channel": {"cursor": 0}},
    }), encoding="utf-8")

    with pytest.raises(LiveLinkError, match="Recycle Bin"):
        audio.retry(project.id, recording_id)
    recording = ObsCaptureRecording.model_validate(journal["recording"])
    with pytest.raises(LiveLinkError, match="Recycle Bin"):
        audio._finalize(recording_id, recording, [], update_runtime=False)

    with pytest.raises(ValueError, match="Recycle Bin"):
        detailed_stt.status(project, recording_id)
    with pytest.raises(ValueError, match="Recycle Bin"):
        asyncio.run(detailed_stt.process_once(project, recording_id))
    assert media.list_metadata(project.id) == []
    assert json.loads(journal_path.read_text(encoding="utf-8"))["deletedAt"] == journal["deletedAt"]


def test_recording_ids_and_symlinked_journal_paths_cannot_escape_project(obs_project):
    _, _, project, _, _, _, _, client, *_ = obs_project
    traversal = client.post(url(project, "not-a-uuid") + "/recycle")
    assert traversal.status_code == 422

    recording_id = str(uuid4())
    outside = project.project_path
    outside_folder = Path(outside).parent / "outside-obs-journal"
    outside_folder.mkdir()
    (outside_folder / "recording.json").write_text(json.dumps({"recording": {
        "recordingId": recording_id, "projectId": project.id,
        "status": "stopped", "archiveStatus": "error",
    }}), encoding="utf-8")
    link = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    link.parent.mkdir(parents=True, exist_ok=True)
    try:
        link.symlink_to(outside_folder, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"Directory symlinks are unavailable in this test environment: {exc}")
    response = client.post(url(project, recording_id) + "/recycle")
    assert response.status_code == 400
    assert (outside_folder / "recording.json").is_file()
