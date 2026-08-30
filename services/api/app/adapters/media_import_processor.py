from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import uuid4

TranscriptionProgressCallback = Callable[[float], Awaitable[None]]

# The Studio request has been validated to 90 minutes. Use 99% of that ceiling
# so a boundary never fails due to container metadata or sample rounding.
STT_MAX_REQUEST_SECONDS = 90 * 60
STT_CHUNK_SECONDS = STT_MAX_REQUEST_SECONDS * 0.99
STT_CHUNK_OVERLAP_SECONDS = 2.0


@dataclass(frozen=True)
class TranscriptionChunk:
    source_start: float
    source_end: float
    timeline_start: float
    timeline_end: float
import httpx
from fastapi import UploadFile

from app.domain.models import MediaAssetCreate, MediaImportResult, ProjectMediaAsset, ProjectRecord
from app.domain.ports import MediaLibrary
from app.adapters.word_timing_quality import reconcile_word_timing_quality
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry


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
    def __init__(
        self,
        studio_url: str,
        library: MediaLibrary,
        ffmpeg_path: str | None = None,
        local_sources: LocalMediaSourceRegistry | None = None,
    ) -> None:
        self.studio_url = studio_url.rstrip("/")
        self.library = library
        self.ffmpeg_path = ffmpeg_path or shutil.which("ffmpeg")
        self.ffprobe_path = self._find_ffprobe(self.ffmpeg_path)
        self.local_sources = local_sources

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
        item = self._attach_timing_quality(item, duration)
        asset = self.library.create(
            project.id,
            MediaAssetCreate(
                **common,
                studio_item_id=str(item.get("id", "")) or None,
                duration=float(item.get("duration") or duration),
                sample_rate=int(item.get("sample_rate") or self._sample_rate(audio_stream) or 24000),
                text=str(item.get("text", "")),
                words=list(item.get("words", [])),
                word_timing_quality=str(item.get("word_timing_quality", "unverified")),
                word_timing_note=item.get("word_timing_note"),
                transcription_status="complete",
            ),
            asset_id,
        )
        return MediaImportResult(asset=asset, item=item, elapsed=studio_elapsed)

    async def process_local_path(
        self,
        project: ProjectRecord,
        source_value: str,
        *,
        cache_local: bool,
    ) -> MediaImportResult:
        """Import a native file while retaining its absolute locator only in app-local state."""
        started = time.perf_counter()
        original_path = Path(source_value).expanduser().resolve()
        if not original_path.is_file():
            raise ValueError("Không tìm thấy file nguồn. Hãy chọn lại file gốc.")
        extension = original_path.suffix.lower()
        if extension not in SUPPORTED_MEDIA_EXTENSIONS:
            raise ValueError(f"Định dạng {extension or 'không rõ'} chưa được hỗ trợ.")
        if not self.ffmpeg_path or not self.ffprobe_path:
            raise RuntimeError("Không tìm thấy FFmpeg/FFprobe để phân tích media.")

        asset_id = f"asset-{uuid4().hex[:12]}"
        project_root = Path(project.project_path)
        asset_dir = project_root / "assets" / "media" / asset_id
        asset_dir.mkdir(parents=True, exist_ok=False)
        cache_path = asset_dir / f"source{extension}"
        working_source = original_path
        cached_at: datetime | None = None
        if cache_local:
            await asyncio.to_thread(shutil.copy2, original_path, cache_path)
            working_source = cache_path
            cached_at = datetime.now(timezone.utc)

        probe = await asyncio.to_thread(self._probe, working_source)
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
        portable_source_path = cache_path.relative_to(project_root).as_posix()

        analysis_path: Path | None = None
        if audio_stream:
            analysis_path = asset_dir / "analysis.wav"
            await asyncio.to_thread(self._extract_audio, working_source, analysis_path)

        asset = self.library.create(
            project.id,
            MediaAssetCreate(
                name=original_path.name,
                source_extension=extension,
                media_kind=media_kind,
                source_path=portable_source_path,
                analysis_path=analysis_path.relative_to(project_root).as_posix() if analysis_path else None,
                has_external_source=True,
                local_cache_enabled=cache_local,
                local_cache_updated_at=cached_at,
                url=f"/api/projects/{project.id}/media/{asset_id}/audio" if analysis_path else None,
                duration=duration,
                sample_rate=self._sample_rate(audio_stream),
                audio_codec=self._codec(audio_stream),
                video_codec=self._codec(video_stream),
                origin="import",
                status="ready" if audio_stream else "no-audio",
                transcription_status="skipped" if audio_stream else "not-applicable",
            ),
            asset_id,
        )
        if self.local_sources:
            self.local_sources.set(project.id, asset_id, original_path)
        return MediaImportResult(asset=asset, elapsed=round(time.perf_counter() - started, 2))

    async def set_local_file_cache(
        self,
        project: ProjectRecord,
        asset: ProjectMediaAsset,
        enabled: bool,
    ) -> ProjectMediaAsset:
        if not asset.has_external_source:
            raise ValueError("Footage này được import bằng browser hoặc recorder nên đã là bản project-local.")
        if not self.local_sources:
            raise RuntimeError("Không có Local File Cache registry trên máy này. Hãy Open Project rồi chọn lại file nguồn.")
        original_value = self.local_sources.get(project.id, asset.id)
        if not original_value:
            raise FileNotFoundError("Không còn bản ghi file gốc trên máy này. Hãy import lại footage từ file gốc.")
        original_path = Path(original_value)
        if not original_path.is_file():
            raise FileNotFoundError("File gốc đã bị di chuyển hoặc xóa. Hãy chọn/import lại file đó.")
        if not self.ffmpeg_path or not self.ffprobe_path:
            raise RuntimeError("Không tìm thấy FFmpeg/FFprobe để cập nhật Local File Cache.")

        project_root = Path(project.project_path)
        cache_path = project_root / asset.source_path
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        working_source = original_path
        cached_at: datetime | None = None
        if enabled:
            await asyncio.to_thread(shutil.copy2, original_path, cache_path)
            working_source = cache_path
            cached_at = datetime.now(timezone.utc)

        if asset.analysis_path:
            analysis_path = project_root / asset.analysis_path
            await asyncio.to_thread(self._extract_audio, working_source, analysis_path)
        return self.library.update_local_cache(project.id, asset.id, enabled, cached_at)
    async def transcribe_existing(
        self,
        project: ProjectRecord,
        asset: ProjectMediaAsset,
        realtime_text: str = "",
        on_progress: TranscriptionProgressCallback | None = None,
        model: str = "large-v3",
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
            on_progress=on_progress,
            model=model,
        )
        if kept_ranges:
            item = self._restore_original_timeline(item, kept_ranges, asset.duration)
        item = self._attach_timing_quality(item, asset.duration)
        item = await asyncio.to_thread(self._write_and_read_stt_artifacts, analysis_path.parent, item)
        updated = self.library.apply_transcription(project.id, asset.id, item, asset.duration)
        return updated, elapsed

    @staticmethod
    def _srt_timestamp(value: float) -> str:
        milliseconds = max(0, round(float(value) * 1000))
        hours, remainder = divmod(milliseconds, 3_600_000)
        minutes, remainder = divmod(remainder, 60_000)
        seconds, milliseconds = divmod(remainder, 1_000)
        return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

    @staticmethod
    def _seconds_from_srt_timestamp(value: str) -> float:
        hours, minutes, seconds_milliseconds = value.strip().replace(".", ",").split(":")
        seconds, milliseconds = seconds_milliseconds.split(",")
        return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(milliseconds.ljust(3, "0")[:3]) / 1000

    @classmethod
    def _write_and_read_stt_artifacts(cls, asset_dir: Path, item: dict[str, Any]) -> dict[str, Any]:
        """Make a human-checkable SRT the canonical hand-off into the Script model."""
        artifact_dir = asset_dir / "stt"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        srt_path = artifact_dir / "transcript.stt.srt"
        json_path = artifact_dir / "transcript.stt.json"
        raw_words = [dict(word) for word in item.get("words", []) if isinstance(word, dict)]
        blocks: list[str] = []
        for index, word in enumerate(raw_words, start=1):
            text = str(word.get("text") or "").strip()
            try:
                start = max(0.0, float(word.get("start", 0.0)))
                end = max(start, float(word.get("end", start)))
            except (TypeError, ValueError):
                continue
            if text:
                blocks.append(f"{index}\n{cls._srt_timestamp(start)} --> {cls._srt_timestamp(end)}\n{text}")
        srt_path.write_text("\n\n".join(blocks) + ("\n" if blocks else ""), encoding="utf-8")
        json_path.write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        canonical_words: list[dict[str, Any]] = []
        for block in srt_path.read_text(encoding="utf-8").replace("\r\n", "\n").split("\n\n"):
            lines = [line.strip() for line in block.split("\n") if line.strip()]
            if len(lines) < 3 or "-->" not in lines[1]:
                continue
            try:
                source_index = int(lines[0]) - 1
                start_value, end_value = (cls._seconds_from_srt_timestamp(part) for part in lines[1].split("-->", 1))
            except (ValueError, TypeError, IndexError):
                continue
            text = " ".join(lines[2:]).strip()
            if text:
                source_word = dict(raw_words[source_index]) if 0 <= source_index < len(raw_words) else {}
                source_word.update({"text": text, "start": start_value, "end": max(start_value, end_value)})
                canonical_words.append(source_word)
        canonical = dict(item)
        canonical["words"] = canonical_words
        # A fully source-timed SRT remains the canonical Script hand-off. If a
        # processor could not time every segment, keep the independent transcript
        # instead of deleting untimed text while round-tripping the partial SRT.
        canonical["text"] = (
            " ".join(str(word["text"]) for word in canonical_words)
            if item.get("word_timing_quality") == "source"
            else str(item.get("text") or "").strip()
        )
        canonical["artifact_srt"] = srt_path.name
        return canonical
    @staticmethod
    def _attach_timing_quality(item: dict[str, Any], duration: float) -> dict[str, Any]:
        """Validate recognizer boundaries without upgrading their provenance."""
        inspection = reconcile_word_timing_quality(
            str(item.get("word_timing_quality", "unverified")),
            item.get("word_timing_note"),
            list(item.get("words", [])),
            duration,
        )
        enriched = dict(item)
        enriched["words"] = inspection.words
        enriched["word_timing_quality"] = inspection.quality
        enriched["word_timing_note"] = inspection.note
        return enriched
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
        on_progress: TranscriptionProgressCallback | None = None,
        model: str = "large-v3",
    ) -> tuple[dict[str, Any], float]:
        duration = await asyncio.to_thread(self._audio_duration, analysis_path)
        chunks = self._stt_chunks(duration)
        if len(chunks) == 1:
            return await self._upload_studio_audio(
                analysis_path, origin, realtime_text, on_progress=on_progress, model=model
            )

        cache_dir = analysis_path.parent / "cache" / "stt-chunks"
        cache_dir.mkdir(parents=True, exist_ok=True)
        job_id = uuid4().hex[:8]
        results: list[tuple[TranscriptionChunk, dict[str, Any]]] = []
        elapsed = 0.0
        try:
            for index, chunk in enumerate(chunks, start=1):
                chunk_path = cache_dir / f"stt-{job_id}-{index:03d}.wav"

                async def report_chunk_progress(value: float, *, completed: int = index - 1) -> None:
                    if on_progress is None:
                        return
                    overall = ((completed + max(0.0, min(100.0, value)) / 100) / len(chunks)) * 100
                    await on_progress(round(overall, 1))

                try:
                    await asyncio.to_thread(self._extract_stt_chunk, analysis_path, chunk, chunk_path)
                    item, chunk_elapsed = await self._upload_studio_audio(
                        chunk_path,
                        origin,
                        realtime_text if index == 1 else "",
                        on_progress=report_chunk_progress if on_progress else None,
                        model=model,
                    )
                    results.append((chunk, item))
                    elapsed += chunk_elapsed
                finally:
                    chunk_path.unlink(missing_ok=True)
            return self._merge_studio_chunks(results, duration), elapsed
        finally:
            try:
                cache_dir.rmdir()
            except OSError:
                pass
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

    def _extract_stt_chunk(self, source: Path, chunk: TranscriptionChunk, destination: Path) -> None:
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
                    start = chunk.source_start + float(word.get("start", 0.0))
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
    async def _upload_studio_audio(
        self,
        analysis_path: Path,
        origin: str,
        realtime_text: str,
        *,
        on_progress: TranscriptionProgressCallback | None = None,
        model: str = "large-v3",
    ) -> tuple[dict[str, Any], float]:
        # A queued local STT job may legitimately run for hours; keep the import request alive.
        timeout = httpx.Timeout(timeout=None, connect=5.0)
        progress_id = uuid4().hex if on_progress else ""
        latest_progress = -1.0
        progress_endpoint_available = bool(progress_id)

        async def publish(value: object) -> None:
            nonlocal latest_progress
            try:
                progress = round(max(0.0, min(100.0, float(value))), 1)
            except (TypeError, ValueError):
                return
            if on_progress is None or progress <= latest_progress:
                return
            latest_progress = progress
            await on_progress(progress)

        data = {"origin": origin, "realtime_text": realtime_text, "model": model}
        if progress_id:
            data["progress_id"] = progress_id

        async def send(client: httpx.AsyncClient, *, by_path: bool) -> httpx.Response:
            """Run one import request while relaying the sidecar's progress."""
            if by_path:
                task = asyncio.create_task(
                    client.post(
                        f"{self.studio_url}/api/audio/import",
                        data={**data, "source_path": str(analysis_path.resolve())},
                    )
                )
                return await self._await_import(client, task, progress_id, publish)
            with analysis_path.open("rb") as audio:
                task = asyncio.create_task(
                    client.post(
                        f"{self.studio_url}/api/audio/import",
                        files={"file": (analysis_path.name, audio, "audio/wav")},
                        data=data,
                    )
                )
                return await self._await_import(client, task, progress_id, publish)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                # The sidecar runs on this machine, so handing it a path avoids
                # streaming and re-writing a multi-hundred-megabyte WAV. Older
                # sidecars reject the field; fall back rather than fail.
                response = await send(client, by_path=True)
                if response.status_code in {400, 422}:
                    response = await send(client, by_path=False)
        except httpx.RequestError as exc:
            raise RuntimeError("OmniVoice Studio runtime chưa chạy.") from exc
        payload = response.json()
        if response.is_error:
            raise RuntimeError(payload.get("detail", f"Studio import thất bại ({response.status_code})."))
        await publish(100)
        return dict(payload["item"]), float(payload.get("elapsed", 0))

    async def _await_import(
        self,
        client: httpx.AsyncClient,
        task: asyncio.Task[httpx.Response],
        progress_id: str,
        publish: Callable[[object], Awaitable[None]],
    ) -> httpx.Response:
        progress_endpoint_available = bool(progress_id)
        while not task.done():
            await asyncio.sleep(0.15)
            if not progress_endpoint_available:
                continue
            try:
                status = await client.get(
                    f"{self.studio_url}/api/audio/import/{progress_id}/progress",
                    timeout=httpx.Timeout(1.5, connect=1.0),
                )
                if status.status_code == 404:
                    progress_endpoint_available = False
                elif not status.is_error:
                    await publish(status.json().get("progress", 0))
            except httpx.RequestError:
                # The import request itself reports the final connection failure.
                continue
        return await task

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
