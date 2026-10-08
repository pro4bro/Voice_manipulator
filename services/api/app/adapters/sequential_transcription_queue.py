from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from app.adapters.activity_logging import job_cancelled, job_failed, job_finished, job_progress, job_started, job_tick
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.openai_compatible_transcript_reviewer import OpenAICompatibleTranscriptReviewer
from app.adapters.processing_cancellation import ProcessingCancellation, ProcessingStopError, ProcessingStopped
from app.domain.ports import ProjectRepository


@dataclass(frozen=True)
class TranscriptionTask:
    project_id: str
    asset_id: str
    realtime_text: str = ""
    model: str = "large-v3"
    cancellation: ProcessingCancellation | None = None


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
        # The asset a worker is inside right now. Pause and ordinary Stop let
        # it finish; confirmed Stop All signals its per-job cancellation owner.
        self._active: tuple[str, str] | None = None
        self._active_task: TranscriptionTask | None = None

    async def enqueue(
        self, project_id: str, asset_ids: list[str], realtime_text: str = "", model: str = "large-v3"
    ) -> list[str]:
        requested = set(asset_ids)
        assets = [
            asset
            for asset in self.media.list(project_id)
            if asset.id in requested and asset.import_selected and asset.analysis_path and asset.status != "no-audio"
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
                        cancellation=ProcessingCancellation(),
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

    async def recover_interrupted(
        self, project_id: str, *, resume_owned_asset_ids: set[str] | None = None,
    ) -> list[str]:
        """Release persisted batch work that has no owner in this API process.

        This is called only at API startup or immediately after Open Existing.
        It never runs as part of queue polling. It skips tasks already scheduled
        by this queue and assets claimed by a validated durable checkpoint resumer.
        """
        recovered: list[str] = []
        async with self._lock:
            assets = await asyncio.to_thread(self.media.list, project_id)
            for asset in assets:
                key = (project_id, asset.id)
                if (
                    key in self._scheduled
                    or asset.id in (resume_owned_asset_ids or set())
                    or asset.transcription_status not in {"queued", "processing", "reviewing"}
                ):
                    continue
                await asyncio.to_thread(
                    self.media.set_transcription_state,
                    project_id,
                    asset.id,
                    "cancelled",
                    error="Recognition was interrupted when the API stopped. Run STT again to retry.",
                    progress=0,
                )
                recovered.append(asset.id)
        return recovered

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
                self._active_task = task
            try:
                await self._process(task)
            finally:
                async with self._lock:
                    self._scheduled.discard((task.project_id, task.asset_id))
                    if self._active == (task.project_id, task.asset_id):
                        self._active = None
                        self._active_task = None

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

    async def stop(
        self,
        project_id: str,
        asset_ids: list[str] | None = None,
        *,
        include_active: bool = False,
    ) -> list[str]:
        """Remove pending work; optionally cancel matching active inference too."""
        active_to_cancel: TranscriptionTask | None = None
        async with self._lock:
            wanted = set(asset_ids) if asset_ids else {
                task.asset_id for task in self._pending if task.project_id == project_id
            }
            dropped = [
                task.asset_id for task in self._pending
                if task.project_id == project_id and task.asset_id in wanted
            ]
            self._pending = [
                task for task in self._pending
                if task.project_id != project_id or task.asset_id not in wanted
            ]
            if include_active and self._active_task is not None:
                active = self._active_task
                if active.project_id == project_id and (not asset_ids or active.asset_id in wanted):
                    active_to_cancel = active
                    # This synchronous fence runs before releasing the queue lock.
                    if active.cancellation is not None:
                        active.cancellation.request()
                    dropped.append(active.asset_id)
            if asset_ids is None:
                self._paused_projects.discard(project_id)
            for asset_id in dropped:
                if (project_id, asset_id) != self._active:
                    self._scheduled.discard((project_id, asset_id))
                self._paused.discard((project_id, asset_id))
                if (project_id, asset_id) == self._active:
                    if include_active:
                        try:
                            self.media.set_transcription_state(
                                project_id, asset_id, "cancelled", ai_review_status="skipped", error=None, progress=0
                            )
                        except KeyError:
                            pass
                    continue
                try:
                    state = "cancelled" if include_active else "skipped"
                    self.media.set_transcription_state(
                        project_id, asset_id, state,
                        ai_review_status="skipped" if include_active else None,
                        error=None,
                        progress=0,
                    )
                except KeyError:
                    continue
            self._wake()
        if active_to_cancel and active_to_cancel.cancellation is not None:
            try:
                await active_to_cancel.cancellation.cancel()
            except ProcessingStopError as exc:
                try:
                    self.media.set_transcription_state(
                        project_id, active_to_cancel.asset_id, "error", ai_review_status="error",
                        error=str(exc), progress=0,
                    )
                except KeyError:
                    pass
                raise
        return list(dict.fromkeys(dropped))

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
        activity_started = False
        try:
            cancellation = task.cancellation
            if cancellation:
                cancellation.check()
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
            activity_started = True
            milestone = 25.0

            async def report_progress(value: float) -> None:
                nonlocal milestone
                if cancellation:
                    cancellation.check()
                self.media.set_transcription_progress(
                    task.project_id, task.asset_id, value
                )
                job_tick("stt", task.project_id, task.asset_id, value, f"{value:.0f}% · {asset.name}")
                if value >= milestone:
                    job_progress("stt", task.project_id, task.asset_id, value)
                    milestone = value + 25

            transcribed, _ = await self.importer.transcribe_existing(
                project, asset, task.realtime_text, model=task.model, on_progress=report_progress,
                cancellation=cancellation,
            )
            if cancellation:
                cancellation.check()
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
        except ProcessingStopped:
            try:
                state = "error" if cancellation and cancellation.cancel_error else "cancelled"
                self.media.set_transcription_state(
                    task.project_id, task.asset_id, state,
                    ai_review_status="error" if state == "error" else "skipped",
                    error=cancellation.cancel_error if state == "error" else None,
                    progress=0,
                )
            except KeyError:
                pass
            if state == "error":
                job_failed("stt", task.project_id, task.asset_id, ProcessingStopError(cancellation.cancel_error))
            elif activity_started:
                job_cancelled("stt", task.project_id, task.asset_id, "Recognition cancelled")
        except KeyError:
            # A user may remove queued footage before its turn without making the queue fail.
            if activity_started:
                job_cancelled("stt", task.project_id, task.asset_id, "Footage removed")
        except Exception as exc:
            if task.cancellation and task.cancellation.cancelled:
                state = "error" if task.cancellation.cancel_error else "cancelled"
                try:
                    self.media.set_transcription_state(
                        task.project_id, task.asset_id, state,
                        ai_review_status="error" if state == "error" else "skipped",
                        error=task.cancellation.cancel_error if state == "error" else None,
                        progress=0,
                    )
                except KeyError:
                    pass
                if state == "error":
                    job_failed("stt", task.project_id, task.asset_id, ProcessingStopError(task.cancellation.cancel_error))
                elif activity_started:
                    job_cancelled("stt", task.project_id, task.asset_id, "Recognition cancelled")
                return
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
