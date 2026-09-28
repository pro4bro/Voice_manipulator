from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from pathlib import Path
import subprocess

import pytest

from app.adapters.obs_session_subtitles import ObsSessionSubtitles
from app.domain.models import (
    MediaAssetCreate, ObsCaptureSession, ObsSessionTrack,
    ProjectCreate, ProjectMediaAsset, ProjectRecord,
)


def _asset(asset_id: str, words: list[dict], quality: str = "source") -> ProjectMediaAsset:
    created = ProjectMediaAsset.create(asset_id, MediaAssetCreate(
        name=asset_id, source_extension=".wav", media_kind="audio",
        source_path=f"assets/media/{asset_id}/source.wav", duration=22,
        origin="import", transcription_status="complete", words=words,
    ))
    return created.model_copy(update={"word_timing_quality": quality})


def _session() -> ObsCaptureSession:
    now = datetime.now(timezone.utc)
    return ObsCaptureSession(
        id="obs-012345abcdef", status="ready", created_at=now, updated_at=now,
        recording_path="assets/media/asset-video/source.mkv", duration=22.033,
        tracks=[
            ObsSessionTrack(stream_index=1, obs_track=1, source_id="uuid-mic", source_label="Micro",
                            asset_id="asset-mic", source_path="a.wav", analysis_path="a-analysis.wav"),
            ObsSessionTrack(stream_index=2, obs_track=2, source_id="uuid-app", source_label="App",
                            asset_id="asset-app", source_path="b.wav", analysis_path="b-analysis.wav"),
        ],
    )


class _Media:
    def __init__(self, assets: dict[str, ProjectMediaAsset]):
        self.assets = assets

    def get(self, project_id: str, asset_id: str) -> ProjectMediaAsset:
        return self.assets[asset_id]


def test_session_srt_merges_late_source_on_video_clock_and_counts_unsafe_cues(tmp_path: Path):
    project = ProjectRecord.create("project-test", ProjectCreate(name="Meeting"), tmp_path)
    assets = {
        "asset-mic": _asset("asset-mic", [
            {"text": "Đầu.", "start": 2.30, "end": 2.55, "timingTrusted": True},
            {"text": "Giữa.", "start": 10.30, "end": 10.60, "timingTrusted": True},
            {"text": "Cuối.", "start": 19.30, "end": 19.60, "timingTrusted": True},
            {"text": "Sai.", "start": 20.50, "end": 20.75, "timingTrusted": False},
        ], "partial"),
        "asset-app": _asset("asset-app", [
            {"text": "Nguồn muộn.", "start": 6.98, "end": 7.30, "timingTrusted": True},
            {"text": "Sau pause.", "start": 18.98, "end": 19.20, "timingTrusted": True},
            {"text": "Ngoài video.", "start": 22.5, "end": 22.8, "timingTrusted": True},
        ]),
    }
    service = ObsSessionSubtitles(_Media(assets))  # type: ignore[arg-type]
    status = service.status(project.id, _session())
    assert status["readyCues"] == 5
    assert status["skippedCues"] == 1
    assert status["unsafeWords"] == 1
    output = service.export(project, _session())
    rendered = output.read_text(encoding="utf-8")
    assert output.relative_to(tmp_path).as_posix() == "exports/subtitles/obs-012345abcdef--asset-mic-asset-app--session.srt"
    assert "00:00:02,300 --> 00:00:02,550\nMicro: Đầu." in rendered
    assert "00:00:06,980 --> 00:00:07,300\nApp: Nguồn muộn." in rendered
    assert "00:00:10,300 --> 00:00:10,600\nMicro: Giữa." in rendered
    assert "00:00:18,980 --> 00:00:19,200\nApp: Sau pause." in rendered
    assert "00:00:19,300 --> 00:00:19,600\nMicro: Cuối." in rendered
    assert rendered.startswith("1\n")
    assert "Sai." not in rendered and "Ngoài video." not in rendered

    # A later review of one track changes only that track's exported cues.
    assets["asset-app"] = _asset("asset-app", [
        {"text": "Đã sửa.", "start": 6.98, "end": 7.30, "timingTrusted": True},
    ])
    revised = service.export(project, _session()).read_text(encoding="utf-8")
    assert "App: Đã sửa." in revised and "App: Nguồn muộn." not in revised
    assert "Micro: Đầu." in revised and "Micro: Giữa." in revised

    isolated = service.export(project, _session(), {"asset-app"}).read_text(encoding="utf-8")
    assert "App: Đã sửa." in isolated and "Micro:" not in isolated
    try:
        service.export(project, _session(), {"asset-foreign"})
    except ValueError as exc:
        assert "thuộc phiên OBS" in str(exc)
    else:
        raise AssertionError("Expected foreign source to be rejected")


def test_session_srt_rejects_unverified_track_and_empty_export(tmp_path: Path):
    project = ProjectRecord.create("project-test", ProjectCreate(name="Meeting"), tmp_path)
    assets = {
        "asset-mic": _asset("asset-mic", [{"text": "Tạm.", "start": 1, "end": 2}], "unverified"),
        "asset-app": _asset("asset-app", [], "unverified"),
    }
    service = ObsSessionSubtitles(_Media(assets))  # type: ignore[arg-type]
    assert service.status(project.id, _session())["skippedCues"] == 1
    try:
        service.export(project, _session())
    except ValueError as exc:
        assert "Chưa có cue đáng tin" in str(exc)
    else:
        raise AssertionError("Expected unsafe-only session to be rejected")


def test_hard_subtitle_render_is_project_owned_atomic_and_keeps_source(tmp_path: Path):
    tools = Path(__file__).resolve().parents[3] / ".tools" / "ffmpeg"
    ffmpeg, ffprobe = tools / "ffmpeg.exe", tools / "ffprobe.exe"
    if not ffmpeg.is_file() or not ffprobe.is_file():
        pytest.skip("Bundled FFmpeg required")
    project = ProjectRecord.create("project-test", ProjectCreate(name="Meeting"), tmp_path)
    source = tmp_path / "assets" / "media" / "asset-video" / "source.mkv"
    source.parent.mkdir(parents=True)
    subprocess.run([
        str(ffmpeg), "-y", "-f", "lavfi", "-i", "color=c=black:s=640x360:r=25:d=4",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264",
        "-c:a", "aac", "-shortest", str(source),
    ], check=True, capture_output=True)
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    session = _session().model_copy(update={"duration": 4.0, "tracks": [_session().tracks[0]]})
    assets = {"asset-mic": _asset("asset-mic", [
        {"text": "Tiếng Việt ở đầu.", "start": 0.25, "end": 0.9, "timingTrusted": True},
        {"text": "Ở giữa.", "start": 1.7, "end": 2.2, "timingTrusted": True},
        {"text": "Và cuối.", "start": 3.1, "end": 3.7, "timingTrusted": True},
    ])}
    service = ObsSessionSubtitles(_Media(assets), str(ffmpeg), str(ffprobe))  # type: ignore[arg-type]
    output = service.render(project, session, {"asset-mic"})
    assert output.relative_to(tmp_path).as_posix() == (
        "exports/videos/obs-012345abcdef--asset-mic--hard-subtitle.mp4"
    )
    assert output.is_file() and output.stat().st_size > 0
    assert not output.with_suffix(".mp4.part").exists()
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    assert abs(service._duration(output) - 4.0) <= 0.25


def test_failed_hard_subtitle_render_publishes_nothing_and_keeps_source(tmp_path: Path, monkeypatch):
    project = ProjectRecord.create("project-test", ProjectCreate(name="Meeting"), tmp_path)
    source = tmp_path / "assets" / "media" / "asset-video" / "source.mkv"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"original OBS recording")
    session = _session().model_copy(update={"tracks": [_session().tracks[0]]})
    asset = _asset("asset-mic", [
        {"text": "Xin chào.", "start": 0.25, "end": 0.9, "timingTrusted": True},
    ])
    service = ObsSessionSubtitles(_Media({"asset-mic": asset}), "ffmpeg", "ffprobe")  # type: ignore[arg-type]
    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: subprocess.CompletedProcess(args[0], 1, "", "render failed"))
    with pytest.raises(ValueError, match="render failed"):
        service.render(project, session, {"asset-mic"})
    assert source.read_bytes() == b"original OBS recording"
    assert not list((tmp_path / "exports" / "videos").glob("*.mp4*"))
