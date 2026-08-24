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

from app.domain.models import MediaAssetCreate, MediaImportResult, ProjectMediaAsset, ProjectRecord
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
        transcribe: bool = True,
        queue_for_transcription: bool = False,
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
        audio_stream = next(
            (stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"),
            None,
        )
        video_stream = next(
            (stream for stream in probe.get("streams", []) if stream.get("codec_type") == "video"),
            None,
        )
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
                    transcription_status="not-applicable",
                ),
                asset_id,
            )
            return MediaImportResult(asset=asset, elapsed=round(time.perf_counter() - started, 2))

        analysis_path = asset_dir / "analysis.wav"
        await asyncio.to_thread(self._extract_audio, source_path, analysis_path)
        portable_analysis_path = analysis_path.relative_to(Path(project.project_path)).as_posix()
        common = {
            "name": filename,
            "source_extension": extension,
            "media_kind": media_kind,
            "source_path": portable_source_path,
            "analysis_path": portable_analysis_path,
            "url": f"/api/projects/{project.id}/media/{asset_id}/audio",
            "duration": duration,
            "sample_rate": self._sample_rate(audio_stream),
            "audio_codec": self._codec(audio_stream),
            "video_codec": self._codec(video_stream),
            "origin": origin,
            "status": "ready",
        }
        if not transcribe:
            asset = self.library.create(
                project.id,
                MediaAssetCreate(
                    **common,
                    text=realtime_text,
                    transcription_status="queued" if queue_for_transcription else "skipped",
                    transcription_selected=queue_for_transcription,
                    ai_review_status="pending" if queue_for_transcription else "skipped",
                ),
                asset_id,
            )
            return MediaImportResult(asset=asset, elapsed=round(time.perf_counter() - started, 2))

        item, studio_elapsed = await self._run_studio_import(analysis_path, origin, realtime_text)
        asset = self.library.create(
            project.id,
            MediaAssetCreate(
                **common,
                studio_item_id=str(item.get("id", "")) or None,
                duration=float(item.get("duration") or duration),
                sample_rate=int(item.get("sample_rate") or self._sample_rate(audio_stream) or 24000),
                text=str(item.get("text", "")),
                words=list(item.get("words", [])),
                transcription_status="complete",
            ),
            asset_id,
        )
        return MediaImportResult(asset=asset, item=item, elapsed=studio_elapsed)

    async def transcribe_existing(
        self, project: ProjectRecord, asset: ProjectMediaAsset, realtime_text: str = ""
    ) -> tuple[ProjectMediaAsset, float]:
        if not asset.analysis_path:
            raise ValueError("Footage không có analysis audio để chạy Speech to Text.")
        analysis_path = Path(project.project_path) / asset.analysis_path
        if not analysis_path.is_file():
            raise FileNotFoundError("Analysis audio không còn trong project.")
        processing_path, kept_ranges = await asyncio.to_thread(self._prepare_processing_audio, analysis_path, asset)
        item, elapsed = await self._run_studio_import(
            processing_path,
            asset.origin,
            realtime_text or asset.text,
        )
        if kept_ranges:
            item = self._restore_original_timeline(item, kept_ranges, asset.duration)
        updated = self.library.apply_transcription(project.id, asset.id, item, asset.duration)
        return updated, elapsed

    def _prepare_processing_audio(
        self, analysis_path: Path, asset: ProjectMediaAsset
    ) -> tuple[Path, list[tuple[float, float]] | None]:
        """Create compact STT input and keep its inverse mapping to the original Timeline."""
        removed = sorted(asset.removed_ranges, key=lambda item: (item.start, item.end))
        if not removed:
            return analysis_path, None
        duration = max(0.0, asset.duration)
        cursor = 0.0
        kept: list[tuple[float, float]] = []
        for item in removed:
            start = min(duration, max(0.0, item.start))
            end = min(duration, max(start, item.end))
            if start > cursor:
                kept.append((cursor, start))
            cursor = max(cursor, end)
        if cursor < duration:
            kept.append((cursor, duration))
        if not kept:
            raise ValueError("Toàn bộ footage đã bị loại khỏi timeline; hãy Uncut hoặc Reset trước khi chạy STT.")
        destination = analysis_path.with_name("analysis-timeline-edited.wav")
        filters = [
            f"[0:a]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS[s{index}]"
            for index, (start, end) in enumerate(kept)
        ]
        inputs = "".join(f"[s{index}]" for index in range(len(kept)))
        filters.append(f"{inputs}concat=n={len(kept)}:v=0:a=1[out]")
        result = subprocess.run(
            [
                self.ffmpeg_path, "-y", "-hide_banner", "-loglevel", "error", "-i", str(analysis_path),
                "-filter_complex", ";".join(filters), "-map", "[out]", "-ac", "1", "-ar", "24000",
                "-c:a", "pcm_s16le", str(destination),
            ],
            capture_output=True,
            check=False,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0 or not destination.is_file():
            raise ValueError(f"Không tạo được audio đã cắt: {result.stderr.strip() or 'FFmpeg error'}")
        return destination, kept

    @staticmethod
    def _restore_original_timeline(
        item: dict[str, Any], kept_ranges: list[tuple[float, float]], original_duration: float
    ) -> dict[str, Any]:
        """Map compacted STT word offsets back to the original, playable audio timeline."""
        restored = dict(item)

        def original_time(value: Any) -> float:
            try:
                compact_time = max(0.0, float(value))
            except (TypeError, ValueError):
                compact_time = 0.0
            consumed = 0.0
            for start, end in kept_ranges:
                span = max(0.0, end - start)
                if compact_time <= consumed + span:
                    return min(end, max(start, start + compact_time - consumed))
                consumed += span
            return kept_ranges[-1][1]

        restored_words: list[dict[str, Any]] = []
        for raw_word in item.get("words", []):
            if not isinstance(raw_word, dict):
                continue
            word = dict(raw_word)
            start = original_time(word.get("start", 0.0))
            end = original_time(word.get("end", word.get("start", 0.0)))
            word["start"] = start
            word["end"] = max(start, end)
            restored_words.append(word)
        restored["words"] = restored_words
        # The app always plays the original project analysis WAV, so its duration stays authoritative.
        restored["duration"] = max(0.0, original_duration)
        return restored

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
    def _sample_rate(stream: dict[str, Any] | None) -> int | None:
        try:
            return int(stream.get("sample_rate")) if stream and stream.get("sample_rate") else None
        except (TypeError, ValueError):
            return None

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
            sibling = Path(ffmpeg_path).with_name(
                "ffprobe.exe" if Path(ffmpeg_path).suffix else "ffprobe"
            )
            if sibling.is_file():
                return str(sibling)
        return shutil.which("ffprobe")