from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from app.adapters.activity_logging import job_failed, job_finished, job_progress, job_started
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.openai_compatible_transcript_reviewer import OpenAICompatibleTranscriptReviewer
from app.domain.ports import ProjectRepository


@dataclass(frozen=True)
class TranscriptionTask:
    project_id: str
    asset_id: str
    realtime_text: str = ""
    model: str = "large-v3"


class SequentialTranscriptionQueue:
    """One local worker serializes detailed STT and optional AI review for all project footage."""

    def __init__(
        self,
        projects: ProjectRepository,
        media: FileMediaLibrary,
        importer: MediaImportProcessor,
        reviewer: OpenAICompatibleTranscriptReviewer,
    ) -> None:
        self.projects = projects
        self.media = media
        self.importer = importer
        self.reviewer = reviewer
        self._lock = asyncio.Lock()
        self._pending: list[TranscriptionTask] = []
        self._scheduled: set[tuple[str, str]] = set()
        self._worker: asyncio.Task[None] | None = None
        # Held back rather than dropped: a paused asset keeps its place in line.
        self._paused: set[tuple[str, str]] = set()
        self._paused_projects: set[str] = set()
        # The asset a worker is inside right now. Recognition runs in a worker
        # thread and the model cannot be interrupted, so pause and stop take
        # effect between files - this one always runs to the end.
        self._active: tuple[str, str] | None = None

    async def enqueue(
        self, project_id: str, asset_ids: list[str], realtime_text: str = "", model: str = "large-v3"
    ) -> list[str]:
        requested = set(asset_ids)
        assets = [
            asset
            for asset in self.media.list(project_id)
            if asset.id in requested and asset.analysis_path and asset.status != "no-audio"
            and asset.deleted_at is None and not asset.disabled
        ]
        assets.sort(key=lambda asset: asset.created_at)
        queued: list[str] = []
        async with self._lock:
            for asset in assets:
                key = (project_id, asset.id)
                self.media.set_transcription_selected(project_id, asset.id, True)
                if key in self._scheduled:
                    continue
                self.media.set_transcription_state(
                    project_id,
                    asset.id,
                    "queued",
                    ai_review_status="pending",
                    error=None,
                    progress=0,
                )
                self._pending.append(
                    TranscriptionTask(
                        project_id=project_id,
                        asset_id=asset.id,
                        realtime_text=realtime_text if len(assets) == 1 else "",
                        model=model,
                    )
                )
                self._scheduled.add(key)
                queued.append(asset.id)
            # Asking for a run again is also how a paused batch is let go.
            if asset_ids:
                self._paused_projects.discard(project_id)
                for asset in assets:
                    self._paused.discard((project_id, asset.id))
            self._wake()
        return queued

    def _is_held(self, task: TranscriptionTask) -> bool:
        return (
            task.project_id in self._paused_projects
            or (task.project_id, task.asset_id) in self._paused
        )

    async def _run(self) -> None:
        while True:
            async with self._lock:
                # Skip what is paused rather than stopping the line: the point of
                # pausing one file is that the others carry on.
                runnable = next(
                    (at for at, task in enumerate(self._pending) if not self._is_held(task)),
                    None,
                )
                if runnable is None:
                    self._worker = None
                    self._active = None
                    return
                task = self._pending.pop(runnable)
                self._active = (task.project_id, task.asset_id)
            try:
                await self._process(task)
            finally:
                async with self._lock:
                    self._scheduled.discard((task.project_id, task.asset_id))
                    if self._active == (task.project_id, task.asset_id):
                        self._active = None

    def _wake(self) -> None:
        if self._pending and (self._worker is None or self._worker.done()):
            self._worker = asyncio.create_task(self._run(), name="pro4bro-transcription-queue")

    def _targets(self, project_id: str, asset_ids: list[str] | None) -> list[str]:
        if asset_ids:
            return list(dict.fromkeys(asset_ids))
        return [task.asset_id for task in self._pending if task.project_id == project_id]

    async def pause(self, project_id: str, asset_ids: list[str] | None = None) -> list[str]:
        """Hold assets in the queue. Whatever is mid-recognition still finishes."""
        async with self._lock:
            held = self._targets(project_id, asset_ids)
            if asset_ids is None:
                self._paused_projects.add(project_id)
            for asset_id in held:
                self._paused.add((project_id, asset_id))
                if (project_id, asset_id) == self._active:
                    continue
                try:
                    self.media.set_transcription_state(project_id, asset_id, "paused", progress=0)
                except KeyError:
                    continue
            return held

    async def resume(self, project_id: str, asset_ids: list[str] | None = None) -> list[str]:
        async with self._lock:
            if asset_ids is None:
                self._paused_projects.discard(project_id)
                freed = [asset_id for pid, asset_id in list(self._paused) if pid == project_id]
            else:
                freed = list(dict.fromkeys(asset_ids))
            for asset_id in freed:
                self._paused.discard((project_id, asset_id))
                try:
                    self.media.set_transcription_state(project_id, asset_id, "queued", error=None, progress=0)
                except KeyError:
                    continue
            self._wake()
            return freed

    async def stop(self, project_id: str, asset_ids: list[str] | None = None) -> list[str]:
        """Take assets out of the queue, keeping them ticked so they can be re-run."""
        async with self._lock:
            dropped = self._targets(project_id, asset_ids)
            wanted = set(dropped)
            self._pending = [
                task for task in self._pending
                if task.project_id != project_id or task.asset_id not in wanted
            ]
            if asset_ids is None:
                self._paused_projects.discard(project_id)
            for asset_id in dropped:
                self._scheduled.discard((project_id, asset_id))
                self._paused.discard((project_id, asset_id))
                if (project_id, asset_id) == self._active:
                    continue
                try:
                    self.media.set_transcription_state(project_id, asset_id, "skipped", error=None, progress=0)
                except KeyError:
                    continue
            self._wake()
            return dropped

    def status_any_running(self) -> bool:
        """True when any project's batch is mid-flight, for any project."""
        return self._active is not None or any(not self._is_held(task) for task in self._pending)

    def status(self, project_id: str) -> dict:
        pending = [task for task in self._pending if task.project_id == project_id]
        active = self._active[1] if self._active and self._active[0] == project_id else None
        held = [task.asset_id for task in pending if self._is_held(task)]
        return {
            "running": bool(active) or any(task.asset_id not in held for task in pending),
            "activeAssetId": active,
            "pending": len(pending),
            "pausedAssetIds": held,
            "pausedAll": project_id in self._paused_projects,
        }

    async def _process(self, task: TranscriptionTask) -> None:
        try:
            project = self.projects.get(task.project_id)
            asset = self.media.get(task.project_id, task.asset_id)
            self.media.set_transcription_state(
                task.project_id, task.asset_id, "processing", ai_review_status="pending", progress=0
            )
            started = time.perf_counter()
            job_started(
                "stt", task.project_id, task.asset_id,
                model=task.model, name=asset.name, duration=round(asset.duration, 1),
            )
            milestone = 25.0

            async def report_progress(value: float) -> None:
                nonlocal milestone
                self.media.set_transcription_progress(
                    task.project_id, task.asset_id, value
                )
                if value >= milestone:
                    job_progress("stt", task.project_id, task.asset_id, value)
                    milestone = value + 25

            transcribed, _ = await self.importer.transcribe_existing(
                project, asset, task.realtime_text, model=task.model, on_progress=report_progress
            )
            job_finished(
                "stt", task.project_id, task.asset_id, time.perf_counter() - started,
                words=len(transcribed.words), quality=transcribed.word_timing_quality,
            )
            # AI review is an explicit Script action: retain the STT transcript until the user compares candidates.
            self.media.set_transcription_state(
                task.project_id,
                task.asset_id,
                "complete",
                ai_review_status="pending",
                error=None,
                progress=100,
            )
        except KeyError:
            # A user may remove queued footage before its turn without making the queue fail.
            return
        except Exception as exc:
            job_failed("stt", task.project_id, task.asset_id, exc)
            try:
                self.media.set_transcription_state(
                    task.project_id,
                    task.asset_id,
                    "error",
                    ai_review_status="error",
                    error=str(exc),
                    progress=0,
                )
            except KeyError:
                return