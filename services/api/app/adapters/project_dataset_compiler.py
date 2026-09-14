from __future__ import annotations

import hashlib
import json
from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.domain.models import (
    DATASET_MANIFEST_VERSION,
    CaptureTier,
    DatasetManifest,
    DatasetReadiness,
    DatasetRejection,
    DatasetSegment,
    DatasetStats,
    EmotionLabel,
    ProjectMediaAsset,
    TextProvenance,
)
from app.adapters.script_validation import validate_asset
from app.adapters.sequential_diarization_queue import span_labels
from app.domain.ports import MediaLibrary, ProjectRepository, TrainingCatalogRepository

# The window both OmniVoice and VibeVoice datasets are comfortable with.
# `extract_audio_tokens` filters on exactly these seconds.
SEGMENT_MIN_SECONDS = 2.0
SEGMENT_MAX_SECONDS = 15.0

# A pause long enough to be a place a sentence could end. Cutting anywhere else
# splits a phrase, and half a phrase teaches a prosody contour that stops
# mid-thought.
BOUNDARY_GAP_SECONDS = 0.25

# OmniVoice's data config needs both a train and a dev manifest, so the split is
# part of compilation rather than an afterthought at launch time.
DEV_SPLIT_PERCENT = 8


# Another voice under a word for at least this long means the word carries two
# people. Below it is the boundary jitter every diarizer leaves at a turn change,
# and dropping on that would throw away the last word of almost every turn.
# Chosen, not measured: revisit once real overlap statistics exist.
OVERLAP_WORD_SECONDS = 0.1

# Another voice inside the silence between two of one person's words, for at
# least this long, means the gap is not silence. Cutting across it would put
# that voice inside the segment.
OVERLAP_GAP_SECONDS = 0.2

# Marks an overlap region as foreign to every speaker, including its own.
_EVERYONE_ELSE = object()


@dataclass
class _Drops:
    """Seconds of speech kept out of the dataset, and why."""

    unassigned: float = 0.0
    overlap: float = 0.0
    owned: float = 0.0

    def add(self, other: "_Drops") -> None:
        self.unassigned += other.unassigned
        self.overlap += other.overlap
        self.owned += other.owned


@dataclass
class _Group:
    # True when the group begins right after excluded audio, so it must never be
    # merged back onto the group before it.
    walled: bool
    words: list[dict[str, Any]]


@dataclass
class _SpeakerContext:
    """Who owns each word of one asset, and where other voices are.

    Ownership, most explicit first:
      1. `speakerId` on the word - a tag set in Script, or written there when a
         diarization label was mapped to a profile;
      2. the word's diarization label, through the asset's label-to-profile map;
      3. the asset's one profile, but only when nothing suggests a second voice.

    Anything else has no owner and is dropped. A footage tagged with one profile
    whose diarization found two voices is not a one-person footage, and treating
    it as one is exactly how an interviewer ends up inside a guest's model.
    """

    assignments: dict[str, str | None] = field(default_factory=dict)
    default: str | None = None
    intervals: list[tuple[float, float, object]] = field(default_factory=list)
    _starts: list[float] = field(default_factory=list)
    _longest: float = 0.0

    @classmethod
    def for_asset(cls, asset: ProjectMediaAsset, project_root: Path) -> "_SpeakerContext":
        assignments = {
            str(label): (str(profile) if profile else None)
            for label, profile in (asset.diarization_speaker_assignments or {}).items()
        }
        spans, overlaps = _read_diarization(project_root, asset.id)
        raw_to_label = span_labels(spans)

        word_labels = {
            str(word.get("manualDiarizationSpeakerId") or word.get("diarizationSpeakerId"))
            for word in (asset.words or [])
            if word.get("manualDiarizationSpeakerId") or word.get("diarizationSpeakerId")
        }
        profiles = [profile for profile in asset.speaker_profile_ids if profile]
        voices = word_labels | set(raw_to_label.values())
        default = profiles[0] if len(profiles) == 1 and len(voices) <= 1 else None

        # Owners of the words themselves, used to decide whose voice an unmapped
        # span is. A person who tagged words in Script instead of mapping the
        # label has still said who is speaking there.
        partial = cls(assignments=assignments, default=default)
        owned: list[tuple[float, float, str]] = []
        for word in asset.words or []:
            who = partial.owner(word)
            if not who:
                continue
            try:
                word_start, word_end = float(word["start"]), float(word["end"])
            except (KeyError, TypeError, ValueError):
                continue
            if word_end > word_start:
                owned.append((word_start, word_end, who))
        owned.sort(key=lambda item: item[0])

        intervals: list[tuple[float, float, object]] = []
        for span in spans:
            try:
                start, end = float(span["start"]), float(span["end"])
            except (KeyError, TypeError, ValueError):
                continue
            if end <= start:
                continue
            label = raw_to_label.get(str(span.get("speaker") or "unknown"))
            if label in assignments:
                owner: object = assignments[label]
            else:
                # Unmapped: claimed by whoever owns most of the words inside it.
                # A span no owned word claims is a voice nobody named, and is
                # treated as someone else - the choice that drops, never mislabels.
                owner = _dominant_owner(owned, start, end) or default
            intervals.append((start, end, owner))
        for region in overlaps:
            try:
                start, end = float(region["start"]), float(region["end"])
            except (KeyError, TypeError, ValueError):
                continue
            if end > start:
                intervals.append((start, end, _EVERYONE_ELSE))

        intervals.sort(key=lambda item: item[0])
        return cls(
            assignments=assignments,
            default=default,
            intervals=intervals,
            _starts=[item[0] for item in intervals],
            _longest=max((end - start for start, end, _ in intervals), default=0.0),
        )

    def owner(self, word: dict[str, Any]) -> str | None:
        explicit = word.get("speakerId")
        if explicit:
            return str(explicit)
        label = word.get("manualDiarizationSpeakerId") or word.get("diarizationSpeakerId")
        if label and str(label) in self.assignments:
            return self.assignments[str(label)]
        return self.default

    def foreign_seconds(self, start: float, end: float, owner: str) -> float:
        """How long any voice other than `owner` sounds inside [start, end]."""
        if end <= start or not self.intervals:
            return 0.0
        total = 0.0
        index = bisect_right(self._starts, end)
        while index > 0:
            index -= 1
            span_start, span_end, who = self.intervals[index]
            if span_start < start - self._longest:
                break
            if who == owner:
                continue
            total += max(0.0, min(end, span_end) - max(start, span_start))
        return total


# An unmapped span belongs to a person only when their words fill a real share of
# it. A boundary word leaking a few milliseconds into someone else's turn must not
# hand that whole turn over.
SPAN_CLAIM_SHARE = 0.3


def _dominant_owner(owned: list[tuple[float, float, str]], start: float, end: float) -> str | None:
    """The profile whose words cover most of [start, end], if they cover enough."""
    if not owned or end <= start:
        return None
    starts = [item[0] for item in owned]
    longest = max(item[1] - item[0] for item in owned)
    totals: dict[str, float] = {}
    index = bisect_right(starts, end)
    while index > 0:
        index -= 1
        word_start, word_end, who = owned[index]
        if word_start < start - longest:
            break
        shared = min(end, word_end) - max(start, word_start)
        if shared > 0:
            totals[who] = totals.get(who, 0.0) + shared
    if not totals:
        return None
    who = max(totals, key=lambda key: totals[key])
    return who if totals[who] >= SPAN_CLAIM_SHARE * (end - start) else None



def _read_diarization(project_root: Path, asset_id: str) -> tuple[list[dict], list[dict]]:
    """Spans and overlap regions stored beside the asset, or nothing.

    An asset diarized before overlap regions were stored has spans and no
    overlaps. That reads as "no overlap measured", not as "no overlap": re-run
    diarization to have talk-over excluded from its segments.
    """
    path = project_root / "assets" / "media" / asset_id / "diarization" / "spans.json"
    if not path.is_file():
        return [], []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return [], []
    spans = [span for span in payload.get("spans", []) if isinstance(span, dict)]
    overlaps = [region for region in payload.get("overlaps", []) if isinstance(region, dict)]
    return spans, overlaps



class DatasetCompilationError(ValueError):
    """Nothing usable came out, and the caller needs to know why."""


def _instruct_for(emotion: EmotionLabel) -> str:
    """`normal` is the absence of a delivery instruction, not an instruction."""
    return "" if emotion in {"normal", "mix"} else emotion


def _split_for(segment_id: str) -> str:
    """Deterministic from the id, so recompiling an unchanged project is stable.

    A random split would make two runs on the same data incomparable, which is
    the one thing a dev set exists to prevent.
    """
    digest = hashlib.sha256(segment_id.encode("utf-8")).hexdigest()
    return "dev" if int(digest[:8], 16) % 100 < DEV_SPLIT_PERCENT else "train"


class ProjectDatasetCompiler:
    """Compiles the assets a user selected into a portable Dataset Manifest.

    Two source shapes, and the difference is the whole point of guided capture:

    A **guided** take is already one card, one file, one known text, so it is one
    segment and no boundary has to be found. An imported or freely recorded asset
    has to be cut, and the only honest place to cut is a pause the recogniser
    actually measured.
    """

    def __init__(
        self,
        projects: ProjectRepository,
        library: MediaLibrary,
        catalogs: TrainingCatalogRepository,
    ) -> None:
        self.projects = projects
        self.library = library
        self.catalogs = catalogs

    # ---------- public ----------

    def readiness(self, project_id: str) -> DatasetReadiness:
        segments, rejections, selected, drops = self._collect(project_id)
        validations = []
        for summary in selected:
            if summary.capture_tier != "guided":
                continue
            checked = validate_asset(self.library.get(project_id, summary.id))
            if checked is not None:
                validations.append(checked)
        speakers = sorted({s.speaker_profile_id for s in segments if s.speaker_profile_id})
        by_speaker: dict[str, float] = {}
        for segment in segments:
            if segment.speaker_profile_id:
                by_speaker[segment.speaker_profile_id] = round(
                    by_speaker.get(segment.speaker_profile_id, 0) + segment.duration, 2
                )
        by_tier: dict[str, int] = {}
        by_emotion: dict[str, float] = {}
        for segment in segments:
            by_tier[segment.capture_tier] = by_tier.get(segment.capture_tier, 0) + 1
            by_emotion[segment.emotion] = round(
                by_emotion.get(segment.emotion, 0) + segment.duration, 2
            )
        ready = len({segment.asset_id for segment in segments})
        return DatasetReadiness(
            selected_assets=len(selected),
            ready_assets=ready,
            segments=len(segments),
            total_seconds=round(sum(segment.duration for segment in segments), 2),
            speaker_profile_ids=speakers,
            segments_by_tier=by_tier,
            seconds_by_emotion=by_emotion,
            seconds_by_speaker=by_speaker,
            rejections=rejections,
            script_validations=validations,
            seconds_dropped_unassigned=round(drops.unassigned, 2),
            seconds_dropped_overlap=round(drops.overlap, 2),
        )

    def compile(self, project_id: str) -> DatasetManifest:
        segments, rejections, selected, drops = self._collect(project_id)
        if not segments:
            raise DatasetCompilationError(
                "Không có đoạn nào hợp lệ để train. Xem danh sách bị loại để biết lý do."
            )
        segments = self._assign_splits(segments)
        manifest = DatasetManifest(
            version=DATASET_MANIFEST_VERSION,
            id=f"dataset-{uuid4().hex[:12]}",
            created_at=datetime.now(timezone.utc),
            source_asset_ids=[asset.id for asset in selected],
            segments=segments,
            rejections=rejections,
            stats=self._stats(segments).model_copy(
                update={
                    "seconds_dropped_unassigned": round(drops.unassigned, 2),
                    "seconds_dropped_overlap": round(drops.overlap, 2),
                }
            ),
        )
        self._persist(project_id, manifest)
        return manifest

    def load(self, project_id: str, manifest_id: str) -> DatasetManifest:
        """Load the immutable manifest selected by a training run."""
        path = (
            Path(self.projects.get(project_id).project_path)
            / "assets"
            / "training"
            / "datasets"
            / f"{manifest_id}.json"
        )
        if not path.is_file():
            raise KeyError(manifest_id)
        manifest = DatasetManifest.model_validate_json(path.read_text(encoding="utf-8"))
        if manifest.id != manifest_id:
            raise ValueError("Dataset manifest id không khớp với tên file.")
        return manifest

    # ---------- collection ----------

    def _collect(
        self, project_id: str
    ) -> tuple[list[DatasetSegment], list[DatasetRejection], list[ProjectMediaAsset], "_Drops"]:
        catalog = self.catalogs.get(project_id)
        known_speakers = {speaker.id for speaker in catalog.speakers}
        # Speech a voice engine generated is never training material: a voice
        # trained on its own output drifts further from the person each round.
        selected = [
            asset
            for asset in self.library.list(project_id)
            if asset.training_selected
            and not getattr(asset, "deleted_at", None)
            and asset.origin != "generate"
        ]

        segments: list[DatasetSegment] = []
        rejections: list[DatasetRejection] = []
        drops = _Drops()
        project_root = Path(self.projects.get(project_id).project_path)

        for summary in selected:
            asset = self.library.get(project_id, summary.id)
            problem = self._reject(asset, project_root, known_speakers)
            if problem is not None:
                rejections.append(problem)
                continue
            context = _SpeakerContext.for_asset(asset, project_root)
            produced, dropped = self._segments_for(asset, context)
            drops.add(dropped)
            if not produced:
                rejections.append(self._empty_reason(asset, dropped))
                continue
            segments.extend(produced)

        return segments, rejections, selected, drops

    def _reject(
        self, asset: ProjectMediaAsset, project_root: Path, known_speakers: set[str]
    ) -> DatasetRejection | None:
        def refuse(reason: Any, detail: str) -> DatasetRejection:
            return DatasetRejection(
                asset_id=asset.id, asset_name=asset.name, reason=reason, detail=detail
            )

        if asset.status == "no-audio" or not asset.analysis_path:
            return refuse("no-audio", "Footage không có audio để train.")
        if not (project_root / asset.analysis_path).is_file():
            return refuse("missing-audio-file", f"Thiếu file {asset.analysis_path}.")
        if not asset.text.strip():
            return refuse("empty-text", "Chưa có transcript.")

        speakers = [s for s in asset.speaker_profile_ids if s]
        unknown = [s for s in speakers if s not in known_speakers]
        if unknown:
            return refuse("unknown-speaker", f"Speaker Profile không tồn tại: {', '.join(unknown)}.")
        if not speakers:
            return refuse("unassigned-speaker", "Chưa gán Speaker Profile cho footage này.")
        if asset.capture_tier != "guided" and not (asset.words or []):
            return refuse("no-word-timing", "Chưa có word timing để cắt đoạn.")
        return None

    @staticmethod
    def _empty_reason(asset: ProjectMediaAsset, dropped: "_Drops") -> DatasetRejection:
        # Say which thing emptied it. "No usable segment" alone sends a person
        # hunting through timing when the fix is a speaker label.
        if dropped.unassigned > 0 and dropped.owned == 0:
            return DatasetRejection(
                asset_id=asset.id,
                asset_name=asset.name,
                reason="mixed-speaker-unresolved",
                detail="Chưa có người nói nào trong footage được gán Speaker Profile.",
            )
        return DatasetRejection(
            asset_id=asset.id,
            asset_name=asset.name,
            reason="no-usable-segment",
            detail=f"Không cắt được đoạn nào trong {SEGMENT_MIN_SECONDS}-{SEGMENT_MAX_SECONDS}s.",
        )

    # ---------- segmentation ----------

    def _segments_for(
        self, asset: ProjectMediaAsset, context: "_SpeakerContext"
    ) -> tuple[list[DatasetSegment], "_Drops"]:
        if asset.capture_tier == "guided":
            return self._guided_segment(asset), _Drops()
        return self._segments_from_words(asset, context)

    def _guided_segment(self, asset: ProjectMediaAsset) -> list[DatasetSegment]:
        """A guided take is already the unit: one card, one file, exact text.

        No boundary has to be found because none was ever lost, which is why
        guided capture sidesteps the alignment problem entirely.
        """
        duration = round(asset.duration, 3)
        if not SEGMENT_MIN_SECONDS <= duration <= SEGMENT_MAX_SECONDS:
            return []
        return [
            self._segment(
                asset,
                index=0,
                start=0.0,
                end=duration,
                text=asset.text.strip(),
                speaker_id=(asset.speaker_profile_ids or [None])[0],
                emotion=asset.emotion,
                provenance="script",
            )
        ]

    def _segments_from_words(
        self, asset: ProjectMediaAsset, context: "_SpeakerContext"
    ) -> tuple[list[DatasetSegment], "_Drops"]:
        """Cut each person's turns into segments, and drop everything unowned.

        A word leaves the dataset - audio and text together - when it has no
        Speaker Profile, or when another voice sounds under it. Leaving either in
        would teach one person's model part of someone else, and nothing
        downstream can find or undo that.

        A dropped word is a wall, not a gap to join across: the groups either side
        of it may never merge, because the merged span would carry the very audio
        that was just excluded.
        """
        drops = _Drops()
        groups: list[_Group] = []
        current: list[dict[str, Any]] = []
        current_walled = False
        pending_wall = False

        def close() -> None:
            nonlocal current
            if current:
                groups.append(_Group(walled=current_walled, words=current))
            current = []

        for raw in asset.words or []:
            if not self._usable(raw):
                close()
                pending_wall = True
                continue
            start, end = float(raw["start"]), float(raw["end"])
            owner = context.owner(raw)
            if owner is None:
                drops.unassigned += end - start
                close()
                pending_wall = True
                continue
            if context.foreign_seconds(start, end, owner) >= OVERLAP_WORD_SECONDS:
                drops.overlap += end - start
                close()
                pending_wall = True
                continue
            drops.owned += end - start

            word = {**raw, "_owner": owner}
            if current:
                previous = current[-1]
                gap = start - float(previous["end"])
                would_run = end - float(current[0]["start"])
                # A segment may not cross a speaker or an emotion change: the
                # label describes the whole segment, so a mixed one is mislabelled
                # whichever value it takes.
                changed = owner != previous["_owner"] or raw.get("emotion") != previous.get("emotion")
                # Silence between two of this person's words can still hold a
                # voice nobody transcribed, and that stretch would be cut in too.
                intruded = (
                    context.foreign_seconds(float(previous["end"]), start, owner)
                    >= OVERLAP_GAP_SECONDS
                )
                if changed or intruded or gap >= BOUNDARY_GAP_SECONDS or would_run > SEGMENT_MAX_SECONDS:
                    close()
                    pending_wall = pending_wall or intruded
            if not current:
                current_walled = pending_wall
                pending_wall = False
            current.append(word)
        close()

        segments: list[DatasetSegment] = []
        for group in self._merge_short(groups, context):
            start = float(group[0]["start"])
            end = float(group[-1]["end"])
            if not SEGMENT_MIN_SECONDS <= end - start <= SEGMENT_MAX_SECONDS:
                continue
            text = " ".join(str(word.get("text", "")).strip() for word in group).strip()
            if not text:
                continue
            segments.append(
                self._segment(
                    asset,
                    index=len(segments),
                    start=start,
                    end=end,
                    text=text,
                    speaker_id=group[0]["_owner"],
                    emotion=group[0].get("emotion") or self._asset_emotion(asset),
                    provenance="user" if asset.revisions and asset.revisions[-1].source == "user" else "stt",
                )
            )
        return segments, drops

    @staticmethod
    def _usable(word: dict[str, Any]) -> bool:
        """A word with untrusted or impossible timing cannot bound a segment.

        Its text may be perfectly right, but its interval is what would become a
        cut point, and W2 already decided such intervals are not to be trusted.
        """
        if not str(word.get("text", "")).strip():
            return False
        if word.get("timingTrusted") is False:
            return False
        try:
            start = float(word["start"])
            end = float(word["end"])
        except (KeyError, TypeError, ValueError):
            return False
        return 0 <= start < end

    @staticmethod
    def _merge_short(
        groups: list["_Group"], context: "_SpeakerContext"
    ) -> list[list[dict[str, Any]]]:
        """Join a too-short group to the next only when nothing lies between them.

        Groups sit next to each other in this list even when a dropped word or
        another voice separated them in the audio. Merging on adjacency alone is
        how excluded audio would come back inside a segment, so a group that
        starts after a wall never merges backwards.
        """
        merged: list[list[dict[str, Any]]] = []
        for group in groups:
            words = group.words
            if merged and not group.walled:
                previous = merged[-1]
                previous_length = float(previous[-1]["end"]) - float(previous[0]["start"])
                combined = float(words[-1]["end"]) - float(previous[0]["start"])
                same_owner = previous[-1]["_owner"] == words[0]["_owner"]
                same_mood = previous[-1].get("emotion") == words[0].get("emotion")
                clean = (
                    context.foreign_seconds(
                        float(previous[-1]["end"]), float(words[0]["start"]), words[0]["_owner"]
                    )
                    < OVERLAP_GAP_SECONDS
                )
                if (
                    previous_length < SEGMENT_MIN_SECONDS
                    and combined <= SEGMENT_MAX_SECONDS
                    and same_owner
                    and same_mood
                    and clean
                ):
                    merged[-1] = previous + words
                    continue
            merged.append(list(words))
        return merged

    @staticmethod
    def _asset_emotion(asset: ProjectMediaAsset) -> EmotionLabel:
        # `mix` is a rollup meaning the words disagree; a segment that inherits it
        # would be labelled with a non-delivery, so fall back to neutral.
        return "normal" if asset.emotion == "mix" else asset.emotion

    def _segment(
        self,
        asset: ProjectMediaAsset,
        index: int,
        start: float,
        end: float,
        text: str,
        speaker_id: str | None,
        emotion: EmotionLabel,
        provenance: TextProvenance,
    ) -> DatasetSegment:
        tier: CaptureTier = asset.capture_tier
        return DatasetSegment(
            id=f"{asset.id}-s{index:04d}",
            asset_id=asset.id,
            audio_path=asset.analysis_path or "",
            start=round(start, 3),
            end=round(end, 3),
            text=text,
            speaker_profile_id=speaker_id,
            emotion=emotion,
            instruct=_instruct_for(emotion),
            capture_tier=tier,
            text_provenance=provenance,
        )

    # ---------- split, stats, persistence ----------

    def _assign_splits(self, segments: list[DatasetSegment]) -> list[DatasetSegment]:
        assigned = [
            segment.model_copy(update={"split": _split_for(segment.id)}) for segment in segments
        ]
        # Each voice target trains on its own segments, and OmniVoice's data
        # config requires a dev list and a train list. A person with a handful of
        # segments can hash entirely into one side, so the guarantee is kept per
        # speaker, moving one segment deterministically rather than letting that
        # person's run fail at launch.
        by_speaker: dict[str | None, list[DatasetSegment]] = {}
        for segment in assigned:
            by_speaker.setdefault(segment.speaker_profile_id, []).append(segment)
        moved: dict[str, str] = {}
        for group in by_speaker.values():
            if len(group) < 2:
                continue
            for missing, other in (("dev", "train"), ("train", "dev")):
                if not any(segment.split == missing for segment in group):
                    chosen = max(
                        (segment for segment in group if segment.split == other),
                        key=lambda segment: hashlib.sha256(segment.id.encode()).hexdigest(),
                    )
                    moved[chosen.id] = missing
        return [
            segment.model_copy(update={"split": moved[segment.id]}) if segment.id in moved else segment
            for segment in assigned
        ]

    @staticmethod
    def _stats(segments: list[DatasetSegment]) -> DatasetStats:
        by_emotion: dict[str, float] = {}
        by_tier: dict[str, int] = {}
        by_speaker: dict[str, float] = {}
        for segment in segments:
            by_emotion[segment.emotion] = round(
                by_emotion.get(segment.emotion, 0) + segment.duration, 2
            )
            by_tier[segment.capture_tier] = by_tier.get(segment.capture_tier, 0) + 1
            if segment.speaker_profile_id:
                by_speaker[segment.speaker_profile_id] = round(
                    by_speaker.get(segment.speaker_profile_id, 0) + segment.duration, 2
                )
        return DatasetStats(
            segments=len(segments),
            train_segments=sum(1 for segment in segments if segment.split == "train"),
            dev_segments=sum(1 for segment in segments if segment.split == "dev"),
            total_seconds=round(sum(segment.duration for segment in segments), 2),
            seconds_by_emotion=by_emotion,
            segments_by_tier=by_tier,
            seconds_by_speaker=by_speaker,
        )

    def _persist(self, project_id: str, manifest: DatasetManifest) -> Path:
        root = Path(self.projects.get(project_id).project_path) / "assets" / "training" / "datasets"
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{manifest.id}.json"
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(
            manifest.model_dump_json(by_alias=True, indent=2), encoding="utf-8"
        )
        temporary.replace(path)
        return path
