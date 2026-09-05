from __future__ import annotations

import hashlib
import json
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
        segments, rejections, selected = self._collect(project_id)
        validations = []
        for summary in selected:
            if summary.capture_tier != "guided":
                continue
            checked = validate_asset(self.library.get(project_id, summary.id))
            if checked is not None:
                validations.append(checked)
        speakers = sorted({s.speaker_profile_id for s in segments if s.speaker_profile_id})
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
            rejections=rejections,
            script_validations=validations,
        )

    def compile(self, project_id: str) -> DatasetManifest:
        segments, rejections, selected = self._collect(project_id)
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
            stats=self._stats(segments),
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
    ) -> tuple[list[DatasetSegment], list[DatasetRejection], list[ProjectMediaAsset]]:
        catalog = self.catalogs.get(project_id)
        known_speakers = {speaker.id for speaker in catalog.speakers}
        selected = [
            asset
            for asset in self.library.list(project_id)
            if asset.training_selected and not getattr(asset, "deleted_at", None)
        ]

        segments: list[DatasetSegment] = []
        rejections: list[DatasetRejection] = []
        project_root = Path(self.projects.get(project_id).project_path)

        for summary in selected:
            asset = self.library.get(project_id, summary.id)
            problem = self._reject(asset, project_root, known_speakers)
            if problem is not None:
                rejections.append(problem)
                continue
            produced = self._segments_for(asset)
            if not produced:
                rejections.append(
                    DatasetRejection(
                        asset_id=asset.id,
                        asset_name=asset.name,
                        reason="no-usable-segment",
                        detail=f"Không cắt được đoạn nào trong {SEGMENT_MIN_SECONDS}-{SEGMENT_MAX_SECONDS}s.",
                    )
                )
                continue
            segments.extend(produced)

        return segments, rejections, selected

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

        # More than one speaker in one file is only usable when every spoken word
        # says whose it is. Guessing would put one person's voice in another
        # person's model, which no later step can detect or undo.
        if len(speakers) > 1:
            words = asset.words or []
            unowned = [word for word in words if not word.get("speakerId")]
            if not words or unowned:
                return refuse(
                    "mixed-speaker-unresolved",
                    f"{len(unowned) or 'Mọi'} từ chưa gán người nói trong footage nhiều người.",
                )
        if asset.capture_tier != "guided" and not (asset.words or []):
            return refuse("no-word-timing", "Chưa có word timing để cắt đoạn.")
        return None

    # ---------- segmentation ----------

    def _segments_for(self, asset: ProjectMediaAsset) -> list[DatasetSegment]:
        if asset.capture_tier == "guided":
            return self._guided_segment(asset)
        return self._segments_from_words(asset)

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

    def _segments_from_words(self, asset: ProjectMediaAsset) -> list[DatasetSegment]:
        words = [word for word in (asset.words or []) if self._usable(word)]
        if not words:
            return []

        default_speaker = (asset.speaker_profile_ids or [None])[0]
        groups: list[list[dict[str, Any]]] = []
        current: list[dict[str, Any]] = []

        for word in words:
            if current:
                previous = current[-1]
                gap = float(word["start"]) - float(previous["end"])
                would_run = float(word["end"]) - float(current[0]["start"])
                # A segment may not cross a speaker or an emotion change: the
                # label describes the whole segment, so a mixed one is mislabelled
                # whichever value it takes.
                changed = (
                    word.get("speakerId") != previous.get("speakerId")
                    or word.get("emotion") != previous.get("emotion")
                )
                if changed or gap >= BOUNDARY_GAP_SECONDS or would_run > SEGMENT_MAX_SECONDS:
                    groups.append(current)
                    current = []
            current.append(word)
        if current:
            groups.append(current)

        segments: list[DatasetSegment] = []
        for group in self._merge_short(groups):
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
                    speaker_id=group[0].get("speakerId") or default_speaker,
                    emotion=group[0].get("emotion") or self._asset_emotion(asset),
                    provenance="user" if asset.revisions and asset.revisions[-1].source == "user" else "stt",
                )
            )
        return segments

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
    def _merge_short(groups: list[list[dict[str, Any]]]) -> list[list[dict[str, Any]]]:
        """Join a too-short group to the next while the pair still fits."""
        merged: list[list[dict[str, Any]]] = []
        for group in groups:
            if merged:
                previous = merged[-1]
                previous_length = float(previous[-1]["end"]) - float(previous[0]["start"])
                combined = float(group[-1]["end"]) - float(previous[0]["start"])
                same_owner = previous[-1].get("speakerId") == group[0].get("speakerId")
                same_mood = previous[-1].get("emotion") == group[0].get("emotion")
                if (
                    previous_length < SEGMENT_MIN_SECONDS
                    and combined <= SEGMENT_MAX_SECONDS
                    and same_owner
                    and same_mood
                ):
                    merged[-1] = previous + group
                    continue
            merged.append(group)
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
        # OmniVoice's data config requires a dev list, and a small project can
        # hash entirely into train. Promote one deterministically rather than
        # letting the run fail at launch.
        if len(assigned) > 1 and not any(segment.split == "dev" for segment in assigned):
            chosen = max(assigned, key=lambda segment: hashlib.sha256(segment.id.encode()).hexdigest())
            assigned = [
                segment.model_copy(update={"split": "dev"}) if segment.id == chosen.id else segment
                for segment in assigned
            ]
        return assigned

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
