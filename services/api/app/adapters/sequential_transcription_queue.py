from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.openai_compatible_transcript_reviewer import OpenAICompatibleTranscriptReviewer
from app.domain.ports import ProjectRepository


@dataclass(frozen=True)
class TranscriptionTask:
    project_id: str
    asset_id: str
    realtime_text: str = ""


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

    async def enqueue(
        self, project_id: str, asset_ids: list[str], realtime_text: str = ""
    ) -> list[str]:
        requested = set(asset_ids)
        assets = [
            asset
            for asset in self.media.list(project_id)
            if asset.id in requested and asset.analysis_path and asset.status != "no-audio"
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
                    )
                )
                self._scheduled.add(key)
                queued.append(asset.id)
            if self._pending and (self._worker is None or self._worker.done()):
                self._worker = asyncio.create_task(self._run(), name="pro4bro-transcription-queue")
        return queued

    async def _run(self) -> None:
        while True:
            async with self._lock:
                if not self._pending:
                    self._worker = None
                    return
                task = self._pending.pop(0)
            try:
                await self._process(task)
            finally:
                async with self._lock:
                    self._scheduled.discard((task.project_id, task.asset_id))

    async def _process(self, task: TranscriptionTask) -> None:
        try:
            project = self.projects.get(task.project_id)
            asset = self.media.get(task.project_id, task.asset_id)
            self.media.set_transcription_state(
                task.project_id, task.asset_id, "processing", ai_review_status="pending", progress=0
            )
            async def report_progress(value: float) -> None:
                self.media.set_transcription_progress(
                    task.project_id, task.asset_id, value
                )

            transcribed, _ = await self.importer.transcribe_existing(
                project, asset, task.realtime_text, on_progress=report_progress
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