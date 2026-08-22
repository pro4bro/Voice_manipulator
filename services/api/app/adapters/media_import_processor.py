from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from fastapi import UploadFile

from app.domain.models import MediaAssetCreate, MediaImportResult, ProjectRecord
from app.domain.ports import MediaLibrary


SUPPORTED_MEDIA_EXTENSIONS = {
    ".aac", ".ac3", ".aif", ".aiff", ".avi", ".av1", ".flac", ".h264",
    ".h265", ".hevc", ".m4a", ".mkv", ".mov", ".mp3", ".mp4", ".mxf",
    ".ogg", ".opus", ".prores", ".wav", ".webm", ".wma",
}
VIDEO_EXTENSIONS = {
    ".avi", ".av1", ".h264", ".h265", ".hevc", ".mkv", ".mov", ".mp4",
    ".mxf", ".prores", ".webm",
}


class MediaImportProcessor:
    def __init__(self, studio_url: str, library: MediaLibrary, ffmpeg_path: str | None = None) -> None:
        self.studio_url = studio_url.rstrip("/")
        self.library = library
        self.ffmpeg_path = ffmpeg_path or shutil.which("ffmpeg")
        self.ffprobe_path = self._find_ffprobe(self.ffmpeg_path)

    async def process(
        self,
        project: ProjectRecord,
        upload: UploadFile,
        origin: str,
        realtime_text: str = "",
    ) -> MediaImportResult:
        started = time.perf_counter()
        filename = Path(upload.filename or "media.wav").name
        extension = Path(filename).suffix.lower()
        if extension not in SUPPORTED_MEDIA_EXTENSIONS:
            raise ValueError(f"Định dạng {extension or 'không rõ'} chưa được hỗ trợ.")
        if origin not in {"import", "record"}:
            raise ValueError("Nguồn media không hợp lệ.")
        if not self.ffmpeg_path or not self.ffprobe_path:
            raise RuntimeError("Không tìm thấy FFmpeg/FFprobe để phân tích media.")

        asset_id = f"asset-{uuid4().hex[:12]}"
        asset_dir = Path(project.project_path) / "assets" / "media" / asset_id
        asset_dir.mkdir(parents=True, exist_ok=False)
        source_path = asset_dir / f"source{extension}"
        await self._save_upload(upload, source_path)
        portable_source_path = source_path.relative_to(Path(project.project_path)).as_posix()

        probe = await asyncio.to_thread(self._probe, source_path)
        audio_stream = next((stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"), None)
        video_stream = next((stream for stream in probe.get("streams", []) if stream.get("codec_type") == "video"), None)
        duration = self._duration(probe)
        media_kind = self._media_kind(extension, audio_stream, video_stream)

        if not audio_stream:
            asset = self.library.create(
                project.id,
                MediaAssetCreate(
                    name=filename,
                    source_extension=extension,
                    media_kind=media_kind,
                    source_path=portable_source_path,
                    duration=duration,
                    video_codec=self._codec(video_stream),
                    origin=origin,
                    status="no-audio",
                ),
                asset_id,
            )
            return MediaImportResult(asset=asset, elapsed=round(time.perf_counter() - started, 2))

        analysis_path = asset_dir / "analysis.wav"
        await asyncio.to_thread(self._extract_audio, source_path, analysis_path)
        portable_analysis_path = analysis_path.relative_to(Path(project.project_path)).as_posix()
        item, studio_elapsed = await self._run_studio_import(analysis_path, origin, realtime_text)
        asset = self.library.create(
            project.id,
            MediaAssetCreate(
                name=filename,
                source_extension=extension,
                media_kind=media_kind,
                source_path=portable_source_path,
                analysis_path=portable_analysis_path,
                studio_item_id=str(item.get("id", "")) or None,
                url=f"/api/projects/{project.id}/media/{asset_id}/audio",
                duration=float(item.get("duration") or duration),
                sample_rate=int(item.get("sample_rate") or 24000),
                audio_codec=self._codec(audio_stream),
                video_codec=self._codec(video_stream),
                text=str(item.get("text", "")),
                words=list(item.get("words", [])),
                origin=origin,
                status="ready",
            ),
            asset_id,
        )
        return MediaImportResult(asset=asset, item=item, elapsed=studio_elapsed)

    async def _save_upload(self, upload: UploadFile, destination: Path) -> None:
        size = 0
        with destination.open("wb") as output:
            while chunk := await upload.read(8 * 1024 * 1024):
                size += len(chunk)
                if size > 1_500_000_000:
                    raise ValueError("File media lớn hơn giới hạn 1,5 GB.")
                output.write(chunk)

    def _probe(self, source: Path) -> dict[str, Any]:
        result = subprocess.run(
            [self.ffprobe_path, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(source)],
            capture_output=True,
            check=False,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0:
            raise ValueError(f"Không đọc được media: {result.stderr.strip() or 'FFprobe error'}")
        return json.loads(result.stdout)

    def _extract_audio(self, source: Path, destination: Path) -> None:
        result = subprocess.run(
            [
                self.ffmpeg_path, "-y", "-hide_banner", "-loglevel", "error", "-i", str(source),
                "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(destination),
            ],
            capture_output=True,
            check=False,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0 or not destination.is_file():
            raise ValueError(f"Không trích xuất được audio: {result.stderr.strip() or 'FFmpeg error'}")

    async def _run_studio_import(
        self, analysis_path: Path, origin: str, realtime_text: str
    ) -> tuple[dict[str, Any], float]:
        timeout = httpx.Timeout(900.0, connect=3.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                with analysis_path.open("rb") as audio:
                    response = await client.post(
                        f"{self.studio_url}/api/audio/import",
                        files={"file": (analysis_path.name, audio, "audio/wav")},
                        data={"origin": origin, "realtime_text": realtime_text},
                    )
        except httpx.RequestError as exc:
            raise RuntimeError("OmniVoice Studio runtime chưa chạy.") from exc
        payload = response.json()
        if response.is_error:
            raise RuntimeError(payload.get("detail", f"Studio import thất bại ({response.status_code})."))
        return dict(payload["item"]), float(payload.get("elapsed", 0))

    @staticmethod
    def _codec(stream: dict[str, Any] | None) -> str | None:
        return str(stream.get("codec_name")) if stream and stream.get("codec_name") else None

    @staticmethod
    def _duration(probe: dict[str, Any]) -> float:
        try:
            return max(0.0, float(probe.get("format", {}).get("duration", 0)))
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _media_kind(
        extension: str,
        audio_stream: dict[str, Any] | None,
        video_stream: dict[str, Any] | None,
    ) -> str:
        if video_stream:
            return "video"
        if audio_stream:
            return "audio"
        return "video" if extension in VIDEO_EXTENSIONS else "audio"

    @staticmethod
    def _find_ffprobe(ffmpeg_path: str | None) -> str | None:
        if ffmpeg_path:
            sibling = Path(ffmpeg_path).with_name("ffprobe.exe" if Path(ffmpeg_path).suffix else "ffprobe")
            if sibling.is_file():
                return str(sibling)
        return shutil.which("ffprobe")
