"""Checkpointed detailed STT over durable OBS LiveLink PCM chunks.

The plan freezes each channel's initial end at the button press. Subsequent
blocks read ten seconds of preceding PCM and replace words at a five-second
seam. No source chunk or finalized archive is modified.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import subprocess
import tempfile
import threading
import wave
from pathlib import Path
from typing import Awaitable, Callable
from uuid import UUID

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.obs_livelink_deletions import deleted_recording_ids
from app.adapters.growing_mkv_transcription import GrowingMkvTranscription, RATE, _atomic_json
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.media_presentation import render_srt
from app.adapters.word_timing_quality import reconcile_word_timing_quality
from app.domain.models import ProjectRecord


Recognizer = Callable[[Path, str], Awaitable[dict]]


def _folder(project: ProjectRecord, recording_id: str) -> Path:
    UUID(recording_id)
    return Path(project.project_path) / "assets" / "obs-livelink" / recording_id


def _journal(folder: Path, project: ProjectRecord, recording_id: str) -> dict:
    journal = json.loads((folder / "recording.json").read_text(encoding="utf-8"))
    recording = journal["recording"]
    if recording["recordingId"] != recording_id or recording["projectId"] != project.id:
        raise ValueError("OBS recording không thuộc project này")
    return journal


def _chunks(folder: Path, channel_id: str) -> list[dict]:
    UUID(channel_id)
    directory = folder / "channels" / channel_id / "chunks"
    result = []
    for path in sorted(directory.glob("*.json")):
        item = json.loads(path.read_text(encoding="utf-8"))
        pcm = path.with_suffix(".pcm")
        if (item["sequence"] != len(result) or not pcm.is_file() or
                pcm.stat().st_size != item["frameCount"] * item["channels"] * 2):
            break  # Only the continuous, fully ACKed prefix is readable.
        result.append(item)
    if result and any((item["sampleRate"], item["channels"]) !=
                      (result[0]["sampleRate"], result[0]["channels"]) for item in result):
        raise ValueError("OBS channel đổi định dạng PCM giữa bản ghi")
    return result


def _available_frames(recording: dict, chunks: list[dict]) -> int:
    if not chunks:
        return 0
    rate = chunks[0]["sampleRate"]
    initial = max(0, round((chunks[0]["pluginMonotonicNs"] -
                            recording["startedMonotonicNs"]) * rate / 1e9))
    end_native = initial + chunks[-1]["firstSampleIndex"] - chunks[0]["firstSampleIndex"] + chunks[-1]["frameCount"]
    if recording.get("endedMonotonicNs") is not None:
        end_native = min(end_native, max(0, round((recording["endedMonotonicNs"] -
                                                   recording["startedMonotonicNs"]) * rate / 1e9)))
    return max(0, round(end_native * RATE / rate))


def _silence(output: wave.Wave_write, frames: int, channels: int) -> None:
    block = b"\0" * (65536 * channels * 2)
    while frames:
        count = min(frames, 65536)
        output.writeframesraw(block[:count * channels * 2])
        frames -= count


def _render_segment(folder: Path, recording: dict, channel_id: str,
                    chunks: list[dict], start: int, end: int,
                    destination: Path, ffmpeg: str) -> None:
    """Render an immutable timeline slice from verified project-owned PCM."""
    if not chunks or end <= start:
        raise ValueError("OBS PCM chưa đủ cho đoạn STT")
    rate, channels = chunks[0]["sampleRate"], chunks[0]["channels"]
    start_native = round(start * rate / RATE)
    end_native = round(end * rate / RATE)
    first = chunks[0]
    initial = max(0, round((first["pluginMonotonicNs"] -
                            recording["startedMonotonicNs"]) * rate / 1e9))
    intervals = [*recording.get("capturePauseIntervals", []),
                 *(part for part in recording.get("channelIntervals", [])
                   if part["channelId"] == channel_id)]
    native = destination.with_suffix(".native.wav")
    native.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(native), "wb") as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(rate)
        cursor = start_native
        for item in chunks:
            position = initial + item["firstSampleIndex"] - first["firstSampleIndex"]
            item_end = position + item["frameCount"]
            if item_end <= cursor or position >= end_native:
                continue
            if position > cursor:
                _silence(output, min(position, end_native) - cursor, channels)
                cursor = position
            take_start = max(cursor, position)
            take_end = min(end_native, item_end)
            path = folder / "channels" / channel_id / "chunks" / f"{item['sequence']:012d}.pcm"
            pcm = path.read_bytes()
            if hashlib.sha256(pcm).hexdigest() != item["sha256"]:
                raise ValueError("OBS PCM checksum đã thay đổi")
            left = (take_start - position) * channels * 2
            right = (take_end - position) * channels * 2
            audible = bytearray(pcm[left:right])
            for interval in intervals:
                end_ns = (interval.get("endMonotonicNs") or recording.get("endedMonotonicNs")
                          or item["pluginMonotonicNs"] + round(item["frameCount"] * 1e9 / rate))
                left_frame = max(take_start, position +
                                 (interval["startMonotonicNs"] - item["pluginMonotonicNs"]) * rate // 1_000_000_000)
                right_frame = min(take_end, position +
                                  (end_ns - item["pluginMonotonicNs"]) * rate // 1_000_000_000)
                if right_frame > left_frame:
                    a = (left_frame - take_start) * channels * 2
                    b = (right_frame - take_start) * channels * 2
                    audible[a:b] = b"\0" * (b - a)
            output.writeframesraw(audible)
            cursor = take_end
            if cursor >= end_native:
                break
        if cursor < end_native:
            _silence(output, end_native - cursor, channels)
    try:
        result = subprocess.run([ffmpeg, "-y", "-nostdin", "-v", "error", "-i", str(native),
                                 "-ac", "1", "-ar", str(RATE), "-c:a", "pcm_s16le",
                                 str(destination)], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or "Không chuyển được OBS PCM cho STT")
        with wave.open(str(destination), "rb") as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, RATE):
                raise ValueError("OBS STT WAV không phải PCM16 mono 24 kHz")
    finally:
        native.unlink(missing_ok=True)


class ObsLiveLinkDetailedStt:
    def __init__(self, library: FileMediaLibrary, importer: MediaImportProcessor,
                 recognizer: Recognizer | None = None) -> None:
        self.library = library
        self.importer = importer
        self.recognizer = recognizer or self._recognize
        self._locks: dict[str, asyncio.Lock] = {}
        self._configuration_lock = threading.Lock()
        self._chunk_lock = threading.Lock()
        self._chunk_cache: dict[tuple[Path, str], list[dict]] = {}

    def preview_audio(self, project: ProjectRecord, recording_id: str, channel_id: str,
                      start_seconds: float | None = None, duration_seconds: float = 30) -> tuple[bytes, float, float]:
        """Render at most 30 seconds of acknowledged PCM for an in-progress take."""
        if not math.isfinite(duration_seconds) or not 1 <= duration_seconds <= 30:
            raise ValueError("Đoạn nghe thử phải dài từ 1 đến 30 giây")
        if start_seconds is not None and (not math.isfinite(start_seconds) or start_seconds < 0):
            raise ValueError("Mốc nghe thử OBS không hợp lệ")
        if not self.importer.ffmpeg_path:
            raise RuntimeError("Cần FFmpeg để nghe thử PCM OBS")
        folder = _folder(project, recording_id)
        if recording_id in deleted_recording_ids(Path(project.project_path)):
            raise FileNotFoundError("Bản ghi OBS đã được xóa")
        journal = _journal(folder, project, recording_id)
        if channel_id not in {item["channelId"] for item in journal.get("channels", [])}:
            raise FileNotFoundError("Track OBS không thuộc bản ghi này")
        chunks = _chunks(folder, channel_id)
        total = _available_frames(journal["recording"], chunks)
        if not total:
            raise FileNotFoundError("Track OBS chưa có PCM đã lưu")
        length = round(duration_seconds * RATE)
        start = max(0, total - length) if start_seconds is None else round(start_seconds * RATE)
        end = min(total, start + length)
        if end <= start:
            raise ValueError("PCM đã lưu chưa tới mốc nghe thử")
        with tempfile.TemporaryDirectory(prefix="pro4bro-obs-preview-") as temporary:
            output = Path(temporary) / "preview.wav"
            _render_segment(folder, journal["recording"], channel_id, chunks,
                            start, end, output, self.importer.ffmpeg_path)
            return output.read_bytes(), start / RATE, end / RATE

    def _read_chunks(self, folder: Path, channel_id: str) -> list[dict]:
        """Read the immutable ACK prefix once, then inspect only new sequences."""
        with self._chunk_lock:
            key = folder, channel_id
            if key not in self._chunk_cache:
                self._chunk_cache[key] = _chunks(folder, channel_id)
            result = self._chunk_cache[key]
            directory = folder / "channels" / channel_id / "chunks"
            while True:
                sequence = len(result)
                path = directory / f"{sequence:012d}.json"
                if not path.is_file():
                    break
                item = json.loads(path.read_text(encoding="utf-8"))
                pcm = path.with_suffix(".pcm")
                if (item["sequence"] != sequence or not pcm.is_file() or
                        pcm.stat().st_size != item["frameCount"] * item["channels"] * 2):
                    break
                if result and (item["sampleRate"], item["channels"]) != (
                        result[0]["sampleRate"], result[0]["channels"]):
                    raise ValueError("OBS channel đổi định dạng PCM giữa bản ghi")
                result.append(item)
            return list(result)

    async def _recognize(self, path: Path, model: str) -> dict:
        item, _ = await self.importer._run_studio_import(path, "import", "", model=model)
        return item

    def configure(self, project: ProjectRecord, recording_id: str, segment_seconds: int,
                  channel_ids: list[str] | None = None, model: str = "large-v3") -> dict:
        with self._configuration_lock:
            return self._configure(project, recording_id, segment_seconds, channel_ids, model)

    def _configure(self, project: ProjectRecord, recording_id: str, segment_seconds: int,
                   channel_ids: list[str] | None, model: str) -> dict:
        if not self.importer.ffmpeg_path:
            raise ValueError("Cần FFmpeg để tạo PCM phân tích cho OBS STT kỹ")
        if not 10 <= segment_seconds <= 600:
            raise ValueError("Độ dài block STT phải từ 10 đến 600 giây")
        if not model or len(model) > 100:
            raise ValueError("Model STT không hợp lệ")
        folder = _folder(project, recording_id)
        journal = _journal(folder, project, recording_id)
        path = folder / "detailed-stt-state.json"
        if path.is_file():
            state = json.loads(path.read_text(encoding="utf-8"))
            if (state["segmentSeconds"] != segment_seconds or state["model"] != model or
                    (channel_ids is not None and set(channel_ids) != set(state["tracks"]))):
                raise ValueError("STT kỹ đã bắt đầu; không thể đổi cấu hình của bản ghi này")
            return self.status(project, recording_id)
        available = {item["channelId"] for item in journal.get("channels", [])
                     if self._read_chunks(folder, item["channelId"])}
        selected = set(channel_ids) if channel_ids is not None else available
        if not selected or not selected.issubset(available) or len(selected) != len(channel_ids or selected):
            raise ValueError("Hãy chọn các track OBS đã nhận PCM")
        tracks = {}
        for channel_id in sorted(selected):
            chunks = self._read_chunks(folder, channel_id)
            tracks[channel_id] = {"initialFrames": _available_frames(journal["recording"], chunks),
                                  "cursor": 0, "publishedCursor": -1}
        state = {"version": 1, "recordingId": recording_id, "segmentSeconds": segment_seconds,
                 "model": model, "tracks": tracks}
        _atomic_json(path, state)
        return self.status(project, recording_id)

    def status(self, project: ProjectRecord, recording_id: str) -> dict:
        folder = _folder(project, recording_id)
        state = json.loads((folder / "detailed-stt-state.json").read_text(encoding="utf-8"))
        _journal(folder, project, recording_id)
        if state.get("version") != 1 or state.get("recordingId") != recording_id:
            raise ValueError("OBS STT checkpoint không hợp lệ")
        return state

    async def process_once(self, project: ProjectRecord, recording_id: str) -> dict:
        async with self._locks.setdefault(recording_id, asyncio.Lock()):
            folder = _folder(project, recording_id)
            journal = _journal(folder, project, recording_id)
            recording = journal["recording"]
            state_path = folder / "detailed-stt-state.json"
            state = self.status(project, recording_id)
            stopped = recording["status"] == "stopped"
            complete = stopped and recording.get("archiveStatus") == "ready"
            for channel_id, progress in state["tracks"].items():
                # Recovery can scan thousands of cold checkpoint files before
                # its first STT request. Keep startup/health on the event loop.
                chunks = await asyncio.to_thread(self._read_chunks, folder, channel_id)
                total = _available_frames(recording, chunks)
                start = progress["cursor"]
                if start > total:
                    raise ValueError("OBS STT cursor vượt quá PCM bền vững")
                initial = progress["initialFrames"]
                if start == 0 and initial > 0 and total >= initial:
                    end = initial
                elif total - start >= state["segmentSeconds"] * RATE:
                    end = start + state["segmentSeconds"] * RATE
                elif stopped and total > start:
                    end = total
                else:
                    end = start
                result_dir = folder / "detailed-stt" / channel_id
                if end > start:
                    result_path = result_dir / f"{start:012d}.json"
                    if result_path.is_file():
                        saved = json.loads(result_path.read_text(encoding="utf-8"))
                        if saved["endFrame"] != end:
                            raise ValueError("OBS STT result khác ranh giới checkpoint")
                    else:
                        audio_start = max(0, start - 10 * RATE) if start else 0
                        merge_start = max(0, start - 5 * RATE) if start else 0
                        segment = result_path.with_suffix(".wav")
                        await asyncio.to_thread(_render_segment, folder, recording, channel_id,
                                                chunks, audio_start, end, segment,
                                                self.importer.ffmpeg_path)
                        try:
                            item = await self.recognizer(segment, state["model"])
                            if str(item.get("text") or "").strip():
                                words = item.get("words")
                                duration = (end - audio_start) / RATE
                                try:
                                    valid = isinstance(words, list) and bool(words) and all(
                                        isinstance(word, dict) and
                                        bool(str(word.get("text") or "").strip()) and
                                        math.isfinite(float(word["start"])) and
                                        math.isfinite(float(word["end"])) and
                                        0 <= float(word["start"]) < float(word["end"]) <= duration + 0.02
                                        for word in words
                                    )
                                except (KeyError, TypeError, ValueError, OverflowError):
                                    valid = False
                                if not valid:
                                    raise ValueError("STT kỹ thiếu word timestamp; chưa thể ghép transcript an toàn")
                            metadata = {"audioStartFrame": audio_start,
                                        "mergeStartFrame": merge_start} if start else {}
                            _atomic_json(result_path, {"startFrame": start, "endFrame": end,
                                                       **metadata, "item": item})
                        finally:
                            segment.unlink(missing_ok=True)
                    progress["cursor"] = end
                    _atomic_json(state_path, state)
                stem = next((item for item in journal.get("sourceStems", [])
                             if item["channelId"] == channel_id), None)
                archive_ready = recording.get("archiveStatus") == "ready"
                if (progress["cursor"] != progress["publishedCursor"] or
                        (archive_ready and stem and stem.get("assetId") and
                         not progress.get("publishedAsset"))):
                    results = [json.loads(path.read_text(encoding="utf-8"))
                               for path in sorted(result_dir.glob("*.json"))]
                    combined = GrowingMkvTranscription._combine(results, total / RATE)
                    timing = reconcile_word_timing_quality("partial", None,
                                                           combined["words"], total / RATE)
                    destination = result_dir / "transcript.stt.srt"
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    temporary = destination.with_suffix(".srt.tmp")
                    temporary.write_text(render_srt(word for word in timing.words
                                                    if word.get("timingTrusted") is True), encoding="utf-8")
                    os.replace(temporary, destination)
                    if archive_ready and stem and stem.get("assetId"):
                        try:
                            asset = self.library.get(project.id, stem["assetId"])
                        except KeyError:
                            asset = None
                        if asset and not asset.deleted_at and not asset.disabled:
                            if stopped and progress["cursor"] == total:
                                user_edited = any(revision.source == "user" and revision.text == asset.text
                                                  for revision in asset.revisions)
                                self.library.apply_transcription(project.id, asset.id, combined,
                                                                 total / RATE, preserve_user_text=True)
                                if not user_edited:
                                    self.library.set_transcription_state(project.id, asset.id,
                                                                         "complete", progress=100)
                            else:
                                self.library.update_live_transcript(project.id, asset.id,
                                                                    combined["text"], combined["words"],
                                                                    total / RATE)
                            progress["publishedAsset"] = True
                    progress["publishedCursor"] = progress["cursor"]
                    _atomic_json(state_path, state)
                if progress["cursor"] != total or not progress.get("publishedAsset"):
                    complete = False
            return {**state, "done": complete}
