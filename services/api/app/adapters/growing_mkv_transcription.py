"""Restartable live preview and final segmented STT for a followed MKV.

The follower owns audio durability. This worker reads only checkpointed frames;
its result file is committed before its cursor, so a restart never resends a
segment whose recognition result is already on disk.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import wave
from pathlib import Path
from typing import Awaitable, Callable

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.media_presentation import render_srt
from app.adapters.word_timing_quality import reconcile_word_timing_quality
from app.domain.models import ProjectRecord


RATE = 24000
LIVE_SECONDS = 3
Recognizer = Callable[[Path, str], Awaitable[dict]]


def _atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, separators=(",", ":"))
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def _copy_frames(source: Path, destination: Path, start: int, end: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    with wave.open(str(source), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, RATE):
            raise ValueError("Analysis WAV cho MKV không phải PCM16 mono 24 kHz")
        if audio.getnframes() < end:
            raise ValueError("Audio STT chưa đủ frame đã được checkpoint")
        audio.setpos(start)
        with wave.open(str(temporary), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            remaining = end - start
            while remaining:
                count = min(remaining, RATE * 10)
                pcm = audio.readframes(count)
                if len(pcm) != count * 2:
                    raise ValueError("Đoạn STT bị thiếu PCM")
                output.writeframesraw(pcm)
                remaining -= count
    os.replace(temporary, destination)


class GrowingMkvTranscription:
    def __init__(self, library: FileMediaLibrary, importer: MediaImportProcessor,
                 recognizer: Recognizer | None = None) -> None:
        self.library = library
        self.importer = importer
        self.recognizer = recognizer or self._recognize
        self._locks: dict[str, asyncio.Lock] = {}
        self._detailed_tasks: dict[str, tuple[tuple[str, str, int, int], asyncio.Task]] = {}

    async def close(self) -> None:
        tasks = [task for _, task in self._detailed_tasks.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._detailed_tasks.clear()

    async def _recognize(self, segment: Path, model: str) -> dict:
        item, _ = await self.importer._upload_studio_audio(segment, "import", "", model=model)
        return item

    @staticmethod
    def _paths(project: ProjectRecord, parent_id: str) -> tuple[Path, Path, Path]:
        if not parent_id.startswith("asset-") or not parent_id[6:].isalnum():
            raise ValueError("Footage id không hợp lệ")
        directory = Path(project.project_path) / "assets" / "media" / parent_id
        return directory, directory / "follow-state.json", directory / "stt-state.json"

    def _load(self, project: ProjectRecord, parent_id: str) -> tuple[Path, dict, Path, dict]:
        directory, follow_path, stt_path = self._paths(project, parent_id)
        follow = json.loads(follow_path.read_text(encoding="utf-8"))
        if follow.get("parentId") != parent_id:
            raise ValueError("MKV follow checkpoint không hợp lệ")
        if stt_path.is_file():
            state = json.loads(stt_path.read_text(encoding="utf-8"))
            if state.get("parentId") != parent_id or state.get("version") != 1:
                raise ValueError("MKV STT checkpoint không hợp lệ")
        else:
            state = {"version": 1, "parentId": parent_id,
                     "segmentSeconds": follow.get("sttSegmentSeconds", 60), "tracks": {}}
        return directory, follow, stt_path, state

    @staticmethod
    def _result_path(directory: Path, asset_id: str, phase: str, start: int) -> Path:
        return directory / "stt-segments" / asset_id / phase / f"{start:012d}.json"

    @staticmethod
    def _results(directory: Path, asset_id: str, phase: str) -> list[dict]:
        result_dir = directory / "stt-segments" / asset_id / phase
        if not result_dir.is_dir():
            return []
        return [json.loads(path.read_text(encoding="utf-8"))
                for path in sorted(result_dir.glob("*.json"))]

    @staticmethod
    def _combine(results: list[dict], duration: float) -> dict:
        words: list[dict] = []
        texts: list[str] = []
        for result in results:
            item = result["item"]
            segment_start = result.get("audioStartFrame", result["startFrame"]) / RATE
            segment_end = result["endFrame"] / RATE
            merge_start = result.get("mergeStartFrame", result["startFrame"]) / RATE
            replacing = "mergeStartFrame" in result
            if replacing:
                # Assign a word crossing the seam by its midpoint. Never publish it twice.
                words = [word for word in words if (word["start"] + word["end"]) / 2 < merge_start]
            text = str(item.get("text") or "").strip()
            if text:
                texts.append(text)
            for raw in item.get("words", []) if isinstance(item.get("words"), list) else []:
                if not isinstance(raw, dict):
                    continue
                word = dict(raw)
                try:
                    start = segment_start + float(word["start"])
                    end = segment_start + float(word["end"])
                except (KeyError, TypeError, ValueError):
                    continue
                if not math.isfinite(start) or not math.isfinite(end) or end <= start:
                    continue
                if start >= segment_end or end <= segment_start or (start + end) / 2 < merge_start:
                    continue
                word["start"] = round(max(segment_start, start), 6)
                word["end"] = round(min(segment_end, max(start, end)), 6)
                words.append(word)
        merged_text = " ".join(str(word.get("text", "")).strip() for word in words if str(word.get("text", "")).strip())
        return {"text": merged_text if any("mergeStartFrame" in result for result in results) else " ".join(texts) or merged_text,
                "words": words,
                "duration": duration, "sample_rate": RATE,
                "word_timing_quality": "partial" if words else "unverified"}

    async def _one_segment(self, project: ProjectRecord, directory: Path, asset_id: str,
                           source: Path, phase: str, start: int, end: int,
                           *, overlap: bool = False) -> None:
        result_path = self._result_path(directory, asset_id, phase, start)
        if result_path.is_file():
            result = json.loads(result_path.read_text(encoding="utf-8"))
            if result.get("endFrame") != end:
                raise ValueError("Ranh giới đoạn STT khác checkpoint đã lưu")
            return
        segment = result_path.with_suffix(".wav")
        audio_start = max(0, start - 10 * RATE) if overlap else start
        merge_start = max(0, start - 5 * RATE) if overlap else start
        await asyncio.to_thread(_copy_frames, source, segment, audio_start, end)
        item = await self.recognizer(segment, "tiny" if phase == "live" else "large-v3")
        if overlap and str(item.get("text") or "").strip() and not item.get("words"):
            raise ValueError("STT kỹ thiếu word timestamp; chưa thể ghép đoạn chồng an toàn")
        metadata = {"audioStartFrame": audio_start, "mergeStartFrame": merge_start} if overlap else {}
        _atomic_json(result_path, {"startFrame": start, "endFrame": end, **metadata,
                                   "startSeconds": round(start / RATE, 6),
                                   "endSeconds": round(end / RATE, 6), "item": item})
        segment.unlink(missing_ok=True)

    async def process_once(self, project: ProjectRecord, parent_id: str, *, wait_for_detail: bool = True) -> dict:
        async with self._locks.setdefault(parent_id, asyncio.Lock()):
            directory, follow, stt_path, state = self._load(project, parent_id)
            root = Path(project.project_path)
            finished = bool(follow["finished"])
            detailed_enabled = bool(follow.get("sttDetailedEnabled", True))
            plan = follow.get("sttPlan")
            if plan and state.get("planId") != plan["id"]:
                state["planId"] = plan["id"]
                for progress in state["tracks"].values():
                    progress["finalFrame"] = 0
                state["segmentSeconds"] = follow["sttSegmentSeconds"]
                _atomic_json(stt_path, state)
            final_phase = f"final-{plan['id']}" if plan else "final"
            active = self._detailed_tasks.get(parent_id)
            if active:
                active_asset = self.library.get(project.id, active[0][0])
                if (active[0][1] != final_phase or not active_asset.import_selected
                        or not active_asset.transcription_selected or active_asset.deleted_at or active_asset.disabled):
                    active[1].cancel()
                    await asyncio.gather(active[1], return_exceptions=True)
                    self._detailed_tasks.pop(parent_id, None)
            if state["segmentSeconds"] != follow.get("sttSegmentSeconds", 60):
                if any(progress.get("finalFrame", 0) for progress in state["tracks"].values()):
                    raise ValueError("Độ dài đoạn STT kỹ khác checkpoint đã xử lý")
                state["segmentSeconds"] = follow["sttSegmentSeconds"]
            selected = []
            all_done = finished
            for track in follow["tracks"]:
                asset_id = track["assetId"]
                asset = self.library.get(project.id, asset_id)
                if (not asset.import_selected or not asset.transcription_selected
                        or asset.deleted_at or asset.disabled):
                    continue
                selected.append(asset_id)
                progress = state["tracks"].setdefault(asset_id, {"liveFrame": 0, "finalFrame": 0})
                total = int(track.get("finalFrames", track["frames"]) if finished else track["frames"])
                source = root / asset.analysis_path
                changed = (progress.get("publishedFinalFrame", -1) != progress["finalFrame"]
                           or progress.get("publishedLiveFrame", -1) != progress["liveFrame"])
                detail_start = int(progress["finalFrame"])
                live_start = max(int(progress["liveFrame"]), detail_start)
                progress["liveFrame"] = live_start
                if live_start > total or detail_start > total:
                    raise ValueError("STT cursor vượt quá audio đã ghi")
                if not finished and total - live_start >= LIVE_SECONDS * RATE:
                    live_end = live_start + LIVE_SECONDS * RATE
                    try:
                        await self._one_segment(project, directory, asset_id, source,
                                                "live", live_start, live_end)
                    except Exception as exc:
                        if asset.transcription_status != "error" or asset.transcription_error != str(exc):
                            self.library.set_transcription_state(project.id, asset_id, "error", error=str(exc))
                        raise
                    progress["liveFrame"] = live_end
                    _atomic_json(stt_path, state)
                    changed = True
                detail_frames = int(state["segmentSeconds"]) * RATE
                initial_end = int(plan["initialFrames"].get(asset_id, 0)) if plan else 0
                detail_ready = detailed_enabled and (
                    (detail_start == 0 and initial_end > 0 and total >= initial_end)
                    or total - detail_start >= detail_frames or (finished and total > detail_start)
                )
                if detail_ready:
                    detail_end = initial_end if detail_start == 0 and initial_end > 0 else min(total, detail_start + detail_frames)
                    try:
                        job_key = (asset_id, final_phase, detail_start, detail_end)
                        active = self._detailed_tasks.get(parent_id)
                        result_ready = False
                        if active:
                            if active[0] == job_key and (active[1].done() or wait_for_detail):
                                try:
                                    await active[1]
                                    result_ready = True
                                finally:
                                    self._detailed_tasks.pop(parent_id, None)
                            elif active[1].done() and active[0][1] != final_phase:
                                # An explicit new plan supersedes legacy work without publishing it.
                                active[1].exception()
                                self._detailed_tasks.pop(parent_id, None)
                        elif wait_for_detail:
                            await self._one_segment(project, directory, asset_id, source,
                                                    final_phase, detail_start, detail_end, overlap=bool(plan))
                            result_ready = True
                        else:
                            self._detailed_tasks[parent_id] = (job_key, asyncio.create_task(self._one_segment(
                                project, directory, asset_id, source, final_phase, detail_start, detail_end,
                                overlap=bool(plan))))
                    except Exception as exc:
                        if asset.transcription_status != "error" or asset.transcription_error != str(exc):
                            self.library.set_transcription_state(project.id, asset_id, "error", error=str(exc))
                        raise
                    if result_ready:
                        progress["finalFrame"] = detail_end
                        _atomic_json(stt_path, state)
                        changed = True
                if finished and detailed_enabled and int(progress["finalFrame"]) == total:
                    if changed or asset.transcription_status not in ("complete", "reviewing"):
                        # A cursor may have committed before publication. Replaying this
                        # step reuses the saved result and leaves a user edit intact.
                        final_results = self._results(directory, asset_id, final_phase)
                        item = self._combine(final_results, total / RATE)
                        user_edited = any(
                            revision.source == "user" and revision.text == asset.text
                            for revision in asset.revisions
                        )
                        self.library.apply_transcription(
                            project.id, asset_id, item, total / RATE, preserve_user_text=True,
                        )
                        if not user_edited:
                            self.library.set_transcription_state(project.id, asset_id, "complete", progress=100)
                elif changed:
                    final_results = self._results(directory, asset_id, final_phase)
                    live_results = [result for result in self._results(directory, asset_id, "live")
                                    if result["startFrame"] >= int(progress["finalFrame"])]
                    item = self._combine(final_results + live_results, total / RATE)
                    self.library.update_live_transcript(project.id, asset_id, item["text"],
                                                        item["words"], total / RATE)
                if changed or (finished and detailed_enabled):
                    final_item = self._combine(self._results(directory, asset_id, final_phase), total / RATE)
                    # Durable, per-channel SRT contains detailed results only, never live guesses.
                    destination = directory / "stt-segments" / asset_id / "transcript.stt.srt"
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    temporary = destination.with_suffix(".srt.tmp")
                    timing = reconcile_word_timing_quality("partial", None, final_item["words"], total / RATE)
                    temporary.write_text(render_srt(word for word in timing.words
                        if word.get("timingTrusted") is True), encoding="utf-8")
                    os.replace(temporary, destination)
                    progress["publishedFinalFrame"] = progress["finalFrame"]
                    progress["publishedLiveFrame"] = progress["liveFrame"]
                    _atomic_json(stt_path, state)
                if detailed_enabled and (int(progress["finalFrame"]) < total or not finished):
                    all_done = False
            if not stt_path.is_file():
                _atomic_json(stt_path, state)
            return {"parentId": parent_id, "finished": finished,
                    "done": all_done or not selected,
                    "selectedAssetIds": selected, "segmentSeconds": state["segmentSeconds"],
                    "tracks": state["tracks"]}

    def status(self, project: ProjectRecord, parent_id: str) -> dict:
        _, follow, _, state = self._load(project, parent_id)
        return {"finished": bool(follow["finished"]),
                "segmentSeconds": state["segmentSeconds"], "tracks": state["tracks"]}
