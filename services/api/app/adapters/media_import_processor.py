from __future__ import annotations

import asyncio
import hashlib
import json
import math
import shutil
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID, uuid4
from app.adapters.activity_center import CENTER, request_task_id

TranscriptionProgressCallback = Callable[[float], Awaitable[None]]

# Transport can accept 90 minutes, but recognition needs bounded context:
# a real 406s OBS request omitted 28.668s of speech before conversion/merge.
# 60s requests with the existing overlap recovered it (STT-GAP-01). This also
# bounds the initial full OBS snapshot without changing its frozen cursor.
STT_MAX_REQUEST_SECONDS = 90 * 60
STT_CHUNK_SECONDS = min(60.0, STT_MAX_REQUEST_SECONDS * 0.99)
STT_CHUNK_OVERLAP_SECONDS = 2.0
STUDIO_STT_MODELS = frozenset({"tiny", "base", "small", "medium", "large-v3"})


@dataclass(frozen=True)
class TranscriptionChunk:
    source_start: float
    source_end: float
    timeline_start: float
    timeline_end: float
import httpx
from fastapi import UploadFile

from app.domain.models import MediaAssetCreate, MediaAudioTrackChoice, MediaImportResult, ProjectMediaAsset, ProjectRecord
from app.domain.ports import MediaLibrary
from app.adapters.word_timing_quality import reconcile_word_timing_quality, space_recognized_words
from app.domain.timeline_intervals import excluded_intervals
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry
from app.adapters.media_asset_paths import create_media_asset_directory, media_asset_file, safe_media_stem
from app.adapters.processing_cancellation import ProcessingCancellation, ProcessingStopError


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
        other_stt: dict[str, Callable[..., dict[str, Any]]] | None = None,
    ) -> None:
        self.studio_url = studio_url.rstrip("/")
        # Speech-to-text engines other than the Studio sidecar, keyed by the
        # model value the queue carries. Each returns the same item shape. A
        # value `engine@variant` names a project-trained adapter for the engine.
        self.other_stt = other_stt or {}
        self.library = library
        self.ffmpeg_path = ffmpeg_path or shutil.which("ffmpeg")
        self.ffprobe_path = self._find_ffprobe(self.ffmpeg_path)
        self.local_sources = local_sources
        self._track_locks: dict[tuple[str, str], asyncio.Lock] = {}

    @staticmethod
    def _begin_import_task(project: ProjectRecord, label: str, *, asset_id: str | None = None,
                           footage_id: str | None = None):
        task_id = request_task_id("import")
        owned = task_id is None
        if owned:
            task_id = f"import-{uuid4().hex}"
            CENTER.start_task("import", label, task_id=task_id, detail="Preparing media import",
                project_id=project.id, asset_id=asset_id, footage_id=footage_id or asset_id,
                group_label=label, status="running")
        else:
            CENTER.update_task(task_id, label=label, detail="Preparing media import", fraction=None,
                asset_id=asset_id, footage_id=footage_id or asset_id, group_label=label)
        return task_id, owned

    @staticmethod
    def _import_progress(activity, detail: str, *, fraction: float | None = None,
                         asset_id: str | None = None, footage_id: str | None = None,
                         group_label: str | None = None) -> None:
        if activity is None:
            return
        task_id, _ = activity
        CENTER.update_task(task_id, detail=detail, fraction=fraction, asset_id=asset_id,
            footage_id=footage_id, group_label=group_label)

    @staticmethod
    def _end_import_task(activity, *, error: Exception | None = None) -> None:
        if activity is None:
            return
        task_id, owned = activity
        detail = str(error) if error else "Media import artifacts published"
        if not owned:
            if error:
                CENTER.update_task(task_id, detail=f"Import failed: {error}", fraction=None)
            return
        CENTER.finish_task(task_id, status="failed" if error else "complete", detail=detail,
            error=str(error) if error else None)

    @staticmethod
    def _copy_file(source: Path, destination: Path, progress=None) -> None:
        total = source.stat().st_size
        copied = 0
        with source.open("rb") as input_file, destination.open("wb") as output:
            while chunk := input_file.read(1024 * 1024):
                output.write(chunk)
                copied += len(chunk)
                if progress is not None and total > 0:
                    progress(copied, total)
            output.flush()
        shutil.copystat(source, destination)

    async def materialize_audio_track(self, project: ProjectRecord, parent_id: str,
                                      stream_index: int) -> ProjectMediaAsset:
        parent = self.library.get(project.id, parent_id)
        activity = self._begin_import_task(project, parent.name, asset_id=parent_id, footage_id=parent_id)
        try:
            result = await self._materialize_audio_track(project, parent_id, stream_index, activity=activity)
        except Exception as exc:
            self._end_import_task(activity, error=exc)
            raise
        self._end_import_task(activity)
        return result

    async def _materialize_audio_track(self, project: ProjectRecord, parent_id: str,
                                      stream_index: int, *, activity=None) -> ProjectMediaAsset:
        """Add an omitted completed-container stream without replacing the source."""
        key = project.id, parent_id
        async with self._track_locks.setdefault(key, asyncio.Lock()):
            parent = self.library.get(project.id, parent_id)
            if parent.source_archive_asset_id or parent.deleted_at or parent.disabled:
                raise ValueError("Chọn footage đang hoạt động để thêm track.")
            if parent.growing_mkv_follow and not parent.source_path.endswith("source-final.mkv"):
                raise ValueError("Finish MKV sau khi OBS dừng trước khi thêm track.")
            choice = next((track for track in parent.available_audio_tracks
                           if track.stream_index == stream_index), None)
            if choice is None:
                raise ValueError("Track audio không thuộc footage này.")
            existing = next((asset for asset in self.library.list(project.id) if
                             asset.source_archive_asset_id == parent_id and
                             asset.source_archive_stream_index == stream_index), None)
            if existing:
                if existing.deleted_at or existing.disabled:
                    raise ValueError("Khôi phục và bật track trước khi Import.")
                return self.library.set_import_selected(project.id, existing.id, True)
            if not self.ffmpeg_path or not self.ffprobe_path:
                raise RuntimeError("Không tìm thấy FFmpeg/FFprobe để thêm track.")
            root = Path(project.project_path).resolve()
            source = (root / parent.source_path).resolve()
            if not source.is_relative_to(root):
                raise ValueError("Đường dẫn nguồn ngoài project.")
            if parent.has_external_source and not parent.local_cache_enabled:
                original = self.local_sources.get(project.id, parent_id) if self.local_sources else None
                if not original:
                    raise FileNotFoundError("Không tìm thấy file gốc. Bật Local File Cache hoặc kết nối lại nguồn.")
                source = Path(original)
            if not source.is_file():
                raise FileNotFoundError("Không tìm thấy file media nguồn.")
            probe = await asyncio.to_thread(self._probe, source)
            if not any(stream.get("index") == stream_index and stream.get("codec_type") == "audio"
                       for stream in probe.get("streams", [])):
                raise ValueError("Nguồn hiện tại không còn track audio đã chọn.")
            child_id = f"asset-{uuid4().hex[:12]}"
            self._import_progress(activity, "Extracting selected audio track",
                asset_id=child_id, footage_id=parent_id, group_label=parent.name)
            folder = create_media_asset_directory(root, child_id, f"{safe_media_stem(parent.name)[:40]} - Track {stream_index} - {choice.title}.wav")
            analysis = media_asset_file(folder, "analysis.wav")
            # A failed decode leaves only an unpublished derivative; retry gets a
            # fresh file, and the source/parent selection remains untouched.
            await asyncio.to_thread(self._extract_audio_streams, source, [(analysis, stream_index)])
            duration = await asyncio.to_thread(self._audio_duration, analysis)
            return self.library.publish_audio_track(project.id, parent_id, MediaAssetCreate(
                name=f"{parent.name} · {choice.title}"[:512], source_extension=".wav",
                media_kind="audio", source_path=analysis.relative_to(root).as_posix(),
                analysis_path=analysis.relative_to(root).as_posix(),
                source_archive_asset_id=parent_id, source_archive_stream_index=stream_index,
                url=f"/api/projects/{project.id}/media/{child_id}/audio",
                duration=duration, sample_rate=24000, audio_codec="pcm_s16le",
                origin=parent.origin, capture_tier=parent.capture_tier,
                transcription_status="skipped", import_selected=True,
            ), child_id)

    async def process(
        self,
        project: ProjectRecord,
        upload: UploadFile,
        origin: str,
        realtime_text: str = "",
        transcribe: bool = True,
        queue_for_transcription: bool = False,
        capture_tier: str | None = None,
        reading_session_id: str | None = None,
        reading_card_id: str | None = None,
        capture_id: str | None = None,
        source_content_hash: str | None = None,
        reading_speaker_profile_id: str | None = None,
        reading_emotion: str | None = None,
    ) -> MediaImportResult:
        filename = Path(upload.filename or "media.wav").name
        activity = self._begin_import_task(project, filename)
        try:
            result = await self._process(project, upload, origin, realtime_text, transcribe,
                queue_for_transcription, capture_tier, reading_session_id, reading_card_id,
                capture_id, source_content_hash, reading_speaker_profile_id, reading_emotion,
                activity=activity)
        except Exception as exc:
            self._end_import_task(activity, error=exc)
            raise
        self._end_import_task(activity)
        return result

    async def _process(
        self,
        project: ProjectRecord,
        upload: UploadFile,
        origin: str,
        realtime_text: str = "",
        transcribe: bool = True,
        queue_for_transcription: bool = False,
        capture_tier: str | None = None,
        reading_session_id: str | None = None,
        reading_card_id: str | None = None,
        capture_id: str | None = None,
        source_content_hash: str | None = None,
        reading_speaker_profile_id: str | None = None,
        reading_emotion: str | None = None,
        *, activity=None,
    ) -> MediaImportResult:
        started = time.perf_counter()
        filename = Path(upload.filename or "media.wav").name
        extension = Path(filename).suffix.lower()
        if extension not in SUPPORTED_MEDIA_EXTENSIONS:
            raise ValueError(f"Định dạng {extension or 'không rõ'} chưa được hỗ trợ.")
        if origin not in {"import", "record"}:
            raise ValueError("Nguồn media không hợp lệ.")
        if capture_tier is not None and capture_tier not in {"guided", "record", "import"}:
            raise ValueError("Capture tier không hợp lệ.")
        capture_values = (
            reading_session_id, reading_card_id, capture_id, source_content_hash,
            reading_speaker_profile_id, reading_emotion,
        )
        if any(value is not None for value in capture_values):
            if not all(capture_values):
                raise ValueError("Guided capture metadata must be supplied together.")
            try:
                if str(UUID(reading_session_id)) != reading_session_id or str(UUID(capture_id)) != capture_id:
                    raise ValueError("Guided capture IDs must be canonical UUIDs.")
            except (TypeError, ValueError, AttributeError) as exc:
                raise ValueError("Guided capture IDs must be canonical UUIDs.") from exc
            if len(source_content_hash) != 64 or any(char not in "0123456789abcdef" for char in source_content_hash):
                raise ValueError("Guided capture source hash must be lowercase SHA-256.")
            if extension != ".wav":
                raise ValueError("Guided Reading Session takes must be uploaded as WAV audio.")
        if not self.ffmpeg_path or not self.ffprobe_path:
            raise RuntimeError("Không tìm thấy FFmpeg/FFprobe để phân tích media.")

        asset_id = f"asset-{uuid4().hex[:12]}"
        self._import_progress(activity, "Saving uploaded source",
            asset_id=asset_id, footage_id=asset_id, group_label=filename)
        asset_dir = create_media_asset_directory(Path(project.project_path), asset_id, filename)
        source_path = media_asset_file(asset_dir, f"source{extension}")
        await self._save_upload(upload, source_path,
            on_progress=lambda copied, total: self._import_progress(activity,
                f"Copied source {copied}/{total} bytes", fraction=copied / total,
                asset_id=asset_id, footage_id=asset_id, group_label=filename) if total else None)
        if source_content_hash is not None:
            actual_hash = await asyncio.to_thread(self._sha256_file, source_path)
            if actual_hash != source_content_hash:
                raise ValueError("Guided capture bytes do not match the declared source hash.")
        portable_source_path = source_path.relative_to(Path(project.project_path)).as_posix()

        self._import_progress(activity, "Inspecting uploaded media", asset_id=asset_id,
            footage_id=asset_id, group_label=filename)
        probe = await asyncio.to_thread(self._probe, source_path)
        audio_stream = next(
            (stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"),
            None,
        )
        audio_streams = [stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"]
        video_stream = next(
            (stream for stream in probe.get("streams", []) if stream.get("codec_type") == "video"),
            None,
        )
        duration = self._duration(probe)
        media_kind = self._media_kind(extension, audio_stream, video_stream)

        if reading_session_id and (len(audio_streams) != 1 or video_stream is not None):
            raise ValueError("Guided Reading Session takes must contain one audio stream and no video.")

        if len(audio_streams) > 1:
            return await self._import_multitrack(
                project, asset_id, asset_dir, source_path, portable_source_path,
                filename, extension, audio_streams, video_stream, duration,
                origin=origin, capture_tier=capture_tier or origin,
                transcribe=transcribe, queue_for_transcription=queue_for_transcription,
                started=started,
                activity=activity,
            )

        if not audio_stream:
            self._import_progress(activity, "Publishing media without audio", asset_id=asset_id,
                footage_id=asset_id, group_label=filename)
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
                    capture_tier=capture_tier or origin,
                    status="no-audio",
                    transcription_status="not-applicable",
                ),
                asset_id,
            )
            return MediaImportResult(asset=asset, elapsed=round(time.perf_counter() - started, 2))

        analysis_path = media_asset_file(asset_dir, "analysis.wav")
        self._import_progress(activity, "Extracting project analysis audio", asset_id=asset_id,
            footage_id=asset_id, group_label=filename)
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
            "capture_tier": capture_tier or origin,
            "status": "ready",
        }
        if reading_session_id:
            common.update({
                "reading_session_id": reading_session_id,
                "reading_card_id": reading_card_id,
                "capture_id": capture_id,
                "source_content_hash": source_content_hash,
                "speaker_profile_ids": [reading_speaker_profile_id],
                "emotion": reading_emotion,
            })
        if not transcribe:
            self._import_progress(activity, "Publishing imported footage", asset_id=asset_id,
                footage_id=asset_id, group_label=filename)
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

        self._import_progress(activity, "Running transcript recognition", asset_id=asset_id,
            footage_id=asset_id, group_label=filename)
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
        self._import_progress(activity, "Publishing imported footage", asset_id=asset_id,
            footage_id=asset_id, group_label=filename)
        return MediaImportResult(asset=asset, item=item, elapsed=studio_elapsed)

    async def process_local_path(
        self,
        project: ProjectRecord,
        source_value: str,
        *,
        cache_local: bool,
        stream_indexes: list[int] | None = None,
        transcribe_stream_indexes: list[int] | None = None,
    ) -> MediaImportResult:
        filename = Path(source_value).name
        activity = self._begin_import_task(project, filename)
        try:
            result = await self._process_local_path(project, source_value, cache_local=cache_local,
                stream_indexes=stream_indexes, transcribe_stream_indexes=transcribe_stream_indexes,
                activity=activity)
        except Exception as exc:
            self._end_import_task(activity, error=exc)
            raise
        self._end_import_task(activity)
        return result

    async def _process_local_path(
        self,
        project: ProjectRecord,
        source_value: str,
        *,
        cache_local: bool,
        stream_indexes: list[int] | None = None,
        transcribe_stream_indexes: list[int] | None = None,
        activity=None,
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
        self._import_progress(activity, "Preparing local media import", asset_id=asset_id,
            footage_id=asset_id, group_label=original_path.name)
        project_root = Path(project.project_path)
        asset_dir = create_media_asset_directory(project_root, asset_id, original_path.name)
        cache_path = media_asset_file(asset_dir, f"source{extension}")
        working_source = original_path
        cached_at: datetime | None = None
        if cache_local:
            self._import_progress(activity, "Copying source into project cache", asset_id=asset_id,
                footage_id=asset_id, group_label=original_path.name)
            await asyncio.to_thread(self._copy_file, original_path, cache_path,
                lambda copied, total: self._import_progress(activity,
                    f"Copied source {copied}/{total} bytes", fraction=copied / total,
                    asset_id=asset_id, footage_id=asset_id, group_label=original_path.name) if total else None)
            working_source = cache_path
            cached_at = datetime.now(timezone.utc)

        self._import_progress(activity, "Inspecting local media", asset_id=asset_id,
            footage_id=asset_id, group_label=original_path.name)
        probe = await asyncio.to_thread(self._probe, working_source)
        audio_stream = next(
            (stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"),
            None,
        )
        audio_streams = [stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"]
        available = {stream.get("index") for stream in audio_streams}
        selected = available if stream_indexes is None else set(stream_indexes)
        selected_stt = set(transcribe_stream_indexes or [])
        if ((audio_streams and not selected) or not selected.issubset(available)
                or len(selected) != len(stream_indexes or selected)):
            raise ValueError("Danh sách track audio cần import không hợp lệ")
        if not selected_stt.issubset(selected) or len(selected_stt) != len(transcribe_stream_indexes or []):
            raise ValueError("Track STT phải nằm trong các track được import và không được chọn trùng")
        video_stream = next(
            (stream for stream in probe.get("streams", []) if stream.get("codec_type") == "video"),
            None,
        )
        duration = self._duration(probe)
        media_kind = self._media_kind(extension, audio_stream, video_stream)
        portable_source_path = cache_path.relative_to(project_root).as_posix()

        if len(audio_streams) > 1:
            result = await self._import_multitrack(
                project, asset_id, asset_dir, working_source, portable_source_path,
                original_path.name, extension, audio_streams, video_stream, duration,
                origin="import", capture_tier="import", transcribe=False,
                queue_for_transcription=False, started=started,
                external_source=original_path,
                cached_at=cached_at,
                selected_stream_indexes=selected,
                selected_stt_stream_indexes=selected_stt,
                activity=activity,
            )
            return result

        analysis_path: Path | None = None
        if audio_stream:
            analysis_path = media_asset_file(asset_dir, "analysis.wav")
            self._import_progress(activity, "Extracting project analysis audio", asset_id=asset_id,
                footage_id=asset_id, group_label=original_path.name)
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
                available_audio_tracks=[MediaAudioTrackChoice(
                    stream_index=audio_stream["index"],
                    title=str((audio_stream.get("tags") or {}).get("title") or "Track 1")[:160],
                    codec=self._codec(audio_stream), channels=audio_stream.get("channels"), imported=True,
                )] if audio_stream else [],
                origin="import",
                status="ready" if audio_stream else "no-audio",
                transcription_status="skipped" if audio_stream else "not-applicable",
                transcription_selected=bool(audio_stream and audio_stream.get("index") in selected_stt),
            ),
            asset_id,
        )
        if self.local_sources:
            self.local_sources.set(project.id, asset_id, original_path)
        self._import_progress(activity, "Publishing imported local footage", asset_id=asset_id,
            footage_id=asset_id, group_label=original_path.name)
        return MediaImportResult(asset=asset, elapsed=round(time.perf_counter() - started, 2))

    async def set_local_file_cache(
        self,
        project: ProjectRecord,
        asset: ProjectMediaAsset,
        enabled: bool,
    ) -> ProjectMediaAsset:
        footage_id = asset.source_archive_asset_id or asset.id
        activity = self._begin_import_task(project, asset.name, asset_id=asset.id, footage_id=footage_id)
        try:
            result = await self._set_local_file_cache(project, asset, enabled, activity=activity)
        except Exception as exc:
            self._end_import_task(activity, error=exc)
            raise
        self._end_import_task(activity)
        return result

    async def _set_local_file_cache(
        self,
        project: ProjectRecord,
        asset: ProjectMediaAsset,
        enabled: bool,
        *, activity=None,
    ) -> ProjectMediaAsset:
        footage_id = asset.source_archive_asset_id or asset.id
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
            self._import_progress(activity, "Copying source into project cache", asset_id=asset.id,
                footage_id=footage_id, group_label=asset.name)
            await asyncio.to_thread(self._copy_file, original_path, cache_path,
                lambda copied, total: self._import_progress(activity,
                    f"Copied source {copied}/{total} bytes", fraction=copied / total,
                    asset_id=asset.id, footage_id=footage_id, group_label=asset.name) if total else None)
            working_source = cache_path
            cached_at = datetime.now(timezone.utc)

        tracks = [item for item in self.library.list(project.id)
                  if item.source_archive_asset_id == asset.id and item.source_archive_stream_index is not None]
        if asset.analysis_path and not tracks:
            self._import_progress(activity, "Rebuilding analysis audio", asset_id=asset.id,
                footage_id=footage_id, group_label=asset.name)
            analysis_path = project_root / asset.analysis_path
            await asyncio.to_thread(self._extract_audio, working_source, analysis_path)
        if tracks:
            self._import_progress(activity, "Rebuilding imported audio tracks", asset_id=asset.id,
                footage_id=footage_id, group_label=asset.name)
            await asyncio.to_thread(self._extract_audio_streams, working_source, [
                (project_root / track.analysis_path, track.source_archive_stream_index)
                for track in tracks if track.analysis_path
            ])
        self._import_progress(activity, "Publishing cache state", asset_id=asset.id,
            footage_id=footage_id, group_label=asset.name)
        return self.library.update_local_cache(project.id, asset.id, enabled, cached_at)

    async def _import_multitrack(
        self, project: ProjectRecord, asset_id: str, asset_dir: Path,
        source: Path, portable_source: str, filename: str, extension: str,
        audio_streams: list[dict[str, Any]], video_stream: dict[str, Any] | None,
        duration: float, *, origin: str, capture_tier: str,
        transcribe: bool, queue_for_transcription: bool, started: float,
        external_source: Path | None = None, cached_at: datetime | None = None,
        selected_stream_indexes: set[int] | None = None,
        selected_stt_stream_indexes: set[int] | None = None,
        activity=None,
    ) -> MediaImportResult:
        """Keep one original footage and one independently addressable analysis WAV per track."""
        root = Path(project.project_path)
        available = {stream.get("index") for stream in audio_streams}
        selected = available if selected_stream_indexes is None else selected_stream_indexes
        selected_stt = selected_stt_stream_indexes or set()
        if not selected or not selected.issubset(available) or not selected_stt.issubset(selected):
            raise ValueError("Danh sách track audio được chọn không hợp lệ")
        prepared = []
        for ordinal, stream in enumerate(audio_streams, 1):
            stream_index = stream.get("index")
            if not isinstance(stream_index, int) or stream_index < 0:
                raise ValueError("Audio track không có stream index hợp lệ.")
            if stream_index not in selected:
                continue
            child_id = f"asset-{uuid4().hex[:12]}"
            child_dir = create_media_asset_directory(root, child_id, f"{safe_media_stem(filename)[:40]} - Track {stream_index}.wav")
            analysis = media_asset_file(child_dir, "analysis.wav")
            title = str((stream.get("tags") or {}).get("title") or f"Track {ordinal}").strip()[:160]
            prepared.append((child_id, analysis, stream, title))
        self._import_progress(activity, "Extracting selected audio tracks", asset_id=asset_id,
            footage_id=asset_id, group_label=filename)
        await asyncio.to_thread(self._extract_audio_streams, source, [
            (analysis, stream["index"]) for _, analysis, stream, _ in prepared
        ])
        complete = []
        for ordinal, (child_id, analysis, stream, title) in enumerate(prepared, 1):
            item = None
            if transcribe:
                self._import_progress(activity, f"Recognizing imported track {ordinal}/{len(prepared)}",
                    asset_id=child_id, footage_id=asset_id, group_label=filename)
                item, _ = await self._run_studio_import(analysis, origin, "")
                item = self._attach_timing_quality(item, duration)
            complete.append((child_id, analysis, stream, title, item))

        first_analysis = complete[0][1].relative_to(root).as_posix()
        parent = self.library.create(project.id, MediaAssetCreate(
            name=filename, source_extension=extension,
            media_kind=self._media_kind(extension, audio_streams[0], video_stream),
            source_path=portable_source, analysis_path=first_analysis,
            url=f"/api/projects/{project.id}/media/{asset_id}/audio",
            duration=duration, sample_rate=24000,
            audio_codec=self._codec(next(stream for stream in audio_streams if stream["index"] in selected)),
            video_codec=self._codec(video_stream),
            available_audio_tracks=[MediaAudioTrackChoice(
                stream_index=stream["index"],
                title=str((stream.get("tags") or {}).get("title") or f"Track {ordinal}")[:160],
                codec=self._codec(stream), channels=stream.get("channels"),
                imported=stream["index"] in selected,
            ) for ordinal, stream in enumerate(audio_streams, 1)],
            origin=origin, capture_tier=capture_tier, status="ready",
            transcription_status="not-applicable",
            has_external_source=external_source is not None or cached_at is not None,
            local_cache_enabled=cached_at is not None,
            local_cache_updated_at=cached_at,
        ), asset_id)
        self._import_progress(activity, "Publishing imported footage and tracks", asset_id=asset_id,
            footage_id=asset_id, group_label=filename)
        if external_source and self.local_sources:
            self.local_sources.set(project.id, asset_id, external_source)
        track_manifest = []
        for child_id, analysis, stream, title, item in complete:
            relative_analysis = analysis.relative_to(root).as_posix()
            words = list(item.get("words", [])) if item else []
            self.library.create(project.id, MediaAssetCreate(
                name=f"{filename} · {title}"[:512], source_extension=".wav",
                media_kind="audio", source_path=relative_analysis,
                analysis_path=relative_analysis,
                source_archive_asset_id=asset_id,
                source_archive_stream_index=stream["index"],
                url=f"/api/projects/{project.id}/media/{child_id}/audio",
                duration=float(item.get("duration") or duration) if item else duration,
                sample_rate=24000, audio_codec="pcm_s16le",
                origin=origin, capture_tier=capture_tier,
                text=str(item.get("text", "")) if item else "",
                words=words,
                word_timing_quality=str(item.get("word_timing_quality", "unverified")) if item else "unverified",
                word_timing_note=item.get("word_timing_note") if item else None,
                transcription_status="complete" if item else "skipped",
                transcription_selected=(queue_for_transcription or stream["index"] in selected_stt) and not item,
            ), child_id)
            track_manifest.append({
                "assetId": child_id, "streamIndex": stream["index"], "title": title,
                "codec": self._codec(stream), "sampleRate": self._sample_rate(stream),
                "channels": stream.get("channels"), "language": (stream.get("tags") or {}).get("language"),
                "analysisPath": relative_analysis,
            })
        (asset_dir / "audio-tracks.json").write_text(
            json.dumps({"version": 2, "tracks": track_manifest, "availableTracks": [
                {"streamIndex": stream["index"],
                 "title": str((stream.get("tags") or {}).get("title") or f"Track {ordinal}")[:160],
                 "codec": self._codec(stream), "channels": stream.get("channels"),
                 "imported": stream["index"] in selected}
                for ordinal, stream in enumerate(audio_streams, 1)
            ]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return MediaImportResult(asset=parent, elapsed=round(time.perf_counter() - started, 2),
                                 track_asset_ids=[item[0] for item in complete])
    async def transcribe_existing(
        self,
        project: ProjectRecord,
        asset: ProjectMediaAsset,
        realtime_text: str = "",
        on_progress: TranscriptionProgressCallback | None = None,
        model: str = "large-v3",
        cancellation: ProcessingCancellation | None = None,
    ) -> tuple[ProjectMediaAsset, float]:
        if cancellation:
            cancellation.check()
        if not asset.analysis_path:
            raise ValueError("Footage không có analysis audio để chạy Speech to Text.")
        analysis_path = Path(project.project_path) / asset.analysis_path
        if not analysis_path.is_file():
            raise FileNotFoundError("Analysis audio không còn trong project.")
        processing_path, kept_ranges = await asyncio.to_thread(self._prepare_processing_audio, analysis_path, asset)
        if cancellation:
            cancellation.check()
        engine_name, _, variant = model.partition("@")
        engine = self.other_stt.get(engine_name)
        if engine is None and model not in STUDIO_STT_MODELS:
            raise ValueError(f"Không có adapter STT cho model '{model}'.")
        if engine is not None:
            if on_progress is not None:
                await on_progress(1)
            started = time.perf_counter()
            duration = await asyncio.to_thread(self._audio_duration, processing_path)
            registered = False
            if cancellation:
                cancellation.check()
                register_request = getattr(engine, "register_request", None)
                if callable(register_request):
                    register_request(cancellation.id)
                    registered = True
                cancel_request = getattr(engine, "cancel_request", None)
                if callable(cancel_request):
                    async def cancel_engine_request() -> None:
                        await asyncio.to_thread(cancel_request, cancellation.id)
                    await cancellation.install_cancel_handler(cancel_engine_request)
            try:
                if variant:
                    kwargs = {"variant": variant, "project_id": project.id}
                    if cancellation:
                        kwargs["cancellation_id"] = cancellation.id
                    item = await asyncio.to_thread(engine, processing_path, duration, **kwargs)
                else:
                    kwargs = {"cancellation_id": cancellation.id} if cancellation else {}
                    item = await asyncio.to_thread(engine, processing_path, duration, **kwargs)
            finally:
                if registered:
                    abandon_request = getattr(engine, "abandon_request", None)
                    if callable(abandon_request):
                        abandon_request(cancellation.id)
            if cancellation:
                cancellation.check()
            elapsed = round(time.perf_counter() - started, 2)
            if on_progress is not None:
                await on_progress(99)
        else:
            item, elapsed = await self._run_studio_import(
                processing_path,
                asset.origin,
                realtime_text or asset.text,
                on_progress=on_progress,
                model=model,
                cancellation=cancellation,
            )
        if cancellation:
            cancellation.check()
        if kept_ranges:
            item = await asyncio.to_thread(self._restore_original_timeline, item, kept_ranges, asset.duration)
        if cancellation:
            cancellation.check()
        item = await asyncio.to_thread(self._attach_timing_quality, item, asset.duration)
        if cancellation:
            cancellation.check()
        item = await asyncio.to_thread(self._write_and_read_stt_artifacts, analysis_path.parent, item)
        if cancellation:
            cancellation.check()
        updated = await asyncio.to_thread(self.library.apply_transcription, project.id, asset.id, item, asset.duration)
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
            space_recognized_words(list(item.get("words", []))),
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
        removed = excluded_intervals(asset)
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
        destination = analysis_path.with_name(f"{analysis_path.stem}-timeline-edited.wav")
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

        def original_time(value: Any, *, is_start: bool = False) -> float:
            try:
                compact_time = max(0.0, float(value))
            except (TypeError, ValueError):
                compact_time = 0.0
            consumed = 0.0
            for start, end in kept_ranges:
                span = max(0.0, end - start)
                if compact_time < consumed + span or (not is_start and compact_time == consumed + span):
                    return min(end, max(start, start + compact_time - consumed))
                consumed += span
            return kept_ranges[-1][1]

        restored_words: list[dict[str, Any]] = []
        for raw_word in item.get("words", []):
            if not isinstance(raw_word, dict):
                continue
            word = dict(raw_word)
            start = original_time(word.get("start", 0.0), is_start=True)
            end = original_time(word.get("end", word.get("start", 0.0)))
            word["start"] = start
            word["end"] = max(start, end)
            restored_words.append(word)
        restored["words"] = restored_words
        # The app always plays the original project analysis WAV, so its duration stays authoritative.
        restored["duration"] = max(0.0, original_duration)
        return restored

    async def _save_upload(self, upload: UploadFile, destination: Path, *, on_progress=None) -> None:
        size = 0
        total = upload.size if isinstance(upload.size, int) and upload.size > 0 else None
        with destination.open("wb") as output:
            while chunk := await upload.read(8 * 1024 * 1024):
                size += len(chunk)
                if size > 1_500_000_000:
                    raise ValueError("File media lớn hơn giới hạn 1,5 GB.")
                output.write(chunk)
                if on_progress is not None:
                    on_progress(size, total)

    @staticmethod
    def _sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

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
        self._extract_audio_stream(source, destination, 0, audio_ordinal=True)

    def _extract_audio_stream(self, source: Path, destination: Path,
                              stream_index: int, *, audio_ordinal: bool = False) -> None:
        self._extract_audio_streams(source, [(destination, stream_index)], audio_ordinal=audio_ordinal)

    def _extract_audio_streams(self, source: Path, destinations: list[tuple[Path, int]],
                               *, audio_ordinal: bool = False) -> None:
        if not destinations:
            return
        outputs = [part for destination, index in destinations for part in (
            "-map", "0:a:0" if audio_ordinal else f"0:{index}",
            "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-f", "wav", str(destination),
        )]
        result = subprocess.run(
            [
                self.ffmpeg_path, "-y", "-hide_banner", "-loglevel", "error", "-i", str(source),
                *outputs,
            ],
            capture_output=True,
            check=False,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0 or any(not destination.is_file() for destination, _ in destinations):
            raise ValueError(f"Không trích xuất được audio: {result.stderr.strip() or 'FFmpeg error'}")

    async def _run_studio_import(
        self,
        analysis_path: Path,
        origin: str,
        realtime_text: str,
        *,
        on_progress: TranscriptionProgressCallback | None = None,
        model: str = "large-v3",
        cancellation: ProcessingCancellation | None = None,
    ) -> tuple[dict[str, Any], float]:
        if cancellation:
            cancellation.check()
        duration = await asyncio.to_thread(self._audio_duration, analysis_path)
        if cancellation:
            cancellation.check()
        chunks = self._stt_chunks(duration)
        if len(chunks) == 1:
            return await self._upload_studio_audio(
                analysis_path, origin, realtime_text, on_progress=on_progress, model=model,
                cancellation=cancellation,
            )

        cache_dir = analysis_path.parent / "cache" / "stt-chunks"
        cache_dir.mkdir(parents=True, exist_ok=True)
        job_id = uuid4().hex[:8]
        results: list[tuple[TranscriptionChunk, dict[str, Any]]] = []
        elapsed = 0.0
        try:
            for index, chunk in enumerate(chunks, start=1):
                if cancellation:
                    cancellation.check()
                chunk_path = cache_dir / f"{analysis_path.stem}-stt-{job_id}-{index:03d}.wav"

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
                        cancellation=cancellation,
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
        previous_words: list[dict[str, Any]] = []
        pending_tail: list[dict[str, Any]] = []
        for chunk, item in results:
            item_words = item.get("words", [])
            # Untimed segment text cannot be assigned safely to an overlap's
            # owning interval. Do not turn a partially timed recognizer result
            # into a successful transcript that silently omits that text.
            if str(item.get("text") or "").strip() and (
                item.get("word_timing_quality") == "needs-alignment"
                or not isinstance(item_words, list) or not item_words
            ):
                raise RuntimeError(
                    "STT block có lời nhận dạng thiếu word timestamp; "
                    "chưa thể ghép transcript an toàn. Cần chạy lại hoặc căn chỉnh timing."
                )
            has_words = False
            chunk_words: list[dict[str, Any]] = []
            leading: list[dict[str, Any]] = []
            trailing: list[dict[str, Any]] = []
            for raw_word in item_words if isinstance(item_words, list) else []:
                if not isinstance(raw_word, dict):
                    continue
                word = dict(raw_word)
                try:
                    start = chunk.source_start + float(word.get("start", 0.0))
                    end = max(start, chunk.source_start + float(word.get("end", word.get("start", 0.0))))
                except (TypeError, ValueError):
                    continue
                if not math.isfinite(start) or not math.isfinite(end) or end <= start:
                    continue
                word["start"] = round(min(duration, start), 6)
                word["end"] = round(min(duration, end), 6)
                if start < chunk.source_start or start >= chunk.source_end:
                    continue
                if start < chunk.timeline_start:
                    leading.append(word)
                    continue
                if start >= chunk.timeline_end:
                    trailing.append(word)
                    continue
                chunk_words.append(word)
                has_words = True
            # Owned words win conflicts. Padding may recover a word that its
            # owner request omitted, but cannot duplicate or replace an existing
            # interval. Only adjacent request windows can share this context.
            for word in leading + pending_tail:
                if not any(word["start"] < other["end"] and word["end"] > other["start"]
                           for other in previous_words + chunk_words):
                    chunk_words.append(word)
                    has_words = True
            chunk_words.sort(key=lambda word: word["start"])
            words.extend(chunk_words)
            previous_words = chunk_words
            pending_tail = trailing
            if not has_words and item.get("text"):
                fallback_text.append(str(item["text"]).strip())
        # A recovered leading word can precede a later word already emitted
        # by its owner. Keep the final Script/SRT order chronological.
        words.sort(key=lambda word: word["start"])
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
        cancellation: ProcessingCancellation | None = None,
    ) -> tuple[dict[str, Any], float]:
        # A queued local STT job may legitimately run for hours; keep the import request alive.
        timeout = httpx.Timeout(timeout=None, connect=5.0)
        progress_id = cancellation.id if cancellation else (uuid4().hex if on_progress else "")
        latest_progress = -1.0
        progress_endpoint_available = bool(progress_id)

        async def publish(value: object) -> None:
            nonlocal latest_progress
            try:
                progress = round(max(0.0, min(100.0, float(value))), 1)
            except (TypeError, ValueError):
                return
            if cancellation:
                cancellation.check()
            if on_progress is None or progress <= latest_progress:
                return
            latest_progress = progress
            await on_progress(progress)

        data = {"origin": origin, "realtime_text": realtime_text, "model": model}
        if progress_id:
            data["progress_id"] = progress_id

        async def send(client: httpx.AsyncClient, *, by_path: bool) -> httpx.Response:
            """Run one import request while relaying the sidecar's progress."""
            if cancellation:
                cancellation.check()
                await cancellation.install_cancel_handler(
                    lambda: self._cancel_studio_job(progress_id, "import")
                )
            if by_path:
                task = asyncio.create_task(
                    client.post(
                        f"{self.studio_url}/api/audio/import",
                        data={**data, "source_path": str(analysis_path.resolve())},
                    )
                )
                return await self._await_import(client, task, progress_id, publish, cancellation)
            with analysis_path.open("rb") as audio:
                task = asyncio.create_task(
                    client.post(
                        f"{self.studio_url}/api/audio/import",
                        files={"file": (analysis_path.name, audio, "audio/wav")},
                        data=data,
                    )
                )
                return await self._await_import(client, task, progress_id, publish, cancellation)

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
        if cancellation:
            cancellation.check()
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
        cancellation: ProcessingCancellation | None = None,
    ) -> httpx.Response:
        progress_endpoint_available = bool(progress_id)
        while not task.done():
            if cancellation:
                try:
                    cancellation.check()
                except Exception:
                    task.cancel()
                    raise
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

    async def _cancel_studio_job(self, progress_id: str, kind: str) -> None:
        """Request termination of the sidecar child assigned to one job id."""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(3.0, connect=1.0)) as client:
                response = await client.post(f"{self.studio_url}/api/audio/{kind}/{progress_id}/cancel")
                if response.status_code == 404:
                    raise ProcessingStopError(
                        "Studio does not support per-job cancellation. Restart the Studio runtime before retrying."
                    )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ProcessingStopError(
                "Studio rejected the cancellation request. Restart the Studio runtime before retrying."
            ) from exc
        except httpx.RequestError as exc:
            raise ProcessingStopError(
                "Cannot reach Studio to confirm the inference stopped. Restart the Studio runtime before retrying."
            ) from exc

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
