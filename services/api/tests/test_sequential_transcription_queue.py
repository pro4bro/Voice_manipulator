from __future__ import annotations

import asyncio

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.openai_compatible_transcript_reviewer import ReviewOutcome
from app.adapters.sequential_transcription_queue import SequentialTranscriptionQueue
from app.domain.models import MediaAssetCreate, ProjectCreate


class FakeImporter:
    def __init__(self, media: FileMediaLibrary) -> None:
        self.media = media
        self.calls: list[str] = []

    async def transcribe_existing(self, project, asset, realtime_text: str, on_progress=None):
        self.calls.append(asset.id)
        if on_progress:
            await on_progress(12.3)
        updated = self.media.apply_transcription(
            project.id,
            asset.id,
            {"id": f"studio-{asset.id}", "text": realtime_text or asset.name, "words": [], "duration": asset.duration},
            asset.duration,
        )
        return updated, 0.01


class FakeReviewer:
    async def review(self, text: str) -> ReviewOutcome:
        return ReviewOutcome(text=text, status="skipped")


def test_transcription_queue_serializes_requests_in_asset_add_order(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Queue"))
    media = FileMediaLibrary(projects)
    first = media.create(
        project.id,
        MediaAssetCreate(
            name="first.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path="assets/media/first/source.wav",
            analysis_path="assets/media/first/analysis.wav",
            duration=1,
            origin="import",
            transcription_status="skipped",
        ),
    )
    second = media.create(
        project.id,
        MediaAssetCreate(
            name="second.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path="assets/media/second/source.wav",
            analysis_path="assets/media/second/analysis.wav",
            duration=1,
            origin="import",
            transcription_status="skipped",
        ),
    )
    importer = FakeImporter(media)
    queue = SequentialTranscriptionQueue(projects, media, importer, FakeReviewer())

    async def run():
        queued = await queue.enqueue(project.id, [second.id, first.id])
        while queue._worker and not queue._worker.done():
            await asyncio.sleep(0.001)
        return queued

    queued = asyncio.run(run())

    assert queued == [first.id, second.id]
    assert importer.calls == [first.id, second.id]
    assert [media.get(project.id, asset_id).transcription_status for asset_id in queued] == ["complete", "complete"]
