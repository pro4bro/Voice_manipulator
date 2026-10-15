from __future__ import annotations

import json
import math
import shutil
import threading
from difflib import SequenceMatcher
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.adapters.media_index_store import MediaIndexStore
from app.adapters.obs_livelink_deletions import mark_recording_deleted
from app.adapters.project_activity_log import ProjectActivityLog
from app.adapters.word_timing_quality import (
    WORD_TIMING_TRUST_VERSION,
    reconcile_word_timing_quality,
    space_recognized_words,
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
from app.domain.media_organization import MediaPoolAssetPlacement, MediaPoolOrganization
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

    def list_metadata(self, project_id: str) -> list[ProjectMediaAsset]:
        """Read Media Pool identities without loading per-word transcript files."""
        with self._lock(project_id):
            return self._load(project_id, include_words=False)

    def organization(self, project_id: str) -> MediaPoolOrganization:
        """Read project-owned folder and order metadata without moving any media."""
        with self._lock(project_id):
            root = self._project_root(project_id)
            path = root / "assets" / "media" / "organization.json"
            if path.is_file():
                try:
                    payload = json.loads(path.read_text(encoding="utf-8"))
                    organization = MediaPoolOrganization.model_validate(payload)
                except (OSError, ValueError, TypeError) as exc:
                    raise ValueError("Media Pool organization file is invalid") from exc
            else:
                organization = MediaPoolOrganization()
            assets = self._load(project_id, include_words=False)
            return self._complete_media_organization(organization, assets)

    def update_organization(
        self, project_id: str, organization: MediaPoolOrganization
    ) -> MediaPoolOrganization:
        """Validate and atomically save the portable Media Pool arrangement."""
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            self._validate_media_organization(organization, assets)
            normalized = self._complete_media_organization(organization, assets)
            self._validate_media_organization(normalized, assets)
            path = root / "assets" / "media" / "organization.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            self._store._write_json(path, normalized.model_dump(by_alias=True, mode="json"), indent=2)
            return normalized

    @staticmethod
    def _complete_media_organization(
        organization: MediaPoolOrganization, assets: list[ProjectMediaAsset]
    ) -> MediaPoolOrganization:
        known = {asset.id for asset in assets}
        placements = [item for item in organization.assets if item.asset_id in known]
        placed = {item.asset_id for item in placements}
        root_order = max((item.order for item in placements if item.folder_id is None), default=-1) + 1
        for asset in assets:
            if asset.id not in placed:
                placements.append(MediaPoolAssetPlacement(asset_id=asset.id, folder_id=None, order=root_order))
                root_order += 1
        return organization.model_copy(update={"assets": placements})

    @staticmethod
    def _validate_media_organization(
        organization: MediaPoolOrganization, assets: list[ProjectMediaAsset]
    ) -> None:
        folders = {folder.id: folder for folder in organization.folders}
        if len(folders) != len(organization.folders):
            raise ValueError("Media Pool folder IDs must be unique")
        if len({item.asset_id for item in organization.assets}) != len(organization.assets):
            raise ValueError("Media Pool asset placements must be unique")
        known_assets = {asset.id for asset in assets}
        if any(item.asset_id not in known_assets for item in organization.assets):
            raise ValueError("Media Pool placement references an unknown asset")
        for folder in organization.folders:
            if folder.parent_folder_id is not None and folder.parent_folder_id not in folders:
                raise ValueError("Media Pool folder parent does not exist")
            visited = {folder.id}
            parent_id = folder.parent_folder_id
            while parent_id is not None:
                if parent_id in visited:
                    raise ValueError("Media Pool folders cannot contain cycles")
                visited.add(parent_id)
                parent_id = folders[parent_id].parent_folder_id
        if any(item.folder_id is not None and item.folder_id not in folders for item in organization.assets):
            raise ValueError("Media Pool placement folder does not exist")

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

    def link_obs_archive_track(self, project_id: str, asset_id: str,
                               parent_asset_id: str, stream_index: int,
                               track_uid: int, analysis_path: str) -> ProjectMediaAsset:
        """Point a LiveLink child at its verified parent; keep only analysis audio locally."""
        with self._lock(project_id):
            parent = self._require(project_id, parent_asset_id)
            if not parent.source_path.endswith(".mka"):
                raise ValueError("OBS parent asset must be an MKA archive")
            root = self._project_root(project_id)
            portable = self._portable_path(root, analysis_path)
            if not self._resolved_project_path(root, portable).is_file():
                raise FileNotFoundError(portable)
            return self._update_asset(project_id, asset_id, {
                "source_path": portable, "analysis_path": portable,
                "source_extension": ".wav", "sample_rate": 24000,
                "source_archive_asset_id": parent_asset_id,
                "source_archive_stream_index": stream_index,
                "source_archive_track_uid": track_uid,
            })

    def refresh_obs_archive_parent(self, project_id: str, asset_id: str,
                                   source_path: str, duration: float,
                                   codec: str) -> ProjectMediaAsset:
        with self._lock(project_id):
            root = self._project_root(project_id)
            portable = self._portable_path(root, source_path)
            if not portable.endswith(".mka") or not self._resolved_project_path(root, portable).is_file():
                raise ValueError("Verified OBS MKA parent is missing")
            return self._update_asset(project_id, asset_id, {
                "source_path": portable, "audio_codec": codec, "duration": duration,
            })

    def refresh_followed_mkv(self, project_id: str, parent_id: str,
                               tracks: dict[str, tuple[str, float]],
                               final_source: str | None = None) -> None:
        """Publish one growing-MKV audio snapshot across parent and children."""
        if not tracks:
            return
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            parent = next((asset for asset in assets if asset.id == parent_id), None)
            if parent is None:
                raise KeyError(parent_id)
            now = datetime.now(timezone.utc)
            first_path = None
            first_stream = None
            maximum = 0.0
            updated = []
            seen: set[str] = set()
            for asset in assets:
                if asset.id not in tracks:
                    updated.append(asset)
                    continue
                if asset.source_archive_asset_id != parent_id:
                    raise ValueError("Growing MKV track does not belong to its parent")
                path, duration = tracks[asset.id]
                portable = self._portable_path(root, path)
                if not self._resolved_project_path(root, portable).is_file():
                    raise FileNotFoundError(portable)
                if (first_stream is None or
                        asset.source_archive_stream_index < first_stream):
                    first_path = portable
                    first_stream = asset.source_archive_stream_index
                maximum = max(maximum, duration)
                seen.add(asset.id)
                updated.append(asset.model_copy(update={
                    "analysis_path": portable, "source_path": portable,
                    "duration": duration, "updated_at": now,
                }))
            if seen != set(tracks):
                raise KeyError(next(iter(set(tracks) - seen)))
            parent_changes = {"analysis_path": first_path, "duration": maximum,
                              "updated_at": now}
            if final_source is not None:
                portable_source = self._portable_path(root, final_source)
                if not self._resolved_project_path(root, portable_source).is_file():
                    raise FileNotFoundError(portable_source)
                parent_changes["source_path"] = portable_source
            updated = [asset.model_copy(update=parent_changes)
                       if asset.id == parent_id else asset for asset in updated]
            self._store.write_index(root, project_id, updated)

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

    def update_live_transcript(
        self, project_id: str, asset_id: str, text: str,
        words: list[dict] | None = None, duration: float | None = None,
    ) -> None:
        """Publish growing STT text and timed words without per-window revisions."""
        with self._lock(project_id):
            asset = self._require(project_id, asset_id)
            if any(revision.source == "user" and revision.text == asset.text
                   for revision in reversed(asset.revisions)):
                return
            if (asset.text == text and asset.transcription_status == "processing"
                    and (words is None or asset.words == words)):
                return
            updates: dict[str, Any] = {
                "text": text, "transcription_status": "processing", "transcription_error": None,
            }
            next_words = _KEEP_WORDS
            if words is not None:
                inspection = reconcile_word_timing_quality(
                    "partial", None, words, duration or asset.duration,
                    trust_version=asset.word_timing_trust_version,
                )
                next_words = inspection.words
                updates.update(word_timing_quality=inspection.quality,
                               word_timing_note=inspection.note,
                               word_timing_trust_version=WORD_TIMING_TRUST_VERSION)
            self._update_asset(
                project_id, asset_id,
                updates, words=next_words,
                event="LIVE_TRANSCRIPT_UPDATED",
                details={"assetId": asset_id, "characters": len(text),
                         "wordCount": len(words) if words is not None else len(asset.words)},
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
        *,
        preserve_user_text: bool = False,
    ) -> ProjectMediaAsset:
        text = str(item.get("text", ""))
        words = space_recognized_words(list(item.get("words", [])))
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
            if preserve_user_text and any(
                revision.source == "user" and revision.text == asset.text
                for revision in reversed(asset.revisions)
            ):
                return self._update_asset(
                    project_id, asset_id,
                    {"duration": duration, "revisions": revisions,
                     "transcription_status": "reviewing", "transcription_progress": 99.9,
                     "transcription_error": None},
                    event="STT_COMPLETED",
                    details={"wordCount": len(words), "preservedUserText": True},
                )
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
        working_range: TimelineEditRange | None = None,
        cut_points: list[float] | None = None,
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
            if working_range and not (0 <= working_range.start < working_range.end <= asset.duration):
                raise ValueError("Vùng làm việc phải có IN < OUT và nằm trong footage.")
            points = sorted(set(cut_points or []))
            if any(not math.isfinite(point) or not 0 < point < asset.duration for point in points):
                raise ValueError("Điểm cut phải nằm bên trong footage.")
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
                {"removed_ranges": bounded, "gain_keyframes": bounded_keyframes,
                 "working_range": working_range, "cut_points": points},
                event="TIMELINE_EDITS_CHANGED",
                details={
                    "removedRangeCount": len(bounded),
                    "gainKeyframeCount": len(bounded_keyframes),
                },
            )

    def update_timeline_cuts_many(
        self,
        project_id: str,
        asset_ids: list[str],
        removed_ranges: list[TimelineEditRange],
    ) -> list[ProjectMediaAsset]:
        """Write one shared cut list for an OBS recording's source stems."""
        if len(asset_ids) != len(set(asset_ids)):
            raise ValueError("Danh sách channel có asset trùng lặp.")
        ordered = sorted(removed_ranges, key=lambda item: (item.start, item.end))
        previous_end = -1.0
        for item in ordered:
            if item.end <= item.start or item.start < previous_end:
                raise ValueError("Các đoạn cắt Timeline phải hợp lệ và không chồng nhau.")
            previous_end = item.end
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            selected = {asset.id: asset for asset in assets if asset.id in asset_ids}
            if len(selected) != len(asset_ids):
                raise KeyError(next(asset_id for asset_id in asset_ids if asset_id not in selected))
            updated_at = datetime.now(timezone.utc)
            updated = {
                asset_id: selected[asset_id].model_copy(update={
                    "removed_ranges": ordered, "updated_at": updated_at,
                }) for asset_id in asset_ids
            }
            self._store.write_index(root, project_id, [updated.get(asset.id, asset) for asset in assets])
            self._append_activity(project_id, "OBS_TIMELINE_CUTS_CHANGED", updated[asset_ids[0]], {
                "assetIds": asset_ids, "removedRangeCount": len(ordered),
            })
            return [updated[asset_id].model_copy(update={
                "words": self._store.read_words(root, project_id, asset_id),
            }) for asset_id in asset_ids]

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

    def set_reference_selected_many(self, project_id: str, asset_ids: list[str], selected: bool) -> list[ProjectMediaAsset]:
        """Role metadata only; validate the whole batch before one atomic write."""
        if len(set(asset_ids)) != len(asset_ids):
            raise ValueError("Reference selection contains duplicate assets.")
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            targets = {asset.id: asset for asset in assets if asset.id in asset_ids}
            if len(targets) != len(asset_ids):
                raise KeyError("Reference footage does not exist.")
            if selected:
                for asset in targets.values():
                    if asset.deleted_at or asset.disabled:
                        raise ValueError("Khôi phục và bật footage trước khi đánh dấu Reference.")
                    if asset.available_audio_tracks:
                        raise ValueError("Chọn một audio track cụ thể của footage nhiều kênh để làm Reference.")
            now = datetime.now(timezone.utc)
            updated = {key: asset.model_copy(update={"reference_selected": selected, "updated_at": now}) for key, asset in targets.items()}
            self._store.write_index(root, project_id, [updated.get(asset.id, asset) for asset in assets])
            return [updated[key] for key in asset_ids]

    def set_import_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset:
        return self._set_boolean(
            project_id, asset_id, "import_selected", selected,
            "IMPORT_SELECTION_CHANGED", "Import",
        )

    def publish_audio_track(self, project_id: str, parent_id: str,
                            payload: MediaAssetCreate, asset_id: str) -> ProjectMediaAsset:
        """Publish the analysis and its parent selection in one index transaction."""
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            parent = next((asset for asset in assets if asset.id == parent_id), None)
            if parent is None:
                raise KeyError(parent_id)
            if parent.deleted_at or parent.disabled:
                raise ValueError("Khôi phục và bật footage trước khi thêm track.")
            stream = payload.source_archive_stream_index
            choice = next((track for track in parent.available_audio_tracks
                           if track.stream_index == stream), None)
            if choice is None or payload.source_archive_asset_id != parent_id:
                raise ValueError("Track không thuộc footage này.")
            existing = next((asset for asset in assets if
                             asset.source_archive_asset_id == parent_id and
                             asset.source_archive_stream_index == stream), None)
            if existing:
                if existing.deleted_at or existing.disabled:
                    raise ValueError("Khôi phục và bật track trước khi Import.")
                return self.set_import_selected(project_id, existing.id, True)
            analysis = self._portable_path(root, payload.analysis_path)
            if not analysis or not (root / analysis).is_file():
                raise ValueError("Chưa có analysis audio để thêm track.")
            child = ProjectMediaAsset.create(asset_id, payload.model_copy(update={
                "source_path": analysis, "analysis_path": analysis,
            }))
            updated = parent.model_copy(update={
                "available_audio_tracks": [track.model_copy(update={"imported": True})
                    if track.stream_index == stream else track
                    for track in parent.available_audio_tracks],
                "updated_at": datetime.now(timezone.utc),
            })
            self._store.write_index(root, project_id,
                [child, *(updated if asset.id == parent_id else asset for asset in assets)])
            return child

    def set_diarization_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset:
        return self._set_boolean(
            project_id, asset_id, "diarization_selected", selected,
            "DIARIZATION_SELECTION_CHANGED", "Speaker Diarization",
        )

    def set_transcription_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset:
        return self._set_boolean(
            project_id, asset_id, "transcription_selected", selected,
            "TRANSCRIPTION_SELECTION_CHANGED", "Speech to Text",
        )

    def set_disabled(self, project_id: str, asset_id: str, disabled: bool) -> ProjectMediaAsset:
        updates: dict[str, Any] = {"disabled": disabled}
        if disabled:
            updates["transcription_selected"] = False
            updates["diarization_selected"] = False
            updates["training_selected"] = False
        return self._update_asset(project_id, asset_id, updates, event="MEDIA_DISABLED" if disabled else "MEDIA_ENABLED")

    def send_to_recycle_bin(self, project_id: str, asset_id: str) -> ProjectMediaAsset:
        """Move footage to the project's recycle bin.

        Nothing is erased and nothing moves on disk: the asset keeps its folder,
        its words and its whole history, so restoring is a single field away and a
        multi-gigabyte take is never copied to be deleted. It does leave every
        work queue, though - transcribing something the user has thrown away
        would burn GPU time on a mistake.
        """
        return self._set_recycled(project_id, asset_id, datetime.now(timezone.utc))

    def restore_from_recycle_bin(self, project_id: str, asset_id: str) -> ProjectMediaAsset:
        return self._set_recycled(project_id, asset_id, None)

    def _set_recycled(self, project_id: str, asset_id: str,
                      deleted_at: datetime | None) -> ProjectMediaAsset:
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            parent = next((item for item in assets if item.id == asset_id), None)
            if parent is None:
                raise KeyError(asset_id)
            group = any(item.source_archive_asset_id == asset_id for item in assets)
            now = datetime.now(timezone.utc)
            updated_parent = None
            for index, asset in enumerate(assets):
                if asset.id != asset_id and not (group and asset.source_archive_asset_id == asset_id):
                    continue
                updates: dict[str, Any] = {"deleted_at": deleted_at, "updated_at": now}
                if deleted_at:
                    updates.update(transcription_selected=False, diarization_selected=False,
                                   training_selected=False)
                updated = asset.model_copy(update=updates)
                assets[index] = updated
                if asset.id == asset_id:
                    updated_parent = updated
            self._store.write_index(root, project_id, assets)
            self.activity.append(
                self.projects.get(project_id).project_path,
                "MEDIA_RECYCLED" if deleted_at else "MEDIA_RESTORED",
                parent.name, {},
            )
            return updated_parent.model_copy(update={
                "words": self._store.read_words(root, project_id, asset_id),
            })

    def remove(self, project_id: str, asset_id: str) -> None:
        with self._lock(project_id):
            root = self._project_root(project_id)
            assets = self._load(project_id, include_words=False)
            asset = next((item for item in assets if item.id == asset_id), None)
            if not asset:
                raise KeyError(asset_id)
            project_root = Path(self.projects.get(project_id).project_path).resolve()
            targets = [asset, *(item for item in assets
                                if item.source_archive_asset_id == asset_id)]
            media_root = (project_root / "assets" / "media").resolve()
            obs_root = (project_root / "assets" / "obs-livelink").resolve()
            folders = []
            for target in targets:
                source = self._resolved_project_path(project_root, target.source_path)
                folder = source.parent
                allowed_root = obs_root if target.id == asset_id and asset.obs_recording_id and asset.source_extension == ".mka" else media_root
                if folder == allowed_root or allowed_root not in folder.parents:
                    raise ValueError("Media asset folder escapes its project folder.")
                folders.append(folder)
            if asset.obs_recording_id and asset.source_extension == ".mka":
                mark_recording_deleted(project_root, asset.obs_recording_id)
            for folder in set(folders):
                if folder.exists():
                    shutil.rmtree(folder)
            for target in targets:
                self._job_snapshot_path(project_id, "transcription", target.id).unlink(missing_ok=True)
                self._job_snapshot_path(project_id, "diarization", target.id).unlink(missing_ok=True)
                self._store.forget(project_id, target.id)
            removed_ids = {target.id for target in targets}
            self._store.write_index(
                root, project_id, [item for item in assets if item.id not in removed_ids]
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
        allowed = {"idle", "queued", "processing", "complete", "requires-setup", "error", "cancelled"}
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
        # Old LiveLink indexes dropped these fields because the model did not
        # declare them. Recover the parent/track relation from the project-owned
        # recording journal once, then persist it in the portable media index.
        by_id = {asset.id: index for index, asset in enumerate(normalized)}
        for index, asset in enumerate(normalized):
            if asset.source_extension != ".mka" or asset.obs_recording_id:
                continue
            parts = Path(asset.source_path).parts
            if len(parts) != 4 or parts[0:2] != ("assets", "obs-livelink") or parts[3] != "source.mka":
                continue
            journal = root / "assets" / "obs-livelink" / parts[2] / "recording.json"
            if not journal.is_file():
                continue
            try:
                payload = json.loads(journal.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            archive = payload.get("recording", {}).get("sourceArchive") or {}
            if archive.get("parentAssetId") != asset.id:
                continue
            normalized[index] = asset.model_copy(update={"obs_recording_id": parts[2]})
            for stem in payload.get("sourceStems", []):
                child_index = by_id.get(stem.get("assetId"))
                if child_index is None:
                    continue
                child = normalized[child_index]
                normalized[child_index] = child.model_copy(update={
                    "obs_recording_id": parts[2],
                    "source_archive_asset_id": asset.id,
                    "source_archive_stream_index": stem.get("streamIndex"),
                    "source_archive_track_uid": stem.get("trackUid"),
                    "deleted_at": asset.deleted_at,
                })
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
