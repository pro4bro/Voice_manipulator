from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from pathlib import Path

from app.adapters.activity_logging import job_failed, job_finished, job_progress, job_started
from app.adapters.file_app_preferences import FileAppPreferences
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.studio_diarization_gateway import StudioDiarizationGateway
from app.domain.ports import ProjectRepository


@dataclass(frozen=True)
class DiarizationTask:
    project_id: str
    asset_id: str
    expected_speakers: int | None = None


def assign_spans_to_words(words: list[dict], spans: list[dict]) -> list[dict]:
    """Assign a stable Speaker N label by maximal time overlap; retain user profile IDs."""
    ordered = sorted(
        (span for span in spans if _valid_span(span)),
        key=lambda span: (float(span["start"]), float(span["end"])),
    )
    labels: dict[str, str] = {}
    for span in ordered:
        source = str(span.get("speaker") or "unknown")
        if source not in labels:
            labels[source] = f"speaker-{len(labels) + 1}"
    result: list[dict] = []
    for raw_word in words:
        word = dict(raw_word)
        try:
            start = float(word.get("start", 0))
            end = max(start, float(word.get("end", start)))
        except (TypeError, ValueError):
            result.append(word)
            continue
        midpoint = (start + end) / 2
        best: dict | None = None
        best_overlap = -1.0
        for span in ordered:
            overlap = max(0.0, min(end, float(span["end"])) - max(start, float(span["start"])))
            contains_midpoint = float(span["start"]) <= midpoint <= float(span["end"])
            if overlap > best_overlap or (overlap == best_overlap and contains_midpoint):
                best, best_overlap = span, overlap
        if best and (best_overlap > 0 or float(best["start"]) <= midpoint <= float(best["end"])):
            word["diarizationSpeakerId"] = labels[str(best.get("speaker") or "unknown")]
        result.append(word)
    return _smooth_short_label_flips(result)


def _smooth_short_label_flips(words: list[dict]) -> list[dict]:
    """Remove an isolated, sub-second A→B→A flip without changing source timing.

    This intentionally only repairs a short middle run when both neighbors agree. Real
    turns, overlapping speech, profile mappings and every word timestamp remain intact.
    """
    if len(words) < 3:
        return words
    result = [dict(word) for word in words]
    changed = True
    while changed:
        changed = False
        runs: list[tuple[int, int, str]] = []
        index = 0
        while index < len(result):
            label = str(result[index].get("diarizationSpeakerId") or "")
            end = index + 1
            while end < len(result) and str(result[end].get("diarizationSpeakerId") or "") == label:
                end += 1
            if label:
                runs.append((index, end, label))
            index = end
        for previous, current, following in zip(runs, runs[1:], runs[2:]):
            start, end, label = current
            if previous[2] != following[2] or label == previous[2] or end - start > 5:
                continue
            try:
                duration = float(result[end - 1].get("end", 0)) - float(result[start].get("start", 0))
            except (TypeError, ValueError):
                continue
            if duration > 0.7:
                continue
            for word in result[start:end]:
                word["diarizationSpeakerId"] = previous[2]
            changed = True
            break
    return result


def _valid_span(span: dict) -> bool:
    try:
        return float(span.get("end", 0)) > float(span.get("start", 0))
    except (TypeError, ValueError):
        return False


class SequentialDiarizationQueue:
    """One GPU job at a time. Diarization never blocks the Studio UI."""

    def __init__(self, projects: ProjectRepository, media: FileMediaLibrary, preferences: FileAppPreferences, studio: StudioDiarizationGateway) -> None:
        self.projects = projects
        self.media = media
        self.preferences = preferences
        self.studio = studio
        self._lock = asyncio.Lock()
        self._pending: list[DiarizationTask] = []
        self._scheduled: set[tuple[str, str]] = set()
        self._worker: asyncio.Task[None] | None = None

    async def enqueue(self, project_id: str, asset_id: str, expected_speakers: int | None = None) -> None:
        asset = self.media.get(project_id, asset_id)
        if asset.transcription_status in {"queued", "processing", "reviewing", "skipped", "not-applicable"}:
            raise ValueError("Hãy hoàn tất Speech to Text trước khi nhận diện speaker.")
        if not asset.analysis_path:
            raise ValueError("Footage không có analysis audio để nhận diện speaker.")
        key = (project_id, asset_id)
        async with self._lock:
            if key in self._scheduled:
                return
            self.media.set_diarization_state(project_id, asset_id, "queued", progress=0, error=None)
            self._pending.append(DiarizationTask(project_id, asset_id, expected_speakers))
            self._scheduled.add(key)
            if self._worker is None or self._worker.done():
                self._worker = asyncio.create_task(self._run(), name="pro4bro-diarization-queue")

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

    async def _process(self, task: DiarizationTask) -> None:
        try:
            asset = self.media.get(task.project_id, task.asset_id)
            project = self.projects.get(task.project_id)
            settings = self.preferences.private_diarization()
            if not settings.enabled:
                raise RuntimeError("Speaker Diarization đang tắt trong Windows → Preferences.")
            self.media.set_diarization_state(task.project_id, task.asset_id, "processing", progress=1, error=None)
            started = time.perf_counter()
            job_started(
                "diarization", task.project_id, task.asset_id,
                model=settings.model, words=len(asset.words),
                expected_speakers=task.expected_speakers,
            )
            milestone = 25.0

            async def report(value: float) -> None:
                nonlocal milestone
                if value >= milestone:
                    # Every 25% keeps a long job visible without one line per tick.
                    job_progress("diarization", task.project_id, task.asset_id, value)
                    milestone = value + 25
                # Progress goes to a small job snapshot. Routing it through the
                # asset index rewrote every word in the project several times a
                # second and starved the rest of the API of the library lock.
                self.media.set_diarization_progress(task.project_id, task.asset_id, value)

            spans = await self.studio.diarize(
                Path(project.project_path) / str(asset.analysis_path),
                token=settings.huggingface_token,
                model=settings.model,
                expected_speakers=task.expected_speakers,
                on_progress=report,
            )
            # Re-read words instead of reusing the snapshot taken before the job.
            # Diarization runs for minutes; Script edits made in the meantime were
            # silently overwritten by the stale copy.
            current = self.media.get(task.project_id, task.asset_id)
            labelled = assign_spans_to_words(current.words, spans)
            self.media.apply_diarization(task.project_id, task.asset_id, labelled)
            job_finished(
                "diarization", task.project_id, task.asset_id, time.perf_counter() - started,
                spans=len(spans),
                speakers=len({w.get("diarizationSpeakerId") for w in labelled if w.get("diarizationSpeakerId")}),
                unlabelled=sum(1 for w in labelled if not w.get("diarizationSpeakerId")),
            )
        except KeyError:
            return
        except Exception as exc:
            job_failed("diarization", task.project_id, task.asset_id, exc)
            state = "requires-setup" if "Hugging Face token" in str(exc) or "chấp nhận model" in str(exc) else "error"
            try:
                self.media.set_diarization_state(task.project_id, task.asset_id, state, progress=0, error=str(exc))
            except KeyError:
                return

