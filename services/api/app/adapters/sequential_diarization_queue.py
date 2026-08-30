from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
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


# A word whose own span covers less than this is sitting on a boundary; its raw
# winner is a coin toss between two speakers and should not outvote its neighbours.
CONFIDENT_SHARE = 0.5
# Silence that marks a real turn boundary. Speech runs on either side of a shorter
# gap than this are one continuous stretch, whoever the model says is talking.
TURN_BOUNDARY_SILENCE = 0.20
# How far a gap word reaches for a neighbour's label. Wide enough to cover the
# boundary artefacts that leave a word just outside a span, narrow enough that a
# word sitting in real silence stays unlabelled rather than being guessed at.
INHERIT_REACH_SECONDS = 0.6


def _word_bounds(word: dict) -> tuple[float, float] | None:
    try:
        start = float(word.get("start", 0))
        return start, max(start, float(word.get("end", start)))
    except (TypeError, ValueError):
        return None


def assign_spans_to_words(words: list[dict], spans: list[dict]) -> list[dict]:
    """Assign a stable Speaker N label by time overlap; retain user profile IDs.

    Two defects drove this. A word falling in a gap between diarization spans
    overlapped nothing and came back unlabelled - 39 of 665 words on a real
    two-speaker sample. And a word straddling a speaker boundary was decided by
    whichever span held a millisecond more of it, which flipped the speaker
    mid-sentence and inflated the sample to 40 label runs for two speakers.

    So a word now takes a label only when a span genuinely covers it, gap words
    inherit from the nearest labelled neighbour, and boundary words defer to
    their neighbours rather than out-voting them.
    """
    ordered = sorted(
        (span for span in spans if _valid_span(span)),
        key=lambda span: (float(span["start"]), float(span["end"])),
    )
    labels: dict[str, str] = {}
    for span in ordered:
        source = str(span.get("speaker") or "unknown")
        if source not in labels:
            labels[source] = f"speaker-{len(labels) + 1}"

    result = [dict(word) for word in words]
    if not ordered:
        return result

    owners: list[str | None] = []
    confident: list[bool] = []
    for word in result:
        bounds = _word_bounds(word)
        if bounds is None:
            owners.append(None)
            confident.append(False)
            continue
        totals: dict[str, float] = {}
        for span in ordered:
            shared = max(0.0, min(bounds[1], float(span["end"])) - max(bounds[0], float(span["start"])))
            if shared > 0:
                source = str(span.get("speaker") or "unknown")
                totals[source] = totals.get(source, 0.0) + shared
        if not totals:
            owners.append(None)
            confident.append(False)
            continue
        winner = max(totals, key=lambda source: totals[source])
        owners.append(labels[winner])
        confident.append(totals[winner] / max(1e-6, bounds[1] - bounds[0]) >= CONFIDENT_SHARE)

    # A boundary word between two neighbours that agree belongs to them: its own
    # winner was decided by a sliver of overlap.
    for index in range(1, len(owners) - 1):
        if confident[index] or owners[index] is None:
            continue
        if owners[index - 1] is not None and owners[index - 1] == owners[index + 1]:
            owners[index] = owners[index - 1]

    # Gap words: nothing covered them, so take the nearer labelled neighbour.
    for index, owner in enumerate(owners):
        if owner is not None:
            continue
        bounds = _word_bounds(result[index])
        if bounds is None:
            continue
        before = next(
            ((position, owners[position]) for position in range(index - 1, -1, -1) if owners[position]),
            None,
        )
        after = next(
            ((position, owners[position]) for position in range(index + 1, len(owners)) if owners[position]),
            None,
        )
        candidates: list[tuple[float, str]] = []
        if before is not None:
            edge = _word_bounds(result[before[0]])
            if edge:
                candidates.append((bounds[0] - edge[1], before[1]))
        if after is not None:
            edge = _word_bounds(result[after[0]])
            if edge:
                candidates.append((edge[0] - bounds[1], after[1]))
        reachable = [item for item in candidates if item[0] <= INHERIT_REACH_SECONDS]
        if reachable:
            owners[index] = min(reachable, key=lambda item: item[0])[1]

    for word, owner in zip(result, owners):
        if owner is not None:
            word["diarizationSpeakerId"] = owner
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
            # Only one or two words. A longer run is left alone even when it looks
            # like an artefact: Vietnamese conversation is full of short listener
            # backchannels - "dung roi", "a hieu hieu" - and DTW packs words with no
            # gap whether the speaker changed or not, so nothing in the timing
            # separates a real backchannel from a mid-phrase slip. Attributing a
            # listener's words to the speaker is the worse of the two errors, so the
            # rule stays narrow and leaves the rest visible for manual correction.
            if previous[2] != following[2] or label == previous[2] or end - start > 2:
                continue
            try:
                gap_before = float(result[start].get("start", 0)) - float(result[start - 1].get("end", 0))
                gap_after = float(result[end].get("start", 0)) - float(result[end - 1].get("end", 0))
            except (TypeError, ValueError):
                continue
            # Taking a turn requires a turn boundary. A short run with no silence on
            # either side is a label change made in the middle of continuous speech,
            # which is not how speakers alternate - it is the model slicing through
            # one person's sentence. Both flips left on the two-speaker sample were
            # exactly that: a 1.07s span wedged inside "a Thi cai cong ty...", and a
            # 0.46s span splitting "Thu | hai la".
            #
            # A genuine turn is bounded at BOTH ends: the previous speaker stops and
            # the next one starts. Silence on one side only means this run runs
            # straight into its neighbour's speech, so it is part of that neighbour's
            # sentence - "cong viec | khac" and "No | phai dap di xay lai" on the real
            # sample were each split that way.
            #
            # This replaces a duration cap of 0.7s, which asked the wrong question.
            # Being brief does not make an utterance unreal, and that cap erased
            # genuine short turns that were plainly bounded by silence.
            if gap_before > TURN_BOUNDARY_SILENCE and gap_after > TURN_BOUNDARY_SILENCE:
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

    @staticmethod
    def _store_spans(project_path: str, asset_id: str, spans: list[dict], model: str) -> None:
        """Keep the model's raw output beside the asset.

        Only the labels applied to words were persisted, so a questionable result
        could not be re-examined - or a change to the labelling rules re-scored -
        without spending another GPU run. The spans are the processor's evidence
        and belong with the asset, in project-relative form like everything else.
        """
        directory = Path(project_path) / "assets" / "media" / asset_id / "diarization"
        try:
            directory.mkdir(parents=True, exist_ok=True)
            payload = {
                "model": model,
                "producedAt": datetime.now(timezone.utc).isoformat(),
                "spans": spans,
            }
            temporary = directory / "spans.json.tmp"
            temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(directory / "spans.json")
        except OSError:
            # Evidence is useful, not essential: never fail a finished job over it.
            pass

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
            self._store_spans(project.project_path, task.asset_id, spans, settings.model)
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

