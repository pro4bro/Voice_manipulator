"""Project-owned OBS recordings with independently addressable audio tracks."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.domain.models import (
    MediaAssetCreate,
    ObsCaptureSession,
    ObsRecordingInspection,
    ObsRecordingStream,
    ObsSessionCreate,
    ObsSessionTrack,
    ProjectRecord,
)
from app.domain.ports import MediaLibrary, ProjectRepository


_SESSION_ID = re.compile(r"obs-[0-9a-f]{12}\Z")
_ASSET_ID = re.compile(r"asset-[0-9a-f]{12}\Z")


class FileObsCaptureSessions:
    def __init__(
        self,
        projects: ProjectRepository,
        media: MediaLibrary,
        ffmpeg_path: str | None,
        ffprobe_path: str | None,
    ) -> None:
        self.projects = projects
        self.media = media
        self.ffmpeg = ffmpeg_path
        self.ffprobe = ffprobe_path
        self._active: set[tuple[str, str]] = set()
        self._lock = threading.RLock()

    def start(self, project_id: str, request: ObsSessionCreate) -> ObsCaptureSession:
        self.projects.get(project_id)
        self._source(request.source_path)
        indices = [item.stream_index for item in request.sources]
        if len(indices) != len(set(indices)):
            raise ValueError("Một audio stream chỉ được gán một nguồn OBS.")
        now = datetime.now(timezone.utc)
        session = ObsCaptureSession(
            id=f"obs-{uuid4().hex[:12]}", created_at=now, updated_at=now
        )
        with self._lock:
            self._write(project_id, session)
            self._active.add((project_id, session.id))
        return session

    def inspect(self, project_id: str, source_path: str) -> ObsRecordingInspection:
        self.projects.get(project_id)
        source = self._source(source_path)
        probe = self._probe(source)
        if not any(item.get("codec_type") == "video" for item in probe.get("streams", [])):
            raise ValueError("Bản ghi OBS không có video.")
        audio = [item for item in probe["streams"] if item.get("codec_type") == "audio"]
        if not audio:
            raise ValueError("Bản ghi OBS không có audio track.")
        return ObsRecordingInspection(
            duration=float(probe.get("format", {}).get("duration") or 0),
            tracks=[ObsRecordingStream(
                stream_index=int(item["index"]), obs_track=slot,
                sample_rate=int(item["sample_rate"]), codec=str(item.get("codec_name") or ""),
            ) for slot, item in enumerate(audio, start=1)],
        )

    def ingest(self, project_id: str, session_id: str, request: ObsSessionCreate) -> None:
        try:
            self._ingest(project_id, session_id, request)
        except Exception as exc:
            with self._lock:
                session = self._read(project_id, session_id)
                try:
                    self._cleanup(project_id, session)
                except (OSError, ValueError) as cleanup_error:
                    exc = RuntimeError(f"{exc}; cleanup: {cleanup_error}")
                self._write(project_id, session.model_copy(update={
                    "status": "error",
                    "error": str(exc)[:2000] or "Không thể nhập bản ghi OBS.",
                    "updated_at": datetime.now(timezone.utc),
                }))
        finally:
            with self._lock:
                self._active.discard((project_id, session_id))

    def get(self, project_id: str, session_id: str) -> ObsCaptureSession:
        with self._lock:
            session = self._read(project_id, session_id)
            if session.status in {"queued", "processing"} and (project_id, session_id) not in self._active:
                self._cleanup(project_id, session)
                session = session.model_copy(update={
                    "status": "error",
                    "error": "Import OBS bị ngắt khi app dừng. Hãy chọn lại file và nhập lại.",
                    "updated_at": datetime.now(timezone.utc),
                })
                self._write(project_id, session)
            return session

    def list(self, project_id: str) -> list[ObsCaptureSession]:
        root = self._root(project_id)
        sessions = []
        for path in root.glob("*/session.json"):
            try:
                sessions.append(self.get(project_id, path.parent.name))
            except (OSError, ValueError, KeyError):
                continue
        return sorted(sessions, key=lambda item: item.created_at, reverse=True)

    def recording_path(self, project_id: str, session_id: str) -> Path:
        session = self.get(project_id, session_id)
        if session.status != "ready" or not session.recording_path:
            raise KeyError(session_id)
        root = Path(self.projects.get(project_id).project_path).resolve()
        path = (root / session.recording_path).resolve()
        if root not in path.parents or not path.is_file():
            raise KeyError(session_id)
        return path

    def _ingest(self, project_id: str, session_id: str, request: ObsSessionCreate) -> None:
        project = self.projects.get(project_id)
        root = Path(project.project_path).resolve()
        source = Path(request.source_path).expanduser().resolve()
        if not source.is_file():
            raise ValueError("File OBS không còn tại vị trí đã chọn.")
        probe = self._probe(source)
        video = next((item for item in probe["streams"] if item.get("codec_type") == "video"), None)
        audio = [item for item in probe["streams"] if item.get("codec_type") == "audio"]
        if not video or not audio:
            raise ValueError("File OBS cần có video và ít nhất một audio track.")
        by_index = {item.stream_index: item for item in request.sources}
        if set(by_index) - {int(item["index"]) for item in audio}:
            raise ValueError("Nguồn OBS tham chiếu một audio stream không có trong file.")
        duration = float(probe.get("format", {}).get("duration") or 0)
        if duration <= 0:
            raise ValueError("Không xác định được thời lượng bản ghi OBS.")

        video_id = f"asset-{uuid4().hex[:12]}"
        video_dir = root / "assets" / "media" / video_id
        video_path = video_dir / "source.mkv"
        tracks = []
        for slot, stream in enumerate(audio, start=1):
            index = int(stream["index"])
            asset_id = f"asset-{uuid4().hex[:12]}"
            mapped = by_index.get(index)
            folder = root / "assets" / "media" / asset_id
            tracks.append(ObsSessionTrack(
                stream_index=index,
                obs_track=slot,
                source_label=mapped.source_label if mapped else f"Track {slot} (chưa xác định nguồn)",
                source_id=mapped.source_id if mapped else None,
                asset_id=asset_id,
                source_path=(folder / "source.flac").relative_to(root).as_posix(),
                analysis_path=(folder / "analysis.wav").relative_to(root).as_posix(),
            ))
        with self._lock:
            session = self._read(project_id, session_id).model_copy(update={
                "status": "processing",
                "recording_asset_id": video_id,
                "recording_path": video_path.relative_to(root).as_posix(),
                "duration": duration,
                "tracks": tracks,
                "updated_at": datetime.now(timezone.utc),
            })
            self._write(project_id, session)

        video_dir.mkdir(parents=True, exist_ok=False)
        temporary = video_path.with_suffix(".mkv.part")
        shutil.copyfile(source, temporary)
        temporary.replace(video_path)
        for track in tracks:
            track_source = root / track.source_path
            track_source.parent.mkdir(parents=True, exist_ok=False)
            self._run_ffmpeg([
                "-i", str(video_path), "-map", f"0:{track.stream_index}", "-vn",
                "-af", "aresample=async=1:first_pts=0", "-c:a", "flac", str(track_source),
            ])
            self._run_ffmpeg([
                "-i", str(track_source), "-map", "0:a:0", "-ac", "1", "-ar", "24000",
                "-c:a", "pcm_s16le", str(root / track.analysis_path),
            ])
            track_probe = self._probe(track_source)
            track_audio = next(item for item in track_probe["streams"] if item.get("codec_type") == "audio")
            self.media.create(project_id, MediaAssetCreate(
                name=f"{source.stem} · {track.source_label}",
                source_extension=".flac", media_kind="audio",
                source_path=track.source_path, analysis_path=track.analysis_path,
                duration=float(track_probe.get("format", {}).get("duration") or duration),
                sample_rate=int(track_audio["sample_rate"]), audio_codec="flac", origin="import",
                transcription_status="skipped",
            ), track.asset_id)

        preview = video_dir / "analysis.wav"
        shutil.copyfile(root / tracks[0].analysis_path, preview)
        self.media.create(project_id, MediaAssetCreate(
            name=source.name, source_extension=".mkv", media_kind="video",
            source_path=video_path.relative_to(root).as_posix(),
            analysis_path=preview.relative_to(root).as_posix(),
            duration=duration, sample_rate=24000,
            audio_codec=str(audio[0].get("codec_name") or ""),
            video_codec=str(video.get("codec_name") or ""),
            origin="import", transcription_status="skipped",
        ), video_id)
        with self._lock:
            ready = session.model_copy(update={"status": "ready", "updated_at": datetime.now(timezone.utc)})
            self._write(project_id, ready)

    def _probe(self, path: Path) -> dict:
        result = subprocess.run(
            [str(self.ffprobe), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode:
            raise ValueError(result.stderr.strip() or "FFprobe không đọc được bản ghi OBS.")
        return json.loads(result.stdout)

    def _source(self, source_path: str) -> Path:
        source = Path(source_path).expanduser().resolve()
        if not source.is_file() or source.suffix.lower() != ".mkv":
            raise ValueError("Chọn file MKV do OBS đã ghi xong.")
        if not self.ffmpeg or not self.ffprobe:
            raise RuntimeError("Cần FFmpeg và FFprobe để nhận bản ghi OBS.")
        return source

    def _run_ffmpeg(self, arguments: list[str]) -> None:
        result = subprocess.run(
            [str(self.ffmpeg), "-y", "-nostdin", "-hide_banner", "-loglevel", "error", *arguments],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode:
            raise ValueError(result.stderr.strip() or "FFmpeg không trích xuất được track OBS.")

    def _cleanup(self, project_id: str, session: ObsCaptureSession) -> None:
        root = Path(self.projects.get(project_id).project_path).resolve() / "assets" / "media"
        for asset_id in [session.recording_asset_id, *(track.asset_id for track in session.tracks)]:
            if not asset_id:
                continue
            if not _ASSET_ID.fullmatch(asset_id):
                raise ValueError("Invalid OBS asset id")
            try:
                self.media.remove(project_id, asset_id)
            except KeyError:
                shutil.rmtree(root / asset_id, ignore_errors=True)

    def _root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path).resolve() / "assets" / "obs-sessions"

    def _path(self, project_id: str, session_id: str) -> Path:
        if not _SESSION_ID.fullmatch(session_id):
            raise KeyError(session_id)
        return self._root(project_id) / session_id / "session.json"

    def _read(self, project_id: str, session_id: str) -> ObsCaptureSession:
        path = self._path(project_id, session_id)
        if not path.is_file():
            raise KeyError(session_id)
        return ObsCaptureSession.model_validate_json(path.read_text(encoding="utf-8"))

    def _write(self, project_id: str, session: ObsCaptureSession) -> None:
        path = self._path(project_id, session.id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(session.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(path)
