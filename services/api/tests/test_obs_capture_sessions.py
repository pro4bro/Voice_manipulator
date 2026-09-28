from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.obs_capture_sessions import FileObsCaptureSessions
from app.domain.models import ObsSessionCreate, ObsTrackSource, ProjectCreate
from app.main import create_app
from app.settings import Settings


def _tools() -> tuple[str, str]:
    bundled = Path(__file__).resolve().parents[3] / ".tools" / "ffmpeg"
    ffmpeg = bundled / "ffmpeg.exe"
    ffprobe = bundled / "ffprobe.exe"
    if ffmpeg.is_file() and ffprobe.is_file():
        return str(ffmpeg), str(ffprobe)
    found = (shutil.which("ffmpeg"), shutil.which("ffprobe"))
    if not all(found):
        pytest.skip("FFmpeg and FFprobe are needed for OBS ingest test")
    return found  # type: ignore[return-value]


def _recording(path: Path, ffmpeg: str) -> None:
    subprocess.run([
        ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i", "color=size=64x64:rate=10:duration=2",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2",
        "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=2",
        "-map", "0:v", "-map", "1:a", "-map", "2:a", "-c:v", "mpeg4", "-c:a", "flac", str(path),
    ], check=True, capture_output=True)


def test_obs_session_imports_independent_tracks_and_survives_project_move(tmp_path):
    ffmpeg, ffprobe = _tools()
    recording = tmp_path / "meeting.mkv"
    _recording(recording, ffmpeg)
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="OBS meeting"))
    media = FileMediaLibrary(projects)
    sessions = FileObsCaptureSessions(projects, media, ffmpeg, ffprobe)
    request = ObsSessionCreate(source_path=str(recording), sources=[
        ObsTrackSource(stream_index=1, source_label="Micro", source_id="obs-mic"),
        ObsTrackSource(stream_index=2, source_label="Browser", source_id="obs-browser"),
    ])

    queued = sessions.start(project.id, request)
    sessions.ingest(project.id, queued.id, request)
    ready = sessions.get(project.id, queued.id)

    assert ready.status == "ready", ready.error
    assert [(track.stream_index, track.obs_track, track.source_label) for track in ready.tracks] == [
        (1, 1, "Micro"), (2, 2, "Browser")
    ]
    assert [media.get(project.id, track.asset_id).sample_rate for track in ready.tracks] == [44100, 48000]
    assert len({track.asset_id for track in ready.tracks}) == 2
    assert (Path(project.project_path) / ready.tracks[0].source_path).read_bytes() != (
        Path(project.project_path) / ready.tracks[1].source_path
    ).read_bytes()
    assert sessions.recording_path(project.id, queued.id).read_bytes() == recording.read_bytes()
    assert len(media.list(project.id)) == 3

    project_root = Path(project.project_path)
    stored = json.loads((project_root / "assets" / "obs-sessions" / queued.id / "session.json").read_text())
    assert not Path(stored["recordingPath"]).is_absolute()
    assert all(not Path(track["sourcePath"]).is_absolute() for track in stored["tracks"])
    assert str(recording) not in json.dumps(stored)

    moved = tmp_path / "relocated" / project_root.name
    moved.parent.mkdir()
    shutil.move(str(project_root), str(moved))
    reopened = projects.open(moved)
    assert sessions.recording_path(reopened.id, queued.id).is_file()
    assert all(media.resolve_audio_path(reopened.id, track.asset_id).is_file() for track in ready.tracks)


def test_obs_session_rejects_invalid_stream_and_cleans_partial_assets(tmp_path):
    ffmpeg, ffprobe = _tools()
    recording = tmp_path / "meeting.mkv"
    _recording(recording, ffmpeg)
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Bad mapping"))
    media = FileMediaLibrary(projects)
    sessions = FileObsCaptureSessions(projects, media, ffmpeg, ffprobe)
    request = ObsSessionCreate(source_path=str(recording), sources=[
        ObsTrackSource(stream_index=99, source_label="Missing")
    ])

    queued = sessions.start(project.id, request)
    sessions.ingest(project.id, queued.id, request)

    assert sessions.get(project.id, queued.id).status == "error"
    assert media.list(project.id) == []
    assert list((Path(project.project_path) / "assets" / "media").glob("*")) == []


def test_interrupted_obs_import_is_marked_error_on_restart(tmp_path):
    ffmpeg, ffprobe = _tools()
    recording = tmp_path / "meeting.mkv"
    recording.write_bytes(b"pending")
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Interrupted"))
    sessions = FileObsCaptureSessions(projects, FileMediaLibrary(projects), ffmpeg, ffprobe)
    queued = sessions.start(project.id, ObsSessionCreate(source_path=str(recording)))

    restarted = FileObsCaptureSessions(projects, FileMediaLibrary(projects), ffmpeg, ffprobe)
    assert restarted.get(project.id, queued.id).status == "error"


def test_obs_session_api_exposes_ready_tracks_and_recording(tmp_path):
    ffmpeg, _ = _tools()
    recording = tmp_path / "meeting.mkv"
    _recording(recording, ffmpeg)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data", ffmpeg_path=ffmpeg)
    with TestClient(create_app(settings=settings)) as client:
        project = client.post("/api/projects", json={"name": "OBS API"}).json()
        endpoint = f"/api/projects/{project['id']}/obs-sessions"
        inspected = client.post(f"{endpoint}/inspect", json={"sourcePath": str(recording)})
        assert inspected.status_code == 200, inspected.text
        assert [(track["streamIndex"], track["obsTrack"]) for track in inspected.json()["tracks"]] == [(1, 1), (2, 2)]
        response = client.post(endpoint, json={
            "sourcePath": str(recording),
            "sources": [{"streamIndex": 1, "sourceLabel": "Mic"}],
        })
        assert response.status_code == 202, response.text
        session_id = response.json()["id"]
        session = client.get(f"{endpoint}/{session_id}").json()
        assert session["status"] == "ready", session.get("error")
        assert [track["sourceLabel"] for track in session["tracks"]] == [
            "Mic", "Track 2 (chưa xác định nguồn)"
        ]
        assert len(client.get(endpoint).json()) == 1
        assert client.get(f"{endpoint}/{session_id}/recording").content == recording.read_bytes()
        subtitle_status = client.get(f"{endpoint}/{session_id}/subtitles/status")
        assert subtitle_status.status_code == 200, subtitle_status.text
        assert subtitle_status.json()["readyCues"] == 0
        assert len(subtitle_status.json()["sources"]) == 2
        assert client.get(f"{endpoint}/{session_id}/subtitles").status_code == 400
        assert client.get(f"{endpoint}/{session_id}/subtitles?assetIds=asset-foreign").status_code == 400
        first_track = session["tracks"][0]
        # This fixture stands in for the processor provenance gate that marks
        # Final STT timing reviewable before the user accepts individual words.
        index_path = settings.data_root / "projects" / project["id"] / "assets" / "media" / "index.json"
        index = json.loads(index_path.read_text(encoding="utf-8"))
        for item in index:
            if item["id"] == first_track["assetId"]:
                item["wordTimingQuality"] = "source"
        index_path.write_text(json.dumps(index), encoding="utf-8")
        reviewed = client.patch(
            f"/api/projects/{project['id']}/media/{first_track['assetId']}/script",
            json={"text": "Xin chào Việt Nam.", "source": "user", "words": [
                {"text": "Xin chào Việt Nam.", "start": 0.25, "end": 1.25,
                 "timingTrusted": True, "timingSource": "fixture-reviewed"},
            ]},
        )
        assert reviewed.status_code == 200, reviewed.text
        hard_subtitle = client.post(
            f"{endpoint}/{session_id}/hard-subtitle?assetIds={first_track['assetId']}"
        )
        assert hard_subtitle.status_code == 200, hard_subtitle.text
        assert hard_subtitle.headers["content-type"].startswith("video/mp4")
        assert hard_subtitle.content[:8].endswith(b"ftyp")
        assert client.get(f"{endpoint}/{session_id}/recording").content == recording.read_bytes()
        assert len(client.get(f"/api/projects/{project['id']}/media").json()) == 3
        for track in session["tracks"]:
            audio = client.get(f"/api/projects/{project['id']}/media/{track['assetId']}/audio")
            assert audio.status_code == 200
            assert audio.content.startswith(b"RIFF")
