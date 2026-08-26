from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass
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

# A short request keeps the Studio sidecar responsive and avoids one multi-hour upload
# exceeding the HTTP deadline. The overlap protects words at chunk boundaries.
STT_CHUNK_SECONDS = 10 * 60
STT_CHUNK_OVERLAP_SECONDS = 2.0


@dataclass(frozen=True)
class TranscriptionChunk:
    source_start: float
    source_end: float
    timeline_start: float
    timeline_end: float


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

        def report_chunk_progress(completed: int, total: int) -> None:
            # Reserve the last fifth of the job for persisting transcript + AI review.
            progress = min(80, 5 + round(75 * completed / max(1, total)))
            self.library.set_transcription_state(
                project.id,
                asset.id,
                "processing",
                ai_review_status="pending",
                progress=progress,
            )

        item, elapsed = await self._run_studio_import(
            processing_path,
            asset.origin,
            realtime_text or asset.text,
            on_chunk_complete=report_chunk_progress,
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
        self,
        analysis_path: Path,
        origin: str,
        realtime_text: str,
        *,
        on_chunk_complete: Callable[[int, int], None] | None = None,
    ) -> tuple[dict[str, Any], float]:
        duration = await asyncio.to_thread(self._audio_duration, analysis_path)
        chunks = self._stt_chunks(duration)
        if len(chunks) == 1:
            item, elapsed = await self._upload_studio_audio(analysis_path, origin, realtime_text)
            if on_chunk_complete:
                on_chunk_complete(1, 1)
            return item, elapsed

        # Files over ten minutes are processed sequentially. This avoids a single multi-hour
        # request monopolising Studio or reaching its request timeout while still preserving
        # word timestamps on the original timeline.
        cache_dir = analysis_path.parent / "cache" / "stt-chunks"
        cache_dir.mkdir(parents=True, exist_ok=True)
        job_id = uuid4().hex[:8]
        results: list[tuple[TranscriptionChunk, dict[str, Any]]] = []
        elapsed = 0.0
        try:
            for index, chunk in enumerate(chunks, start=1):
                chunk_path = cache_dir / f"stt-{job_id}-{index:03d}.wav"
                try:
                    await asyncio.to_thread(self._extract_stt_chunk, analysis_path, chunk, chunk_path)
                    item, chunk_elapsed = await self._upload_studio_audio(chunk_path, origin, "")
                    results.append((chunk, item))
                    elapsed += chunk_elapsed
                finally:
                    chunk_path.unlink(missing_ok=True)
                if on_chunk_complete:
                    on_chunk_complete(index, len(chunks))
        finally:
            try:
                cache_dir.rmdir()
            except OSError:
                pass
        return self._merge_studio_chunks(results, duration), elapsed

    async def _upload_studio_audio(
        self, audio_path: Path, origin: str, realtime_text: str
    ) -> tuple[dict[str, Any], float]:
        timeout = httpx.Timeout(900.0, connect=3.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                with audio_path.open("rb") as audio:
                    response = await client.post(
                        f"{self.studio_url}/api/audio/import",
                        files={"file": (audio_path.name, audio, "audio/wav")},
                        data={"origin": origin, "realtime_text": realtime_text},
                    )
        except httpx.ReadTimeout as exc:
            raise RuntimeError(
                "Studio mất quá 15 phút để xử lý một đoạn audio. Hãy thử lại; audio dài sẽ tự chia đoạn 10 phút."
            ) from exc
        except httpx.RequestError as exc:
            raise RuntimeError("OmniVoice Studio runtime chưa chạy.") from exc
        payload = response.json()
        if response.is_error:
            raise RuntimeError(payload.get("detail", f"Studio import thất bại ({response.status_code})."))
        return dict(payload["item"]), float(payload.get("elapsed", 0))

    def _audio_duration(self, audio_path: Path) -> float:
        return self._duration(self._probe(audio_path))

    @staticmethod
    def _stt_chunks(duration: float) -> list[TranscriptionChunk]:
        total = max(0.0, duration)
        if total <= STT_CHUNK_SECONDS:
            return [TranscriptionChunk(0.0, total, 0.0, total)]
        chunks: list[TranscriptionChunk] = []
        timeline_start = 0.0
        while timeline_start < total:
            timeline_end = min(total, timeline_start + STT_CHUNK_SECONDS)
            chunks.append(
                TranscriptionChunk(
                    source_start=max(0.0, timeline_start - STT_CHUNK_OVERLAP_SECONDS),
                    source_end=min(total, timeline_end + STT_CHUNK_OVERLAP_SECONDS),
                    timeline_start=timeline_start,
                    timeline_end=timeline_end,
                )
            )
            timeline_start = timeline_end
        return chunks

    def _extract_stt_chunk(
        self, source: Path, chunk: TranscriptionChunk, destination: Path
    ) -> None:
        length = max(0.001, chunk.source_end - chunk.source_start)
        result = subprocess.run(
            [
                self.ffmpeg_path, "-y", "-hide_banner", "-loglevel", "error",
                "-ss", f"{chunk.source_start:.6f}", "-i", str(source), "-t", f"{length:.6f}",
                "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le",
                str(destination),
            ],
            capture_output=True,
            check=False,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0 or not destination.is_file():
            raise ValueError(f"Không cắt được audio cho STT: {result.stderr.strip() or 'FFmpeg error'}")

    @staticmethod
    def _merge_studio_chunks(
        results: list[tuple[TranscriptionChunk, dict[str, Any]]], duration: float
    ) -> dict[str, Any]:
        if not results:
            raise RuntimeError("Studio không trả về kết quả Speech to Text.")
        merged = dict(results[-1][1])
        words: list[dict[str, Any]] = []
        fallback_text: list[str] = []
        for chunk, item in results:
            item_words = item.get("words", [])
            has_words = False
            for raw_word in item_words if isinstance(item_words, list) else []:
                if not isinstance(raw_word, dict):
                    continue
                word = dict(raw_word)
                try:
                    start = max(chunk.source_start, chunk.source_start + float(word.get("start", 0.0)))
                    end = max(start, chunk.source_start + float(word.get("end", word.get("start", 0.0))))
                except (TypeError, ValueError):
                    continue
                if start < chunk.timeline_start or start >= chunk.timeline_end:
                    continue
                word["start"] = round(min(duration, start), 6)
                word["end"] = round(min(duration, end), 6)
                words.append(word)
                has_words = True
            if not has_words and item.get("text"):
                fallback_text.append(str(item["text"]).strip())
        merged["words"] = words
        merged["text"] = " ".join(
            str(word.get("text", "")).strip() for word in words if str(word.get("text", "")).strip()
        ) or " ".join(text for text in fallback_text if text)
        merged["duration"] = max(0.0, duration)
        if len(results) > 1:
            merged["transcription_engine"] = f"OmniVoice Studio · {len(results)} segments"
        return merged
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