from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import asyncio
import threading
from uuid import uuid4

import pytest

from fastapi.testclient import TestClient

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.domain.models import MediaAssetCreate, ProjectCreate
from app.main import create_app
from app.settings import Settings


def _project_with_interrupted_media(projects: FileProjectRepository, name: str):
    project = projects.create(ProjectCreate(name=name))
    media = FileMediaLibrary(projects)
    stt = media.create(
        project.id,
        MediaAssetCreate(
            name="stt.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path=f"assets/media/{name}/source.wav",
            analysis_path=f"assets/media/{name}/analysis.wav",
            duration=3,
            origin="import",
            transcription_status="processing",
            transcription_progress=42,
        ),
        f"{name}-stt",
    )
    stt_folder = Path(project.project_path) / "assets" / "media" / name
    stt_folder.mkdir(parents=True, exist_ok=True)
    (stt_folder / "source.wav").write_bytes(b"source")
    (stt_folder / "analysis.wav").write_bytes(b"analysis")
    media.apply_transcription(
        project.id,
        stt.id,
        {"id": "existing-transcript", "text": "Keep this transcript", "words": [
            {"text": "Keep", "start": 0.0, "end": 0.4},
        ], "duration": 3},
        3,
    )
    media.set_transcription_state(project.id, stt.id, "processing", progress=42)

    diarized = media.create(
        project.id,
        MediaAssetCreate(
            name="diarization.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path=f"assets/media/{name}-diarization/source.wav",
            analysis_path=f"assets/media/{name}-diarization/analysis.wav",
            duration=3,
            origin="import",
            transcription_status="complete",
            words=[{"text": "Existing words", "start": 0.0, "end": 1.0}],
            diarization_status="queued",
            diarization_progress=0,
        ),
        f"{name}-diarization",
    )
    return project, stt, diarized


def test_new_api_startup_releases_orphaned_stt_and_diarization_but_preserves_transcript(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project, stt, diarized = _project_with_interrupted_media(projects, "startup")
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")

    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        media = {asset["id"]: asset for asset in client.get(
            f"/api/projects/{project.id}/media"
        ).json()}

    assert media[stt.id]["transcriptionStatus"] == "cancelled"
    assert media[stt.id]["transcriptionError"]
    assert media[stt.id]["text"] == "Keep this transcript"
    assert media[stt.id]["words"][0]["text"] == "Keep"
    assert media[stt.id]["transcriptionProgress"] == 0
    assert media[diarized.id]["diarizationStatus"] == "cancelled"
    assert media[diarized.id]["diarizationError"]


def test_open_existing_reconciles_project_absent_from_startup_registry(tmp_path):
    source_projects = FileProjectRepository(tmp_path / "source-registry")
    project, stt, _ = _project_with_interrupted_media(source_projects, "opened")
    projects = FileProjectRepository(tmp_path / "api-registry")
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")

    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        opened = client.post("/api/projects/open", json={"path": str(project.project_path)})
        assert opened.status_code == 200
        assets = client.get(f"/api/projects/{opened.json()['id']}/media").json()

    assert next(asset for asset in assets if asset["id"] == stt.id)["transcriptionStatus"] == "cancelled"


def test_recovery_cancels_archive_metadata_without_a_dedicated_checkpoint(tmp_path):
    import asyncio

    from app.adapters.sequential_diarization_queue import SequentialDiarizationQueue
    from app.adapters.sequential_transcription_queue import SequentialTranscriptionQueue

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Durable work"))
    media = FileMediaLibrary(projects)
    obs = media.create(
        project.id,
        MediaAssetCreate(
            name="OBS stem.wav", source_extension=".wav", media_kind="audio",
            source_path="assets/media/obs/source.wav", analysis_path="assets/media/obs/analysis.wav",
            obs_recording_id="recording-1", duration=2, origin="record",
            transcription_status="processing", diarization_status="processing",
        ),
        "obs-stem",
    )
    growing = media.create(
        project.id,
        MediaAssetCreate(
            name="Growing MKV", source_extension=".mkv", media_kind="video",
            source_path="assets/media/growing/source.mkv", growing_mkv_follow=True,
            duration=2, origin="import", transcription_status="queued",
            diarization_status="processing",
        ),
        "growing-mkv",
    )
    importer = object()
    transcription = SequentialTranscriptionQueue(projects, media, importer, object())
    diarization = SequentialDiarizationQueue(projects, media, object(), object())

    async def recover():
        return await transcription.recover_interrupted(project.id), await diarization.recover_interrupted(project.id)

    transcription_ids, diarization_ids = asyncio.run(recover())
    assert set(transcription_ids) == {obs.id, growing.id}
    assert set(diarization_ids) == {obs.id, growing.id}
    assert media.get(project.id, obs.id).transcription_status == "cancelled"
    assert media.get(project.id, obs.id).diarization_status == "cancelled"
    assert media.get(project.id, growing.id).transcription_status == "cancelled"
    assert media.get(project.id, growing.id).diarization_status == "cancelled"


@pytest.mark.parametrize("named_folder", [False, True])
def test_startup_preserves_only_assets_owned_by_valid_detailed_or_follow_checkpoints(tmp_path, monkeypatch, named_folder):
    from app.adapters.growing_mkv_transcription import GrowingMkvTranscription
    from app.adapters.obs_livelink_detailed_stt import ObsLiveLinkDetailedStt

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Checkpoint ownership"))
    media = FileMediaLibrary(projects)

    # Archive metadata alone does not establish a detailed-STT owner.
    ordinary_obs = media.create(project.id, MediaAssetCreate(
        name="Archived OBS channel", source_extension=".wav", media_kind="audio",
        source_path="assets/media/ordinary-obs/source.wav",
        analysis_path="assets/media/ordinary-obs/analysis.wav", duration=1,
        origin="record", obs_recording_id=str(uuid4()),
        transcription_status="processing", diarization_status="processing",
    ), "ordinary-obs")
    completed = media.create(project.id, MediaAssetCreate(
        name="Completed archive", source_extension=".wav", media_kind="audio",
        source_path="assets/media/completed/source.wav",
        analysis_path="assets/media/completed/analysis.wav", duration=1,
        origin="import", transcription_status="complete",
        transcript_id="completed-transcript", text="Keep completed output",
        words=[{"text": "Keep", "start": 0.0, "end": 0.5}],
    ), "completed-archive")

    # A valid detailed-STT checkpoint maps its channel to a specific asset and
    # has committed PCM beyond its persisted cursor.
    recording_id, channel_id = str(uuid4()), str(uuid4())
    detailed_folder = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    chunk_folder = detailed_folder / "channels" / channel_id / "chunks"
    chunk_folder.mkdir(parents=True)
    (chunk_folder / "000000000000.pcm").write_bytes(b"\0\0" * 24000)
    (chunk_folder / "000000000000.json").write_text(json.dumps({
        "sequence": 0, "firstSampleIndex": 0, "frameCount": 24000,
        "sampleRate": 24000, "channels": 1, "pluginMonotonicNs": 0,
    }), encoding="utf-8")
    detailed_asset = media.create(project.id, MediaAssetCreate(
        name="Detailed OBS channel", source_extension=".wav", media_kind="audio",
        source_path="assets/media/detailed-obs/source.wav",
        analysis_path="assets/media/detailed-obs/analysis.wav", duration=1,
        origin="record", obs_recording_id=recording_id,
        transcription_status="processing", diarization_status="processing",
    ), "detailed-obs")
    (detailed_folder / "recording.json").write_text(json.dumps({
        "recording": {
            "recordingId": recording_id, "projectId": project.id,
            "status": "stopped", "archiveStatus": "ready",
            "startedMonotonicNs": 0, "endedMonotonicNs": 1_000_000_000,
        },
        "channels": [{"channelId": channel_id, "relayLabel": "Track 1"}],
        "sourceStems": [{"channelId": channel_id, "assetId": detailed_asset.id}],
    }), encoding="utf-8")
    (detailed_folder / "detailed-stt-state.json").write_text(json.dumps({
        "version": 1, "recordingId": recording_id, "segmentSeconds": 10,
        "model": "large-v3",
        "tracks": {channel_id: {"initialFrames": 24000, "cursor": 0, "publishedCursor": -1}},
    }), encoding="utf-8")
    progress_path = detailed_folder / "channels" / channel_id / "live-stt-progress.json"
    progress_path.write_text(json.dumps({
        "schemaVersion": 1, "recordingId": recording_id, "channelId": channel_id,
        "nextSequence": 1, "activeStartSequence": None,
    }), encoding="utf-8")

    # The parent flag gates growing-MKV ownership. This matching-looking stale
    # checkpoint must not retain the child when that product flag is false.
    growing_parent = media.create(project.id, MediaAssetCreate(
        name="Stale MKV parent", source_extension=".mkv", media_kind="video",
        source_path="assets/media/asset-stalemkv/source.mkv", duration=1,
        origin="import", growing_mkv_follow=False,
    ), "asset-stalemkv")
    stale_child = media.create(project.id, MediaAssetCreate(
        name="Stale MKV track", source_extension=".wav", media_kind="audio",
        source_path="assets/media/stale-child/source.wav",
        analysis_path="assets/media/stale-child/analysis.wav", duration=1,
        source_archive_asset_id=growing_parent.id, transcription_selected=True,
        transcription_status="processing", diarization_status="processing",
        origin="import",
    ), "stale-child")
    stale_folder = Path(project.project_path) / "assets" / "media" / growing_parent.id
    stale_folder.mkdir(parents=True, exist_ok=True)
    (stale_folder / "follow-state.json").write_text(json.dumps({
        "parentId": growing_parent.id, "finished": False,
        "tracks": [{"assetId": stale_child.id, "frames": 24000}],
    }), encoding="utf-8")

    # This is a valid growing-MKV checkpoint attached to a parent still marked
    # as an active follow; its selected child is owned by the dedicated worker.
    active_parent = media.create(project.id, MediaAssetCreate(
        name="Active MKV parent", source_extension=".mkv", media_kind="video",
        source_path="assets/media/asset-activemkv/source.mkv", duration=1,
        origin="import", growing_mkv_follow=True,
    ), "asset-activemkv")
    active_child = media.create(project.id, MediaAssetCreate(
        name="Active MKV track", source_extension=".wav", media_kind="audio",
        source_path="assets/media/active-child/source.wav",
        analysis_path="assets/media/active-child/analysis.wav", duration=1,
        source_archive_asset_id=active_parent.id, transcription_selected=True,
        transcription_status="processing", diarization_status="processing",
        origin="import",
    ), "active-child")
    active_folder = Path(project.project_path) / "assets" / "media" / active_parent.id
    active_folder.mkdir(parents=True, exist_ok=True)
    (active_folder / "follow-state.json").write_text(json.dumps({
        "parentId": active_parent.id, "finished": True,
        "tracks": [{"assetId": active_child.id, "frames": 24000, "finalFrames": 24000}],
    }), encoding="utf-8")
    (active_folder / "stt-state.json").write_text(json.dumps({
        "version": 1, "parentId": active_parent.id, "segmentSeconds": 60,
        "tracks": {active_child.id: {"liveFrame": 0, "finalFrame": 0, "publishedFinalFrame": -1}},
    }), encoding="utf-8")

    if named_folder:
        active_folder.rename(active_folder.with_name(f"Interview take--{active_parent.id}"))

    detailed_resumed = threading.Event()
    growing_resumed = threading.Event()

    async def detailed_process_once(self, _project, _recording_id):
        detailed_resumed.set()
        return {"done": False}

    async def growing_process_once(self, _project, parent_id, *, wait_for_detail=True):
        growing_resumed.set()
        return {"done": False}

    monkeypatch.setattr(ObsLiveLinkDetailedStt, "process_once", detailed_process_once)
    monkeypatch.setattr(GrowingMkvTranscription, "process_once", growing_process_once)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")

    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        assets = {item["id"]: item for item in client.get(f"/api/projects/{project.id}/media").json()}
        assert assets[ordinary_obs.id]["transcriptionStatus"] == "cancelled"
        assert assets[ordinary_obs.id]["diarizationStatus"] == "cancelled"
        assert assets[completed.id]["transcriptionStatus"] == "complete"
        assert assets[completed.id]["text"] == "Keep completed output"
        assert assets[completed.id]["words"][0]["text"] == "Keep"
        assert assets[detailed_asset.id]["transcriptionStatus"] == "processing"
        assert assets[detailed_asset.id]["diarizationStatus"] == "cancelled"
        assert assets[stale_child.id]["transcriptionStatus"] == "cancelled"
        assert assets[stale_child.id]["diarizationStatus"] == "cancelled"
        assert assets[active_child.id]["transcriptionStatus"] == "processing"
        assert assets[active_child.id]["diarizationStatus"] == "cancelled"
        assert detailed_resumed.wait(3)
        assert growing_resumed.wait(3)


@pytest.mark.parametrize("parent_state", ["disabled", "recycled"])
def test_startup_does_not_retain_children_of_ineligible_growing_parent(tmp_path, monkeypatch, parent_state):
    from app.adapters.growing_mkv_transcription import GrowingMkvTranscription

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Ineligible growing parent"))
    media = FileMediaLibrary(projects)
    parent_id = "asset-ineligible"
    parent = media.create(project.id, MediaAssetCreate(
        name="Unavailable parent", source_extension=".mkv", media_kind="video",
        source_path="assets/media/asset-ineligible/source.mkv", duration=1,
        origin="import", growing_mkv_follow=True,
    ), parent_id)
    child = media.create(project.id, MediaAssetCreate(
        name="Selected child", source_extension=".wav", media_kind="audio",
        source_path="assets/media/ineligible-child/source.wav",
        analysis_path="assets/media/ineligible-child/analysis.wav", duration=1,
        source_archive_asset_id=parent.id, transcription_selected=True,
        transcription_status="processing", origin="import",
    ), "ineligible-child")
    if parent_state == "disabled":
        media.set_disabled(project.id, parent.id, True)
    else:
        media.send_to_recycle_bin(project.id, parent.id)
    checkpoint_folder = Path(project.project_path) / "assets" / "media" / parent_id
    checkpoint_folder.mkdir(parents=True, exist_ok=True)
    (checkpoint_folder / "follow-state.json").write_text(json.dumps({
        "parentId": parent_id, "finished": False,
        "tracks": [{"assetId": child.id, "frames": 24000}],
    }), encoding="utf-8")
    (checkpoint_folder / "stt-state.json").write_text(json.dumps({
        "version": 1, "parentId": parent_id, "segmentSeconds": 60,
        "tracks": {child.id: {"liveFrame": 0, "finalFrame": 0, "publishedFinalFrame": -1}},
    }), encoding="utf-8")
    resumed = threading.Event()

    async def process_once(self, _project, _parent_id, *, wait_for_detail=True):
        resumed.set()
        return {"done": False}

    monkeypatch.setattr(GrowingMkvTranscription, "process_once", process_once)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")

    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        assets = {item["id"]: item for item in client.get(f"/api/projects/{project.id}/media").json()}
        assert assets[child.id]["transcriptionStatus"] == "cancelled"
        assert not resumed.wait(.1)


@pytest.mark.parametrize("permanent", [False, True])
def test_removing_active_footage_cancels_its_job_and_queue_continues(tmp_path, monkeypatch, permanent):
    from app.adapters.activity_center import CENTER
    from app.domain.models import MediaAssetCreate
    from app.adapters.media_import_processor import MediaImportProcessor

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Remove active footage"))
    media = FileMediaLibrary(projects)
    active = media.create(
        project.id,
        MediaAssetCreate(
            name="active.wav", source_extension=".wav", media_kind="audio",
            source_path="assets/media/active/source.wav",
            analysis_path="assets/media/active/analysis.wav", duration=1,
            origin="import", transcription_status="skipped",
        ),
        "active",
    )
    pending = media.create(
        project.id,
        MediaAssetCreate(
            name="pending.wav", source_extension=".wav", media_kind="audio",
            source_path="assets/media/pending/source.wav",
            analysis_path="assets/media/pending/analysis.wav", duration=1,
            origin="import", transcription_status="skipped",
        ),
        "pending",
    )
    active_dir = Path(project.project_path) / "assets" / "media" / "active"
    active_dir.mkdir(parents=True, exist_ok=True)
    (active_dir / "source.wav").write_bytes(b"source")
    entered = threading.Event()
    released = threading.Event()
    second_finished = threading.Event()

    async def gated_transcribe(self, project_record, asset, realtime_text, on_progress=None,
                               model="large-v3", cancellation=None):
        if asset.id == active.id:
            async def acknowledge_cancel():
                released.set()

            await cancellation.install_cancel_handler(acknowledge_cancel)
            entered.set()
            await asyncio.to_thread(released.wait, 5)
            cancellation.check()
        updated = media.apply_transcription(
            project_record.id,
            asset.id,
            {"id": f"transcript-{asset.id}", "text": "rerun completed", "words": [], "duration": 1},
            1,
        )
        second_finished.set()
        return updated, 0.01

    monkeypatch.setattr(MediaImportProcessor, "transcribe_existing", gated_transcribe)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        enqueued = client.post(
            f"/api/projects/{project.id}/media/transcriptions",
            json={"assetIds": [active.id, pending.id]},
        )
        assert enqueued.status_code == 200
        assert entered.wait(5)
        removed = client.delete(
            f"/api/projects/{project.id}/media/{active.id}",
            params={"permanent": str(permanent).lower()},
        )
        assert removed.status_code in ({204} if permanent else {200})
        assert second_finished.wait(5)
        pending_state = client.get(f"/api/projects/{project.id}/media").json()
        assert next(asset for asset in pending_state if asset["id"] == pending.id)["transcriptionStatus"] == "complete"

    if permanent:
        assert not active_dir.exists()
    else:
        active_state = media.get(project.id, active.id)
        assert active_state.transcription_status == "cancelled"
        assert (active_dir / "source.wav").read_bytes() == b"source"
    assert released.is_set()
    activity = {task.id: task for task in CENTER.tasks()}[f"stt:{project.id}:{active.id}"]
    assert activity.status == "cancelled"


def test_removing_archive_fences_growing_and_detailed_resumers(tmp_path, monkeypatch):
    from app.adapters.growing_mkv_transcription import GrowingMkvTranscription
    from app.adapters.obs_livelink_detailed_stt import ObsLiveLinkDetailedStt

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Remove archive owners"))
    media = FileMediaLibrary(projects)
    parent = media.create(project.id, MediaAssetCreate(
        name="Archive", source_extension=".mkv", media_kind="video",
        source_path="assets/media/archive/source.mkv", growing_mkv_follow=True,
        duration=2, origin="import",
    ), "asset-removearchive")
    growing_child = media.create(project.id, MediaAssetCreate(
        name="Growing child", source_extension=".wav", media_kind="audio",
        source_path="assets/media/growing-child/source.wav",
        analysis_path="assets/media/growing-child/analysis.wav", duration=2,
        source_archive_asset_id=parent.id, origin="import",
        transcription_status="processing",
    ), "growing-child")
    obs_child = media.create(project.id, MediaAssetCreate(
        name="Detailed child", source_extension=".wav", media_kind="audio",
        source_path="assets/media/detailed-child/source.wav",
        analysis_path="assets/media/detailed-child/analysis.wav", duration=2,
        source_archive_asset_id=parent.id, obs_recording_id=str(uuid4()),
        origin="record", transcription_status="processing",
    ), "detailed-child")
    calls = {}

    async def stop_growing(self, project_record, *, include_active=False, asset_ids=None):
        calls["growing"] = (project_record.id, set(asset_ids or []), include_active)
        return list(asset_ids or [])

    async def stop_detailed(self, project_record, *, include_active=False, asset_ids=None):
        calls["detailed"] = (project_record.id, set(asset_ids or []), include_active)
        return list(asset_ids or [])

    monkeypatch.setattr(GrowingMkvTranscription, "stop", stop_growing)
    monkeypatch.setattr(ObsLiveLinkDetailedStt, "stop", stop_detailed)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")

    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        removed = client.delete(f"/api/projects/{project.id}/media/{parent.id}")
        assert removed.status_code == 200

    expected_ids = {parent.id, growing_child.id, obs_child.id}
    assert calls["growing"] == (project.id, expected_ids, True)
    assert calls["detailed"] == (project.id, expected_ids, True)
