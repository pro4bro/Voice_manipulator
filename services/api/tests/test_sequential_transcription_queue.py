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

    async def transcribe_existing(self, project, asset, realtime_text: str, on_progress=None, model: str = "large-v3"):
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


def _asset(media, project_id, name: str):
    return media.create(
        project_id,
        MediaAssetCreate(
            name=f"{name}.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path=f"assets/media/{name}/source.wav",
            analysis_path=f"assets/media/{name}/analysis.wav",
            duration=1,
            origin="import",
            transcription_status="skipped",
        ),
    )


class GatedImporter(FakeImporter):
    """Lets a test hold one file inside recognition while it drives the queue."""

    def __init__(self, media: FileMediaLibrary) -> None:
        super().__init__(media)
        self.entered = asyncio.Event()
        self.release = asyncio.Event()

    async def transcribe_existing(self, project, asset, realtime_text: str, on_progress=None, model: str = "large-v3"):
        self.entered.set()
        await self.release.wait()
        return await super().transcribe_existing(project, asset, realtime_text, on_progress, model)


def test_pausing_one_asset_lets_the_rest_of_the_batch_carry_on(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Queue"))
    media = FileMediaLibrary(projects)
    first = _asset(media, project.id, "first")
    second = _asset(media, project.id, "second")
    third = _asset(media, project.id, "third")
    importer = GatedImporter(media)
    queue = SequentialTranscriptionQueue(projects, media, importer, FakeReviewer())

    async def run():
        await queue.enqueue(project.id, [first.id, second.id, third.id])
        await importer.entered.wait()          # inside "first"
        await queue.pause(project.id, [second.id])
        importer.release.set()
        while queue._worker and not queue._worker.done():
            await asyncio.sleep(0.001)

    asyncio.run(run())

    # The paused one is skipped over, not blocking the queue behind it.
    assert importer.calls == [first.id, third.id]
    assert media.get(project.id, second.id).transcription_status == "paused"
    assert media.get(project.id, third.id).transcription_status == "complete"


def test_resuming_runs_what_was_held_back(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Queue"))
    media = FileMediaLibrary(projects)
    first = _asset(media, project.id, "first")
    second = _asset(media, project.id, "second")
    importer = FakeImporter(media)
    queue = SequentialTranscriptionQueue(projects, media, importer, FakeReviewer())

    async def run():
        await queue.pause(project.id)          # pause the project before anything runs
        await queue.enqueue(project.id, [first.id, second.id])
        await queue.pause(project.id)
        while queue._worker and not queue._worker.done():
            await asyncio.sleep(0.001)
        held = list(importer.calls)
        await queue.resume(project.id)
        while queue._worker and not queue._worker.done():
            await asyncio.sleep(0.001)
        return held

    held = asyncio.run(run())

    assert held == []
    assert importer.calls == [first.id, second.id]


def test_stopping_takes_an_asset_out_but_keeps_it_ticked_for_a_re_run(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Queue"))
    media = FileMediaLibrary(projects)
    first = _asset(media, project.id, "first")
    second = _asset(media, project.id, "second")
    importer = GatedImporter(media)
    queue = SequentialTranscriptionQueue(projects, media, importer, FakeReviewer())

    async def run():
        await queue.enqueue(project.id, [first.id, second.id])
        await importer.entered.wait()
        await queue.stop(project.id, [second.id])
        importer.release.set()
        while queue._worker and not queue._worker.done():
            await asyncio.sleep(0.001)

    asyncio.run(run())

    assert importer.calls == [first.id]
    stopped = media.get(project.id, second.id)
    assert stopped.transcription_status == "skipped"
    # Stop cancels this run, not the intent to transcribe it.
    assert stopped.transcription_selected is True
