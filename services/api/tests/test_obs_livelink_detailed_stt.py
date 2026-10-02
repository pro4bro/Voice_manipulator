import asyncio
import hashlib
import json
import shutil
import wave
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.obs_livelink_detailed_stt import ObsLiveLinkDetailedStt
from app.domain.models import MediaAssetCreate, ProjectCreate
from app.main import create_app
from app.settings import Settings


def _chunk(folder: Path, channel: str, sequence: int, seconds: int, *, rate: int = 24000) -> None:
    directory = folder / "channels" / channel / "chunks"
    directory.mkdir(parents=True, exist_ok=True)
    pcm = (b"\x00\x10" * rate) * seconds
    metadata = {"sequence": sequence, "firstSampleIndex": sequence * 10 * rate,
                "frameCount": seconds * rate, "sampleRate": rate, "channels": 1,
                "pluginMonotonicNs": sequence * 10_000_000_000,
                "sha256": hashlib.sha256(pcm).hexdigest()}
    (directory / f"{sequence:012d}.pcm").write_bytes(pcm)
    (directory / f"{sequence:012d}.json").write_text(json.dumps(metadata))


def _setup(tmp_path):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="LiveLink detail"))
    recording_id, channels = str(uuid4()), [str(uuid4()), str(uuid4())]
    folder = Path(project.project_path) / "assets" / "obs-livelink" / recording_id
    folder.mkdir(parents=True)
    recording = {"recordingId": recording_id, "projectId": project.id,
                 "status": "recording", "archiveStatus": "pending",
                 "startedMonotonicNs": 0, "endedMonotonicNs": None,
                 "capturePauseIntervals": [], "channelIntervals": []}
    journal = {"recording": recording, "channels": [
        {"channelId": channel, "relayLabel": f"Track {index}"}
        for index, channel in enumerate(channels, 1)]}
    (folder / "recording.json").write_text(json.dumps(journal))
    return projects, project, folder, recording_id, channels, journal


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg required")
def test_snapshots_each_track_then_resumes_padded_blocks_and_publishes(tmp_path):
    projects, project, folder, recording_id, channels, journal = _setup(tmp_path)
    _chunk(folder, channels[0], 0, 10)
    _chunk(folder, channels[1], 0, 8)
    seen = []

    async def recognize(path, model):
        with wave.open(str(path), "rb") as audio:
            seen.append((audio.getnframes(), audio.getframerate(), model))
            duration = audio.getnframes() / audio.getframerate()
        # The anchor appears again in padded audio, but its original timing
        # lies before every merge seam and must survive exactly once.
        words = [{"text": "anchor", "start": 1, "end": 1.4},
                 {"text": "spoken", "start": duration - 0.8, "end": duration - 0.2}]
        return {"text": "spoken", "words": words,
            "sample_rate": 24000}

    importer = type("Importer", (), {"ffmpeg_path": shutil.which("ffmpeg")})()
    library = FileMediaLibrary(projects)
    worker = ObsLiveLinkDetailedStt(library, importer, recognize)
    plan = worker.configure(project, recording_id, 10, channels)
    assert plan["tracks"][channels[0]]["initialFrames"] == 240000
    assert plan["tracks"][channels[1]]["initialFrames"] == 192000
    # A later chunk cannot extend the interval frozen at the button press.
    for channel in channels:
        _chunk(folder, channel, 1, 10)
    asyncio.run(worker.process_once(project, recording_id))
    assert sorted(item[0] for item in seen) == [192000, 240000]
    # Recreating the worker models an API restart; saved results/cursors resume.
    worker = ObsLiveLinkDetailedStt(library, importer, recognize)
    asyncio.run(worker.process_once(project, recording_id))
    assert sorted(item[0] for item in seen[2:]) == [432000, 480000]
    result = json.loads((folder / "detailed-stt" / channels[0] / "000000240000.json").read_text())
    assert result["audioStartFrame"] == 0
    assert result["mergeStartFrame"] == 120000
    assert worker.status(project, recording_id)["tracks"][channels[0]]["cursor"] == 480000
    assert asyncio.run(worker.process_once(project, recording_id))["done"] is False
    assert len(seen) == 4
    # Stop drains the short tail. Archive publication later binds results to assets.
    _chunk(folder, channels[0], 2, 4)
    journal["recording"].update(status="stopped", archiveStatus="pending",
                                endedMonotonicNs=24_000_000_000)
    (folder / "recording.json").write_text(json.dumps(journal))
    asyncio.run(worker.process_once(project, recording_id))
    assert sorted(item[0] for item in seen[-2:]) == [12 * 24000, 14 * 24000]
    assert worker.status(project, recording_id)["tracks"][channels[0]]["cursor"] == 24 * 24000
    stems = []
    for channel in channels:
        asset_id = "asset-live-" + hashlib.sha256(f"{recording_id}:{channel}".encode()).hexdigest()[:12]
        asset_folder = Path(project.project_path) / "assets" / "media" / asset_id
        asset_folder.mkdir(parents=True)
        audio = asset_folder / "analysis.wav"
        with wave.open(str(audio), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(24000)
            output.writeframes(b"\0\0" * 24000)
        library.create(project.id, MediaAssetCreate(
            name="OBS track", source_extension=".wav", media_kind="audio",
            source_path=audio.relative_to(project.project_path).as_posix(),
            analysis_path=audio.relative_to(project.project_path).as_posix(),
            obs_recording_id=recording_id, origin="record"), asset_id)
        stems.append({"channelId": channel, "assetId": asset_id})
    journal["sourceStems"] = stems
    journal["recording"]["archiveStatus"] = "ready"
    (folder / "recording.json").write_text(json.dumps(journal))
    assert asyncio.run(worker.process_once(project, recording_id))["done"]
    for stem in stems:
        asset = library.get(project.id, stem["assetId"])
        assert asset.transcription_status == "complete"
        assert len(asset.words) == 2
        assert [word["text"] for word in asset.words] == ["anchor", "spoken"]
        assert asset.words[0]["start"] == 1
        assert (folder / "detailed-stt" / stem["channelId"] / "transcript.stt.srt").is_file()


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg required")
def test_missing_overlap_word_timing_keeps_cursor_for_retry(tmp_path):
    projects, project, folder, recording_id, channels, _ = _setup(tmp_path)
    _chunk(folder, channels[0], 0, 10)
    async def recognize(path, _model):
        return {"text": "speech", "words": [{"text": "speech", "start": 1, "end": 2}]
                if path.stem == "000000000000" else []}
    worker = ObsLiveLinkDetailedStt(FileMediaLibrary(projects),
                                    type("Importer", (), {"ffmpeg_path": shutil.which("ffmpeg")})(),
                                    recognize)
    worker.configure(project, recording_id, 10, [channels[0]])
    asyncio.run(worker.process_once(project, recording_id))
    _chunk(folder, channels[0], 1, 10)
    with pytest.raises(ValueError, match="word timestamp"):
        asyncio.run(worker.process_once(project, recording_id))
    assert worker.status(project, recording_id)["tracks"][channels[0]]["cursor"] == 240000


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg required")
def test_pcm_gap_and_pause_are_silent_in_detail_snapshot(tmp_path):
    projects, project, folder, recording_id, channels, journal = _setup(tmp_path)
    channel = channels[0]
    _chunk(folder, channel, 0, 4)
    journal["recording"]["capturePauseIntervals"] = [
        {"startMonotonicNs": 12_000_000_000, "endMonotonicNs": 14_000_000_000}]
    (folder / "recording.json").write_text(json.dumps(journal))
    samples = []

    async def recognize(path, _model):
        with wave.open(str(path), "rb") as audio:
            pcm = audio.readframes(audio.getnframes())
            samples.append((audio.getnframes(), pcm))
        return {"text": "", "words": []}

    worker = ObsLiveLinkDetailedStt(FileMediaLibrary(projects),
                                    type("Importer", (), {"ffmpeg_path": shutil.which("ffmpeg")})(),
                                    recognize)
    worker.configure(project, recording_id, 10, [channel])
    asyncio.run(worker.process_once(project, recording_id))
    _chunk(folder, channel, 1, 10)
    asyncio.run(worker.process_once(project, recording_id))
    assert samples[1][0] == 14 * 24000
    pcm = samples[1][1]
    assert pcm[5 * 24000 * 2:6 * 24000 * 2] == b"\0" * (24000 * 2)
    assert pcm[11 * 24000 * 2:12 * 24000 * 2] != b"\0" * (24000 * 2)
    assert pcm[13 * 24000 * 2:14 * 24000 * 2] == b"\0" * (24000 * 2)


def test_api_lists_only_durable_tracks_and_rejects_empty_detail_plan(tmp_path):
    projects, project, folder, recording_id, channels, _ = _setup(tmp_path)
    _chunk(folder, channels[0], 0, 1)
    settings = replace(Settings.from_env(), data_root=tmp_path / "machine")
    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        base = f"/api/projects/{project.id}/obs-livelink/recordings"
        listed = client.get(base)
        assert listed.status_code == 200
        assert listed.json()[0]["durableChannelIds"] == [channels[0]]
        rejected = client.post(f"{base}/{recording_id}/detailed-stt", json={
            "segmentSeconds": 60, "channelIds": [channels[1]]})
        assert rejected.status_code == 409
        assert not (folder / "detailed-stt-state.json").exists()
