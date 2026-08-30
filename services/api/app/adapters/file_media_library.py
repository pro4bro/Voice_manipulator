from __future__ import annotations

import json
import shutil
import threading
from difflib import SequenceMatcher
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.adapters.media_index_store import MediaIndexStore
from app.adapters.project_activity_log import ProjectActivityLog
from app.adapters.word_timing_quality import (
    WORD_TIMING_TRUST_VERSION,
    reconcile_word_timing_quality,
)
from app.domain.models import (
    AIReviewStatus,
    EmotionLabel,
    MediaAssetCreate,
    MediaDiarizationProgress,
    MediaRevision,
    MediaRevisionSource,
    MediaTranscriptionStatus,
    MediaTranscriptionProgress,
    ProjectMediaAsset,
    TimelineEditRange,
    TimelineGainKeyframe,
)
from app.domain.ports import ProjectRepository

# Distinguishes "leave words untouched" from "replace words with an empty list".
_KEEP_WORDS: list[dict] = []


class FileMediaLibrary:
    _WORD_ANNOTATION_KEYS = {
        "realtime",
        "accurate",
        "corrected",
        "reviewState",
        "selectedVariant",
        "diarizationSpeakerId",
        "manualDiarizationSpeakerId",
        "speakerId",
        "environmentProfileIds",
        "emotion",
    }

    def __init__(self, projects: ProjectRepository, store: MediaIndexStore | None = None) -> None:
        self.projects = projects
        self.activity = ProjectActivityLog()
        self._store = store or MediaIndexStore()
        # One lock per project. A single global lock made an unrelated project's
        # read wait behind a long write, and serialized the whole API behind the
        # busiest transcript.
        self._locks: dict[str, threading.RLock] = {}
        self._locks_guard = threading.Lock()

    # ---------- reads ----------

    def list(self, project_id: str) -> list[ProjectMediaAsset]:
        with self._lock(project_id):
            return self._load(project_id)

    def get(self, project_id: str, asset_id: str) -> ProjectMediaAsset:
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            for index, asset in enumerate(assets):
                if asset.id == asset_id:
                    words = self._store.read_words(root, project_id, asset_id)
                    asset, words, migrated = self._backfill_word_timing_trust(
                        root, project_id, asset, words
                    )
                    if migrated:
                        assets[index] = asset
                        self._store.write_index(root, project_id, assets)
                    return asset.model_copy(update={"words": words})
        raise KeyError(asset_id)

    def resolve_audio_path(self, project_id: str, asset_id: str) -> Path:
        with self._lock(project_id):
            for asset in self._load(project_id, include_words=False):
                if asset.id != asset_id:
                    continue
                if not asset.analysis_path:
                    raise KeyError(asset_id)
                root = Path(self.projects.get(project_id).project_path).resolve()
                return self._resolved_project_path(root, asset.analysis_path)
        raise KeyError(asset_id)

    # ---------- writes ----------

    def create(
        self, project_id: str, payload: MediaAssetCreate, asset_id: str | None = None
    ) -> ProjectMediaAsset:
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            portable_payload = payload.model_copy(
                update={
                    "source_path": self._portable_path(root, payload.source_path),
                    "analysis_path": self._portable_path(root, payload.analysis_path)
                    if payload.analysis_path
                    else None,
                }
            )
            if portable_payload.words:
                inspection = reconcile_word_timing_quality(
                    portable_payload.word_timing_quality,
                    portable_payload.word_timing_note,
                    portable_payload.words,
                    portable_payload.duration,
                )
                portable_payload = portable_payload.model_copy(
                    update={
                        "words": inspection.words,
                        "word_timing_quality": inspection.quality,
                        "word_timing_note": inspection.note,
                        "word_timing_trust_version": WORD_TIMING_TRUST_VERSION,
                    }
                )
            asset = ProjectMediaAsset.create(
                asset_id or f"asset-{uuid4().hex[:12]}", portable_payload
            )
            words = list(asset.words)
            assets.insert(0, asset.model_copy(update={"words": []}))
            self._store.write_index(root, project_id, assets)
            self._store.write_words(root, project_id, asset.id, words)
            project = self.projects.get(project_id)
            self.activity.append(
                project.project_path,
                "MEDIA_ADDED",
                f"{asset.origin}: {asset.name}",
                {"assetId": asset.id, "source": asset.source_path, "kind": asset.media_kind},
            )
            return asset.model_copy(update={"words": words})

    def update_script(
        self,
        project_id: str,
        asset_id: str,
        text: str,
        source: MediaRevisionSource,
        words: list[dict] | None = None,
    ) -> ProjectMediaAsset:
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            revisions = list(asset.revisions)
            if not revisions or revisions[-1].text != text or revisions[-1].source != source:
                revisions.append(MediaRevision(source=source, text=text))
            updates: dict[str, Any] = {"text": text, "revisions": revisions}
            next_words = _KEEP_WORDS
            if words is not None:
                inspection = reconcile_word_timing_quality(
                    asset.word_timing_quality,
                    asset.word_timing_note,
                    words,
                    asset.duration,
                    trust_version=asset.word_timing_trust_version,
                )
                next_words = inspection.words
                updates["word_timing_quality"] = inspection.quality
                updates["word_timing_note"] = inspection.note
                updates["word_timing_trust_version"] = WORD_TIMING_TRUST_VERSION
            return self._update_asset(
                project_id,
                asset_id,
                updates,
                words=next_words,
                event="SCRIPT_REVISED",
                details={"assetId": asset_id, "source": source, "revisionCount": len(revisions)},
                activity_message=f"Transcript revision cho {asset.name}",
            )

    def append_ai_review(
        self,
        project_id: str,
        asset_id: str,
        text: str,
        status: AIReviewStatus,
        error: str | None = None,
    ) -> ProjectMediaAsset:
        """Persist an AI candidate as a revision without replacing the user-visible STT transcript."""
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            revisions = list(asset.revisions)
            if status == "complete" and text and (
                not revisions or revisions[-1].text != text or revisions[-1].source != "ai"
            ):
                revisions.append(MediaRevision(source="ai", text=text))
            return self._update_asset(
                project_id,
                asset_id,
                {"revisions": revisions, "ai_review_status": status, "transcription_error": error},
                event="AI_REVIEW_COMPLETED" if status == "complete" else "AI_REVIEW_FAILED",
                details={"status": status, "hasChanges": text != asset.text, "error": error},
            )

    def apply_transcription(
        self,
        project_id: str,
        asset_id: str,
        item: dict,
        fallback_duration: float,
    ) -> ProjectMediaAsset:
        text = str(item.get("text", ""))
        words = list(item.get("words", []))
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            previous_words = self._store.read_words(
                self._project_root(project_id), project_id, asset_id
            )
            revisions = list(asset.revisions)
            if text and (
                not revisions or revisions[-1].text != text or revisions[-1].source != "stt"
            ):
                revisions.append(MediaRevision(source="stt", text=text))
            duration = float(item.get("duration") or fallback_duration)
            annotated = self._carry_word_annotations(previous_words, words)
            inspection = reconcile_word_timing_quality(
                str(item.get("word_timing_quality", "unverified")),
                item.get("word_timing_note"),
                annotated,
                duration,
            )
            return self._update_asset(
                project_id,
                asset_id,
                {
                    "studio_item_id": str(item.get("id", "")) or None,
                    "duration": duration,
                    "sample_rate": int(item.get("sample_rate") or asset.sample_rate or 24000),
                    "text": text,
                    "word_timing_quality": inspection.quality,
                    "word_timing_note": inspection.note,
                    "word_timing_trust_version": WORD_TIMING_TRUST_VERSION,
                    "revisions": revisions,
                    "transcription_status": "reviewing",
                    "transcription_progress": 99.9,
                    "transcription_error": None,
                    "ai_review_status": "pending",
                },
                words=inspection.words,
                event="STT_COMPLETED",
                details={"wordCount": len(inspection.words)},
            )

    def apply_diarization(
        self, project_id: str, asset_id: str, words: list[dict]
    ) -> ProjectMediaAsset:
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            inspection = reconcile_word_timing_quality(
                asset.word_timing_quality,
                asset.word_timing_note,
                words,
                asset.duration,
                trust_version=asset.word_timing_trust_version,
            )
            return self._update_asset(
                project_id,
                asset_id,
                {
                    "diarization_status": "complete",
                    "diarization_progress": 100,
                    "diarization_error": None,
                    "word_timing_quality": inspection.quality,
                    "word_timing_note": inspection.note,
                    "word_timing_trust_version": WORD_TIMING_TRUST_VERSION,
                },
                words=inspection.words,
                event="DIARIZATION_COMPLETED",
                details={"wordCount": len(inspection.words)},
            )

    def update_diarization_assignments(
        self,
        project_id: str,
        asset_id: str,
        assignments: dict[str, str | None],
    ) -> ProjectMediaAsset:
        """Persist the initial Speaker N -> profile mapping without losing raw diarization labels."""
        normalized = {
            str(label).strip(): (str(profile_id).strip() if profile_id else None)
            for label, profile_id in assignments.items()
            if str(label).strip()
        }
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            mapped_words: list[dict] = []
            for raw_word in self._store.read_words(
                self._project_root(project_id), project_id, asset_id
            ):
                word = dict(raw_word)
                label = str(word.get("diarizationSpeakerId") or "").strip()
                if label in normalized:
                    word["speakerId"] = normalized[label]
                    word.pop("manualDiarizationSpeakerId", None)
                mapped_words.append(word)
            merged = dict(asset.diarization_speaker_assignments)
            merged.update(normalized)
            profile_ids = list(
                dict.fromkeys(
                    [
                        *asset.speaker_profile_ids,
                        *[profile_id for profile_id in normalized.values() if profile_id],
                    ]
                )
            )
            return self._update_asset(
                project_id,
                asset_id,
                {
                    "diarization_speaker_assignments": merged,
                    "speaker_profile_ids": profile_ids,
                },
                words=mapped_words,
                event="DIARIZATION_SPEAKER_ASSIGNMENTS_CHANGED",
                details={"assignments": normalized, "speakerCount": len(merged)},
            )

    def update_timeline_edits(
        self,
        project_id: str,
        asset_id: str,
        removed_ranges: list[TimelineEditRange],
        gain_keyframes: list[TimelineGainKeyframe] | None = None,
    ) -> ProjectMediaAsset:
        ordered = sorted(removed_ranges, key=lambda item: (item.start, item.end))
        ordered_keyframes = sorted(gain_keyframes or [], key=lambda item: item.time)
        previous_end = -1.0
        for item in ordered:
            if item.end <= item.start:
                raise ValueError("Timeline cut phải có Mark Out lớn hơn Mark In.")
            if item.start < previous_end:
                raise ValueError("Các đoạn đã bỏ không được chồng lên nhau.")
            previous_end = item.end
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            bounded = [
                item.model_copy(
                    update={
                        "start": min(asset.duration, item.start),
                        "end": min(asset.duration, item.end),
                    }
                )
                for item in ordered
                if item.start < asset.duration
            ]
            bounded_keyframes = [
                item.model_copy(update={"time": min(asset.duration, item.time)})
                for item in ordered_keyframes
                if item.time <= asset.duration
            ]
            return self._update_asset(
                project_id,
                asset_id,
                {"removed_ranges": bounded, "gain_keyframes": bounded_keyframes},
                event="TIMELINE_EDITS_CHANGED",
                details={
                    "removedRangeCount": len(bounded),
                    "gainKeyframeCount": len(bounded_keyframes),
                },
            )

    def update_annotations(
        self,
        project_id: str,
        asset_id: str,
        speaker_profile_ids: list[str],
        environment_profile_ids: list[str] | EmotionLabel | None = None,
        emotion: EmotionLabel = "normal",
    ) -> ProjectMediaAsset:
        # Keep the former four-argument call shape compatible while adding environment tags.
        if isinstance(environment_profile_ids, str):
            emotion = environment_profile_ids
            environment_profile_ids = None
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            environments = list(
                dict.fromkeys(
                    asset.environment_profile_ids
                    if environment_profile_ids is None
                    else environment_profile_ids
                )
            )
            return self._update_asset(
                project_id,
                asset_id,
                {
                    "speaker_profile_ids": list(dict.fromkeys(speaker_profile_ids)),
                    "environment_profile_ids": environments,
                    "emotion": emotion,
                },
                event="MEDIA_ANNOTATIONS_CHANGED",
                details={
                    "speakerProfileIds": list(dict.fromkeys(speaker_profile_ids)),
                    "environmentProfileIds": environments,
                    "emotion": emotion,
                },
            )

    def update_local_cache(
        self,
        project_id: str,
        asset_id: str,
        enabled: bool,
        cached_at: datetime | None = None,
    ) -> ProjectMediaAsset:
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            return self._update_asset(
                project_id,
                asset_id,
                {
                    "local_cache_enabled": enabled,
                    "local_cache_updated_at": cached_at
                    if enabled
                    else asset.local_cache_updated_at,
                },
                event="LOCAL_MEDIA_CACHE_UPDATED",
                details={
                    "enabled": enabled,
                    "cachedAt": cached_at.isoformat() if cached_at else None,
                },
            )

    def set_training_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset:
        return self._set_boolean(
            project_id, asset_id, "training_selected", selected,
            "TRAINING_SELECTION_CHANGED", "Voice Training",
        )

    def set_transcription_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset:
        return self._set_boolean(
            project_id, asset_id, "transcription_selected", selected,
            "TRANSCRIPTION_SELECTION_CHANGED", "Speech to Text",
        )

    def remove(self, project_id: str, asset_id: str) -> None:
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            asset = next((item for item in assets if item.id == asset_id), None)
            if not asset:
                raise KeyError(asset_id)
            project_root = Path(self.projects.get(project_id).project_path).resolve()
            source = self._resolved_project_path(project_root, asset.source_path)
            asset_dir = source.parent
            media_root = (project_root / "assets" / "media").resolve()
            if asset_dir == media_root or media_root not in asset_dir.parents:
                raise ValueError("Media asset folder escapes its project folder.")
            if asset_dir.exists():
                shutil.rmtree(asset_dir)
            self._job_snapshot_path(project_id, "transcription", asset_id).unlink(missing_ok=True)
            self._job_snapshot_path(project_id, "diarization", asset_id).unlink(missing_ok=True)
            self._store.forget(project_id, asset_id)
            self._store.write_index(
                root, project_id, [item for item in assets if item.id != asset_id]
            )
            self._append_activity(project_id, "MEDIA_REMOVED", asset, {"assetId": asset.id})

    # ---------- job state ----------

    def set_transcription_state(
        self,
        project_id: str,
        asset_id: str,
        state: MediaTranscriptionStatus,
        *,
        ai_review_status: AIReviewStatus | None = None,
        error: str | None = None,
        progress: float | None = None,
    ) -> ProjectMediaAsset:
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            resolved = self._normalize_progress(
                progress if progress is not None else asset.transcription_progress
            )
            updated = self._update_asset(
                project_id,
                asset_id,
                {
                    "transcription_status": state,
                    "transcription_error": error,
                    "ai_review_status": ai_review_status or asset.ai_review_status,
                    "transcription_progress": resolved,
                },
                event="TRANSCRIPTION_STATE_CHANGED",
                details={
                    "state": state,
                    "progress": resolved,
                    "aiReviewStatus": ai_review_status or asset.ai_review_status,
                    "error": error,
                },
            )
            # The snapshot is published by _update_asset, so every path that moves
            # a job - including apply_transcription and apply_diarization - keeps
            # the UI's view in step.
            return updated

    def set_diarization_state(
        self,
        project_id: str,
        asset_id: str,
        state: str,
        *,
        progress: float | None = None,
        error: str | None = None,
    ) -> ProjectMediaAsset:
        allowed = {"idle", "queued", "processing", "complete", "requires-setup", "error"}
        if state not in allowed:
            raise ValueError("Trạng thái diarization không hợp lệ.")
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            resolved = self._normalize_progress(
                progress if progress is not None else asset.diarization_progress
            )
            updated = self._update_asset(
                project_id,
                asset_id,
                {
                    "diarization_status": state,
                    "diarization_progress": resolved,
                    "diarization_error": error,
                },
                event="DIARIZATION_STATE_CHANGED",
                details={"state": state, "progress": resolved, "error": error},
            )
            return updated

    def set_transcription_progress(
        self, project_id: str, asset_id: str, progress: float
    ) -> None:
        """Persist high-frequency progress without opening the transcript index."""
        self._advance_job_progress(project_id, "transcription", asset_id, progress)

    def set_diarization_progress(self, project_id: str, asset_id: str, progress: float) -> None:
        """Same contract as transcription progress.

        Routing diarization progress through the asset index made every tick
        rewrite the whole project: at a 0.2 second cadence the queue could not
        keep up and held the library lock continuously.
        """
        self._advance_job_progress(project_id, "diarization", asset_id, progress)

    def transcription_progresses(self, project_id: str) -> list[MediaTranscriptionProgress]:
        """Read only tiny job snapshots while the UI is polling STT status."""
        return [
            MediaTranscriptionProgress(
                id=str(payload.get("id")),
                transcription_status=payload.get("status", "processing"),
                transcription_progress=self._normalize_progress(payload.get("progress", 0)),
                transcription_error=payload.get("error"),
            )
            for payload in self._read_job_snapshots(project_id, "transcription")
        ]

    def diarization_progresses(self, project_id: str) -> list[MediaDiarizationProgress]:
        return [
            MediaDiarizationProgress(
                id=str(payload.get("id")),
                diarization_status=payload.get("status", "processing"),
                diarization_progress=self._normalize_progress(payload.get("progress", 0)),
                diarization_error=payload.get("error"),
            )
            for payload in self._read_job_snapshots(project_id, "diarization")
        ]

    # ---------- internals ----------

    def _lock(self, project_id: str) -> threading.RLock:
        with self._locks_guard:
            lock = self._locks.get(project_id)
            if lock is None:
                lock = threading.RLock()
                self._locks[project_id] = lock
            return lock

    def _project_root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path)

    def _load(
        self, project_id: str, *, include_words: bool = True
    ) -> list[ProjectMediaAsset]:
        root = self._project_root(project_id)
        stored = self._store.read_index(root, project_id)
        normalized = [self._normalize_asset(project_id, root, asset) for asset in stored]
        if normalized != stored:
            # Legacy absolute paths are rewritten once, not on every read.
            self._store.write_index(root, project_id, normalized)
        if include_words:
            with_words: list[ProjectMediaAsset] = []
            migrated = False
            for asset in normalized:
                words = self._store.read_words(root, project_id, asset.id)
                asset, words, did_migrate = self._backfill_word_timing_trust(
                    root, project_id, asset, words
                )
                migrated = migrated or did_migrate
                with_words.append(asset.model_copy(update={"words": words}))
            normalized = with_words
            if migrated:
                self._store.write_index(
                    root,
                    project_id,
                    [asset.model_copy(update={"words": []}) for asset in normalized],
                )
        return sorted(normalized, key=lambda asset: asset.created_at, reverse=True)

    def _backfill_word_timing_trust(
        self,
        root: Path,
        project_id: str,
        asset: ProjectMediaAsset,
        words: list[dict],
    ) -> tuple[ProjectMediaAsset, list[dict], bool]:
        """Persist W2 per-word trust once for projects created by older builds."""
        if (
            not words
            or asset.word_timing_trust_version >= WORD_TIMING_TRUST_VERSION
        ):
            return asset, words, False
        inspection = reconcile_word_timing_quality(
            asset.word_timing_quality,
            asset.word_timing_note,
            words,
            asset.duration,
        )
        self._store.write_words(root, project_id, asset.id, inspection.words)
        return (
            asset.model_copy(
                update={
                    "word_timing_quality": inspection.quality,
                    "word_timing_note": inspection.note,
                    "word_timing_trust_version": WORD_TIMING_TRUST_VERSION,
                }
            ),
            inspection.words,
            True,
        )

    def _require(self, project_id: str, asset_id: str) -> ProjectMediaAsset:
        for asset in self._load(project_id, include_words=False):
            if asset.id == asset_id:
                return asset
        raise KeyError(asset_id)

    def _update_asset(
        self,
        project_id: str,
        asset_id: str,
        updates: dict[str, Any],
        *,
        words: list[dict] = _KEEP_WORDS,
        event: str | None = None,
        details: dict | None = None,
        activity_message: str | None = None,
    ) -> ProjectMediaAsset:
        """Single read-modify-write path for every asset mutation.

        `words` defaults to a sentinel meaning "leave words.json alone", so a
        status change never rewrites tens of thousands of word records.

        Job snapshots are published here rather than by each caller. The UI polls
        only the snapshot, so a path that moved a job to its terminal state
        without republishing left the job visibly stuck: `apply_diarization` wrote
        `complete` into the index while the snapshot still said `processing`, and
        the progress bar sat at 100% forever.
        """
        root = self._project_root(project_id)
        assets = self._load(project_id, include_words=False)
        for index, asset in enumerate(assets):
            if asset.id != asset_id:
                continue
            updated = asset.model_copy(
                update={**updates, "updated_at": datetime.now(timezone.utc)}
            )
            assets[index] = updated
            self._store.write_index(root, project_id, assets)
            if words is not _KEEP_WORDS:
                self._store.write_words(root, project_id, asset_id, words)
            self._publish_job_snapshots(project_id, asset_id, updates, updated)
            if event:
                project = self.projects.get(project_id)
                self.activity.append(
                    project.project_path,
                    event,
                    activity_message or asset.name,
                    details or {},
                )
            return updated.model_copy(
                update={"words": self._store.read_words(root, project_id, asset_id)}
            )
        raise KeyError(asset_id)

    def _set_boolean(
        self,
        project_id: str,
        asset_id: str,
        field: str,
        selected: bool,
        event: str,
        label: str,
    ) -> ProjectMediaAsset:
        with self._lock(project_id):
            return self._update_asset(
                project_id,
                asset_id,
                {field: selected},
                event=event,
                details={"assetId": asset_id, "selected": selected, "target": label},
            )

    @classmethod
    def _carry_word_annotations(
        cls, previous_words: list[dict], new_words: list[dict]
    ) -> list[dict]:
        """Keep human/diarization labels while replacing STT text and timing.

        Equal token runs are exact. A same-length replacement is mapped by
        position so a spelling correction does not discard a reviewed speaker
        or emotion. Insertions/deletions stay unassigned instead of guessing.
        """
        merged = [dict(word) for word in new_words]
        previous_tokens = [
            str(word.get("text") or "").strip().casefold() for word in previous_words
        ]
        new_tokens = [str(word.get("text") or "").strip().casefold() for word in new_words]
        matcher = SequenceMatcher(a=previous_tokens, b=new_tokens, autojunk=False)

        for tag, old_start, old_end, new_start, new_end in matcher.get_opcodes():
            if tag == "equal":
                pairs = zip(range(old_start, old_end), range(new_start, new_end))
            elif tag == "replace" and old_end - old_start == new_end - new_start:
                pairs = zip(range(old_start, old_end), range(new_start, new_end))
            else:
                continue
            for old_index, new_index in pairs:
                previous = previous_words[old_index]
                for key in cls._WORD_ANNOTATION_KEYS:
                    if key in previous:
                        merged[new_index][key] = previous[key]
        return merged

    @staticmethod
    def _normalize_progress(value: float | int | None) -> float:
        try:
            return round(max(0.0, min(100.0, float(value))), 1)
        except (TypeError, ValueError):
            return 0.0

    # A job whose status reaches one of these is no longer polled by the UI, so the
    # snapshot must carry the transition or the job looks stuck forever.
    _JOB_STATUS_FIELDS = {
        "transcription": (
            "transcription_status",
            "transcription_progress",
            "transcription_error",
            {"queued", "processing", "reviewing", "complete", "error"},
        ),
        "diarization": (
            "diarization_status",
            "diarization_progress",
            "diarization_error",
            {"queued", "processing", "complete", "requires-setup", "error"},
        ),
    }

    def _publish_job_snapshots(
        self,
        project_id: str,
        asset_id: str,
        updates: dict[str, Any],
        updated: ProjectMediaAsset,
    ) -> None:
        for kind, (status_field, progress_field, error_field, tracked) in (
            self._JOB_STATUS_FIELDS.items()
        ):
            if status_field not in updates:
                continue
            state = str(getattr(updated, status_field))
            if state not in tracked:
                # Skipped or not-applicable assets have no job to report on.
                self._job_snapshot_path(project_id, kind, asset_id).unlink(missing_ok=True)
                continue
            self._write_job_snapshot(
                project_id,
                kind,
                asset_id,
                state=state,
                progress=getattr(updated, progress_field),
                error=getattr(updated, error_field),
            )

    def _job_snapshot_path(self, project_id: str, kind: str, asset_id: str) -> Path:
        return self._project_root(project_id) / "jobs" / kind / f"{asset_id}.json"

    def _write_job_snapshot(
        self,
        project_id: str,
        kind: str,
        asset_id: str,
        *,
        state: str,
        progress: float | int,
        error: str | None,
    ) -> None:
        path = self._job_snapshot_path(project_id, kind, asset_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "id": asset_id,
            "status": state,
            "progress": self._normalize_progress(progress),
            "error": error,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        temporary.replace(path)

    def _advance_job_progress(
        self, project_id: str, kind: str, asset_id: str, progress: float
    ) -> None:
        path = self._job_snapshot_path(project_id, kind, asset_id)
        if not path.is_file():
            # The asset may have been removed while the background worker was
            # still unwinding. Do not recreate a stale status file.
            return
        try:
            snapshot = self._normalize_snapshot(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, TypeError, ValueError):
            snapshot = {}
        self._write_job_snapshot(
            project_id,
            kind,
            asset_id,
            state=snapshot.get("status", "processing"),
            progress=progress,
            error=snapshot.get("error"),
        )

    def _read_job_snapshots(self, project_id: str, kind: str) -> list[dict]:
        directory = self._project_root(project_id) / "jobs" / kind
        if not directory.is_dir():
            return []
        payloads: list[dict] = []
        for path in sorted(directory.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, TypeError, ValueError):
                continue
            if isinstance(payload, dict) and payload.get("id"):
                payloads.append(self._normalize_snapshot(payload))
        return payloads

    @staticmethod
    def _normalize_snapshot(payload: dict) -> dict:
        """Accept snapshots written before the shared status/progress/error keys."""
        if "status" in payload:
            return payload
        for prefix in ("transcription", "diarization"):
            if f"{prefix}Status" in payload:
                return {
                    **payload,
                    "status": payload.get(f"{prefix}Status"),
                    "progress": payload.get(f"{prefix}Progress", 0),
                    "error": payload.get(f"{prefix}Error"),
                }
        return payload

    def _normalize_asset(
        self, project_id: str, project_root: Path, asset: ProjectMediaAsset
    ) -> ProjectMediaAsset:
        source_path = self._portable_path(project_root, asset.source_path)
        analysis_path = (
            self._portable_path(project_root, asset.analysis_path)
            if asset.analysis_path
            else None
        )
        url = f"/api/projects/{project_id}/media/{asset.id}/audio" if analysis_path else None
        return asset.model_copy(
            update={"source_path": source_path, "analysis_path": analysis_path, "url": url}
        )

    def _append_activity(
        self, project_id: str, event: str, asset: ProjectMediaAsset, details: dict
    ) -> None:
        project = self.projects.get(project_id)
        self.activity.append(project.project_path, event, asset.name, details)

    @classmethod
    def _portable_path(cls, project_root: Path, value: str) -> str:
        """Return the project-relative form of a stored media path.

        Paths this application writes are already relative and contain no parent
        segments, so containment can be decided lexically. That matters because
        `Path.resolve` is a filesystem call: on a mapped network share it measured
        about 100 ms each, and normalizing every asset on every read spent seconds
        in `nt._getfinalpathname` alone.

        Legacy absolute paths still take the resolving branch. Paths are checked
        again with a real resolve in `_resolved_project_path` at the point they are
        opened, which is where a symlink could actually be followed.
        """
        path = Path(value)
        if not path.is_absolute() and not path.drive and ".." not in path.parts:
            return path.as_posix()
        resolved = path.resolve() if path.is_absolute() else (project_root / path).resolve()
        root = project_root.resolve()
        if resolved != root and root not in resolved.parents:
            raise ValueError("Media path must stay inside its project folder.")
        return resolved.relative_to(root).as_posix()

    @staticmethod
    def _resolved_project_path(project_root: Path, value: str) -> Path:
        resolved = (project_root / value).resolve()
        if resolved != project_root and project_root not in resolved.parents:
            raise ValueError("Media path escapes its project folder.")
        return resolved
