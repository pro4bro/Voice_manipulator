from __future__ import annotations

import hashlib
import json
import wave
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.obs_live_sessions import FileObsLiveSessions, ObsLiveConflict
from app.domain.models import ObsLiveEvent, ObsLiveOpen, ProjectCreate
from app.main import create_app
from app.settings import Settings


def _open() -> ObsLiveOpen:
    return ObsLiveOpen(protocol_version=2, capture_id="capture-test-1",
                       obs_version="32.2.2", source_id="mic-uuid-1",
                       source_label="Micro", sample_rate=48000, channels=1,
                       started_timestamp_ns=1_000_000_000)


def _receiver(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="OBS live"))
    media = FileMediaLibrary(projects)
    ffmpeg = Path(__file__).resolve().parents[3] / ".tools" / "ffmpeg" / "ffmpeg.exe"
    if not ffmpeg.is_file():
        pytest.skip("Bundled FFmpeg required for live-stem test")
    receiver = FileObsLiveSessions(projects, media, tmp_path / "data", str(ffmpeg))
    return projects, project, media, receiver


def test_obs_live_chunks_are_durable_idempotent_and_portable(tmp_path):
    projects, project, media, receiver = _receiver(tmp_path)
    token = receiver.pairing_token(project.id)
    receiver.authorize(project.id, token)
    session = receiver.open(project.id, _open())
    pcm = b"\x10\x00" * 48000
    digest = hashlib.sha256(pcm).hexdigest()

    recorded = receiver.chunk(project.id, session.id, 0, 1_000_000_000, 48000, digest, pcm)
    assert recorded.last_sequence == 0
    assert recorded.frames_received == 48000
    assert receiver.chunk(project.id, session.id, 0, 1_000_000_000, 48000, digest, pcm).frames_received == 48000
    with pytest.raises(ObsLiveConflict):
        receiver.chunk(project.id, session.id, 0, 1_000_000_001, 48000, digest, pcm)

    restarted = FileObsLiveSessions(projects, media, tmp_path / "data", receiver.ffmpeg)
    restarted.authorize(project.id, token)
    assert restarted.get(project.id, session.id).last_sequence == 0
    stopped_event = ObsLiveEvent(sequence=0, kind="stopped", timestamp_ns=2_000_000_000)
    stopped = restarted.event(project.id, session.id, stopped_event)
    assert stopped.status == "stopped"
    assert stopped.timing_complete
    assert stopped.asset_id
    assert restarted.event(project.id, session.id, stopped_event).asset_id == stopped.asset_id
    assert len(media.list(project.id)) == 1
    with wave.open(str(Path(project.project_path) / stopped.stem_path), "rb") as audio:
        assert audio.getnframes() == 48000
        assert audio.getframerate() == 48000
    manifest = json.loads((Path(project.project_path) / "assets" / "obs-live" / session.id / "session.json").read_text())
    assert not Path(manifest["stemPath"]).is_absolute()
    moved = tmp_path / "moved" / Path(project.project_path).name
    moved.parent.mkdir()
    Path(project.project_path).rename(moved)
    reopened = projects.open(moved)
    assert media.resolve_audio_path(reopened.id, stopped.asset_id).is_file()
    assert (moved / restarted.get(reopened.id, session.id).stem_path).is_file()


def test_obs_live_gap_and_pause_are_recorded_without_claiming_complete_timing(tmp_path):
    _, project, _, receiver = _receiver(tmp_path)
    session = receiver.open(project.id, _open())
    pcm = b"\0\0" * 480
    digest = hashlib.sha256(pcm).hexdigest()
    receiver.chunk(project.id, session.id, 0, 1_000_000_000, 480, digest, pcm)
    paused = receiver.event(project.id, session.id, ObsLiveEvent(sequence=0, kind="paused", timestamp_ns=1_010_000_000))
    assert paused.status == "paused"
    with pytest.raises(ObsLiveConflict):
        receiver.chunk(project.id, session.id, 1, 1_010_000_000, 480, digest, pcm)
    receiver.event(project.id, session.id, ObsLiveEvent(sequence=1, kind="unpaused", timestamp_ns=3_000_000_000))
    receiver.chunk(project.id, session.id, 2, 3_000_000_000, 480, digest, pcm)
    stopped = receiver.event(project.id, session.id, ObsLiveEvent(sequence=2, kind="stopped", timestamp_ns=3_010_000_000))
    assert [(gap.first_sequence, gap.last_sequence, gap.missing_frames) for gap in stopped.gaps] == [(1, 1, 0)]
    assert not stopped.timing_complete
    assert stopped.asset_id


def test_obs_live_http_requires_pairing_and_caps_payload(tmp_path):
    ffmpeg = Path(__file__).resolve().parents[3] / ".tools" / "ffmpeg" / "ffmpeg.exe"
    settings = replace(Settings.from_env(), data_root=tmp_path / "data", ffmpeg_path=str(ffmpeg))
    with TestClient(create_app(settings=settings)) as client:
        project = client.post("/api/projects", json={"name": "OBS live API"}).json()
        base = f"/api/projects/{project['id']}/obs-live"
        token = client.get(f"{base}/pairing").json()["token"]
        payload = _open().model_dump(by_alias=True)
        assert client.post(f"{base}/sessions", json=payload).status_code == 403
        headers = {"x-pro4bro-obs-token": token}
        opened = client.post(f"{base}/sessions", json=payload, headers=headers)
        assert opened.status_code == 201, opened.text
        session_id = opened.json()["id"]
        pcm = b"\0\0" * 480
        path = f"{base}/sessions/{session_id}/chunks/0?timestampNs=1000000000&frames=480&sha256={hashlib.sha256(pcm).hexdigest()}"
        assert client.put(path, content=pcm).status_code == 403
        assert client.put(path, content=b"0" * 768001, headers=headers).status_code == 413
        accepted = client.put(path, content=pcm, headers=headers)
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["framesReceived"] == 480
        stopped = client.post(f"{base}/sessions/{session_id}/events", json={
            "sequence": 0, "kind": "stopped", "timestampNs": 1_010_000_000,
        }, headers=headers)
        assert stopped.status_code == 200, stopped.text
        assert stopped.json()["assetId"]
        quality = client.get(f"{base}/sessions/{session_id}/caption-quality")
        assert quality.status_code == 200
        assert quality.json()["finalAvailable"] is False


def test_obs_live_multiple_sources_reconnect_without_relabeling(tmp_path):
    projects, project, media, receiver = _receiver(tmp_path)
    mic_open = _open()
    app_open = mic_open.model_copy(update={"source_id": "app-uuid-2", "source_label": "Ứng dụng"})
    mic = receiver.open(project.id, mic_open)
    app = receiver.open(project.id, app_open)
    assert mic.capture_id == app.capture_id == "capture-test-1"
    assert mic.id != app.id
    assert receiver.open(project.id, mic_open).id == mic.id

    mic_pcm = b"\x01\x00" * 480
    app_pcm = b"\x02\x00" * 480
    receiver.chunk(project.id, mic.id, 0, 1_000_000_000, 480,
                   hashlib.sha256(mic_pcm).hexdigest(), mic_pcm)
    receiver.chunk(project.id, app.id, 0, 1_000_000_000, 480,
                   hashlib.sha256(app_pcm).hexdigest(), app_pcm)

    restarted = FileObsLiveSessions(projects, media, tmp_path / "data", receiver.ffmpeg)
    assert restarted.open(project.id, mic_open).id == mic.id
    assert restarted.open(project.id, app_open).id == app.id
    restarted.chunk(project.id, mic.id, 1, 1_010_000_000, 480,
                    hashlib.sha256(mic_pcm).hexdigest(), mic_pcm)
    restarted.chunk(project.id, app.id, 1, 1_010_000_000, 480,
                    hashlib.sha256(app_pcm).hexdigest(), app_pcm)

    mic_done = restarted.event(project.id, mic.id, ObsLiveEvent(
        sequence=0, kind="stopped", timestamp_ns=1_020_000_000))
    app_done = restarted.event(project.id, app.id, ObsLiveEvent(
        sequence=0, kind="stopped", timestamp_ns=1_020_000_000))
    assert (mic_done.source_id, mic_done.source_label) == ("mic-uuid-1", "Micro")
    assert (app_done.source_id, app_done.source_label) == ("app-uuid-2", "Ứng dụng")
    assert mic_done.asset_id != app_done.asset_id
    assert {asset.name for asset in media.list(project.id)} == {
        "OBS live · Micro", "OBS live · Ứng dụng",
    }


def test_obs_live_overlay_keeps_sources_provisional_and_clears_on_stop(tmp_path):
    _, project, _, receiver = _receiver(tmp_path)
    mic = receiver.open(project.id, _open())
    app = receiver.open(project.id, _open().model_copy(update={
        "source_id": "app-uuid-2", "source_label": "Ứng dụng",
    }))
    overlay = receiver.overlay_path(project.id)
    assert overlay.relative_to(Path(project.project_path)).as_posix() == "cache/obs-live-caption.txt"
    receiver.update_live_stt(project.id, mic.id, status="live", text="Xin chào")
    receiver.update_live_stt(project.id, app.id, status="live", text="Hello")
    shown = overlay.read_text(encoding="utf-8")
    assert shown.startswith("[LIVE DRAFT]\n")
    assert "Micro: Xin chào" in shown and "Ứng dụng: Hello" in shown

    receiver.event(project.id, mic.id, ObsLiveEvent(sequence=0, kind="paused", timestamp_ns=2_000_000_000))
    assert "Micro:" not in overlay.read_text(encoding="utf-8")
    receiver.event(project.id, app.id, ObsLiveEvent(sequence=0, kind="stopped", timestamp_ns=2_000_000_000))
    assert overlay.read_text(encoding="utf-8") == ""


def test_overlay_io_error_never_fails_audio_ack(tmp_path, monkeypatch):
    _, project, _, receiver = _receiver(tmp_path)
    session = receiver.open(project.id, _open())
    monkeypatch.setattr(receiver, "_write_overlay", lambda *_: (_ for _ in ()).throw(OSError("disk")))
    receiver.update_live_stt(project.id, session.id, status="live", text="Xin chào")
    pcm = b"\x10\x00" * 480
    accepted = receiver.chunk(project.id, session.id, 0, 1_000_000_000, 480,
                              hashlib.sha256(pcm).hexdigest(), pcm)
    assert accepted.last_sequence == 0


def test_caption_quality_waits_for_final_stt(tmp_path):
    _, project, media, receiver = _receiver(tmp_path)
    session = receiver.open(project.id, _open())
    receiver.update_live_stt(project.id, session.id, status="live", text="xin chào anh")
    assert not receiver.caption_quality(project.id, session.id)["finalAvailable"]
    pcm = b"\x10\x00" * 480
    receiver.chunk(project.id, session.id, 0, 1_000_000_000, 480,
                   hashlib.sha256(pcm).hexdigest(), pcm)
    stopped = receiver.event(project.id, session.id, ObsLiveEvent(
        sequence=0, kind="stopped", timestamp_ns=1_010_000_000))
    assert not receiver.caption_quality(project.id, session.id)["finalAvailable"]
    media.update_script(project.id, stopped.asset_id, "xin chào bạn", "stt")
    media.set_transcription_state(project.id, stopped.asset_id, "complete")
    quality = receiver.caption_quality(project.id, session.id)
    assert quality["finalAvailable"]
    assert quality["liveWords"] == quality["finalWords"] == 3
    assert quality["mismatchPercent"] > 0
