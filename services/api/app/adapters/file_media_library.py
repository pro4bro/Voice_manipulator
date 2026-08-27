from __future__ import annotations

import json
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.adapters.project_activity_log import ProjectActivityLog
from app.adapters.word_timing_quality import inspect_word_timings
from app.domain.models import (
    AIReviewStatus,
    EmotionLabel,
    MediaAssetCreate,
    MediaRevision,
    MediaRevisionSource,
    MediaTranscriptionStatus,
    MediaTranscriptionProgress,
    ProjectMediaAsset,
    TimelineEditRange,
    TimelineGainKeyframe,
)
from app.domain.ports import ProjectRepository


class FileMediaLibrary:
    def __init__(self, projects: ProjectRepository) -> None:
        self.projects = projects
        self.activity = ProjectActivityLog()
        self._lock = threading.RLock()

    def list(self, project_id: str) -> list[ProjectMediaAsset]:
        with self._lock:
            path = self._index_path(project_id)
            if not path.is_file():
                return []
            try:
                records = json.loads(path.read_text(encoding="utf-8"))
                assets = [ProjectMediaAsset.model_validate(record) for record in records]
            except (OSError, ValueError, TypeError):
                return []
            normalized = [self._normalize_asset(project_id, asset) for asset in assets]
            if normalized != assets:
                self._write(project_id, normalized)
            return sorted(normalized, key=lambda asset: asset.created_at, reverse=True)

    def create(
        self, project_id: str, payload: MediaAssetCreate, asset_id: str | None = None
    ) -> ProjectMediaAsset:
        with self._lock:
            assets = self.list(project_id)
            project_root = Path(self.projects.get(project_id).project_path)
            portable_payload = payload.model_copy(
                update={
                    "source_path": self._portable_path(project_root, payload.source_path),
                    "analysis_path": self._portable_path(project_root, payload.analysis_path)
                    if payload.analysis_path
                    else None,
                }
            )
            asset = ProjectMediaAsset.create(
                asset_id or f"asset-{uuid4().hex[:12]}", portable_payload
            )
            assets.insert(0, asset)
            self._write(project_id, assets)
            project = self.projects.get(project_id)
            self.activity.append(
                project.project_path,
                "MEDIA_ADDED",
                f"{asset.origin}: {asset.name}",
                {"assetId": asset.id, "source": asset.source_path, "kind": asset.media_kind},
            )
            return asset

    def update_script(
        self,
        project_id: str,
        asset_id: str,
        text: str,
        source: MediaRevisionSource,
        words: list[dict] | None = None,
    ) -> ProjectMediaAsset:
        with self._lock:
            assets = self.list(project_id)
            for index, asset in enumerate(assets):
                if asset.id != asset_id:
                    continue
                revisions = list(asset.revisions)
                if not revisions or revisions[-1].text != text or revisions[-1].source != source:
                    revisions.append(MediaRevision(source=source, text=text))
                updated = asset.model_copy(
                    update={
                        "text": text,
                        "words": asset.words if words is None else words,
                        "revisions": revisions,
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                assets[index] = updated
                self._write(project_id, assets)
                project = self.projects.get(project_id)
                self.activity.append(
                    project.project_path,
                    "SCRIPT_REVISED",
                    f"Transcript revision cho {asset.name}",
                    {"assetId": asset.id, "source": source, "revisionCount": len(revisions)},
                )
                return updated
        raise KeyError(asset_id)

    def append_ai_review(
        self,
        project_id: str,
        asset_id: str,
        text: str,
        status: AIReviewStatus,
        error: str | None = None,
    ) -> ProjectMediaAsset:
        """Persist an AI candidate as a revision without replacing the user-visible STT transcript."""
        with self._lock:
            assets = self.list(project_id)
            for index, asset in enumerate(assets):
                if asset.id != asset_id:
                    continue
                revisions = list(asset.revisions)
                if status == "complete" and text and (not revisions or revisions[-1].text != text or revisions[-1].source != "ai"):
                    revisions.append(MediaRevision(source="ai", text=text))
                updated = asset.model_copy(
                    update={
                        "revisions": revisions,
                        "ai_review_status": status,
                        "transcription_error": error,
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                assets[index] = updated
                self._write(project_id, assets)
                self._append_activity(
                    project_id,
                    "AI_REVIEW_COMPLETED" if status == "complete" else "AI_REVIEW_FAILED",
                    asset,
                    {"status": status, "hasChanges": text != asset.text, "error": error},
                )
                return updated
        raise KeyError(asset_id)

    def apply_transcription(
        self,
        project_id: str,
        asset_id: str,
        item: dict,
        fallback_duration: float,
    ) -> ProjectMediaAsset:
        text = str(item.get("text", ""))
        words = list(item.get("words", []))
        with self._lock:
            assets = self.list(project_id)
            for index, asset in enumerate(assets):
                if asset.id != asset_id:
                    continue
                revisions = list(asset.revisions)
                if text and (not revisions or revisions[-1].text != text or revisions[-1].source != "stt"):
                    revisions.append(MediaRevision(source="stt", text=text))
                updated = asset.model_copy(
                    update={
                        "studio_item_id": str(item.get("id", "")) or None,
                        "duration": float(item.get("duration") or fallback_duration),
                        "sample_rate": int(item.get("sample_rate") or asset.sample_rate or 24000),
                        "text": text,
                        "words": words,
                        "word_timing_quality": item.get("word_timing_quality", "unverified"),
                        "word_timing_note": item.get("word_timing_note"),
                        "revisions": revisions,
                        "transcription_status": "reviewing",
                        "transcription_progress": 99.9,
                        "transcription_error": None,
                        "ai_review_status": "pending",
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                assets[index] = updated
                self._write(project_id, assets)
                self._append_activity(project_id, "STT_COMPLETED", asset, {"wordCount": len(words)})
                return updated
        raise KeyError(asset_id)

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
        with self._lock:
            assets = self.list(project_id)
            for index, asset in enumerate(assets):
                if asset.id != asset_id:
                    continue
                updated = asset.model_copy(
                    update={
                        "transcription_status": state,
                        "transcription_error": error,
                        "ai_review_status": ai_review_status or asset.ai_review_status,
                        "transcription_progress": self._normalize_transcription_progress(
                            progress if progress is not None else asset.transcription_progress
                        ),
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                assets[index] = updated
                self._write(project_id, assets)
                if state in {"queued", "processing", "reviewing", "complete", "error"}:
                    self._write_transcription_progress_snapshot(
                        project_id,
                        asset_id,
                        state=state,
                        progress=updated.transcription_progress,
                        error=error,
                    )
                else:
                    self._transcription_progress_path(project_id, asset_id).unlink(missing_ok=True)
                self._append_activity(
                    project_id,
                    "TRANSCRIPTION_STATE_CHANGED",
                    asset,
                    {
                        "state": state,
                        "progress": updated.transcription_progress,
                        "aiReviewStatus": updated.ai_review_status,
                        "error": error,
                    },
                )
                return updated
        raise KeyError(asset_id)

    def set_transcription_progress(
        self, project_id: str, asset_id: str, progress: float
    ) -> None:
        """Persist high-frequency progress without opening the transcript index."""
        with self._lock:
            path = self._transcription_progress_path(project_id, asset_id)
            if not path.is_file():
                # The asset may have been removed while the background worker was
                # still unwinding. Do not recreate a stale status file.
                return
            try:
                snapshot = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                snapshot = {}
            self._write_transcription_progress_snapshot(
                project_id,
                asset_id,
                state=snapshot.get("transcriptionStatus", "processing"),
                progress=progress,
                error=snapshot.get("transcriptionError"),
            )

    def transcription_progresses(
        self, project_id: str
    ) -> list[MediaTranscriptionProgress]:
        """Read only tiny job snapshots while the UI is polling STT status."""
        with self._lock:
            progress_dir = self._transcription_progress_path(project_id, "placeholder").parent
            if not progress_dir.is_dir():
                return []
            snapshots: list[MediaTranscriptionProgress] = []
            for status_path in sorted(progress_dir.glob("*.json")):
                try:
                    payload = json.loads(status_path.read_text(encoding="utf-8"))
                    snapshots.append(MediaTranscriptionProgress.model_validate(payload))
                except (OSError, TypeError, ValueError, json.JSONDecodeError):
                    continue
            return snapshots
    def set_training_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset:
        return self._set_boolean(
            project_id, asset_id, "training_selected", selected, "TRAINING_SELECTION_CHANGED", "Voice Training"
        )

    def set_transcription_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset:
        return self._set_boolean(
            project_id, asset_id, "transcription_selected", selected, "TRANSCRIPTION_SELECTION_CHANGED", "Speech to Text"
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
        with self._lock:
            assets = self.list(project_id)
            for index, asset in enumerate(assets):
                if asset.id != asset_id:
                    continue
                bounded = [
                    item.model_copy(update={"start": min(asset.duration, item.start), "end": min(asset.duration, item.end)})
                    for item in ordered
                    if item.start < asset.duration
                ]
                bounded_keyframes = [
                    item.model_copy(update={"time": min(asset.duration, item.time)})
                    for item in ordered_keyframes
                    if item.time <= asset.duration
                ]
                updated = asset.model_copy(
                    update={
                        "removed_ranges": bounded,
                        "gain_keyframes": bounded_keyframes,
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                assets[index] = updated
                self._write(project_id, assets)
                self._append_activity(
                    project_id,
                    "TIMELINE_EDITS_CHANGED",
                    asset,
                    {"removedRangeCount": len(bounded), "gainKeyframeCount": len(bounded_keyframes)},
                )
                return updated
        raise KeyError(asset_id)
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
        with self._lock:
            assets = self.list(project_id)
            for index, asset in enumerate(assets):
                if asset.id != asset_id:
                    continue
                updated = asset.model_copy(
                    update={
                        "speaker_profile_ids": list(dict.fromkeys(speaker_profile_ids)),
                        "environment_profile_ids": list(
                            dict.fromkeys(
                                asset.environment_profile_ids
                                if environment_profile_ids is None
                                else environment_profile_ids
                            )
                        ),
                        "emotion": emotion,
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                assets[index] = updated
                self._write(project_id, assets)
                self._append_activity(
                    project_id,
                    "MEDIA_ANNOTATIONS_CHANGED",
                    asset,
                    {
                        "speakerProfileIds": updated.speaker_profile_ids,
                        "environmentProfileIds": updated.environment_profile_ids,
                        "emotion": updated.emotion,
                    },
                )
                return updated
        raise KeyError(asset_id)

    def remove(self, project_id: str, asset_id: str) -> None:
        with self._lock:
            assets = self.list(project_id)
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
            self._transcription_progress_path(project_id, asset_id).unlink(missing_ok=True)
            self._write(project_id, [item for item in assets if item.id != asset_id])
            self._append_activity(project_id, "MEDIA_REMOVED", asset, {"assetId": asset.id})

    def get(self, project_id: str, asset_id: str) -> ProjectMediaAsset:
        for asset in self.list(project_id):
            if asset.id == asset_id:
                return asset
        raise KeyError(asset_id)

    def resolve_audio_path(self, project_id: str, asset_id: str) -> Path:
        asset = self.get(project_id, asset_id)
        if not asset.analysis_path:
            raise KeyError(asset_id)
        project_root = Path(self.projects.get(project_id).project_path).resolve()
        return self._resolved_project_path(project_root, asset.analysis_path)

    def update_local_cache(
        self,
        project_id: str,
        asset_id: str,
        enabled: bool,
        cached_at: datetime | None = None,
    ) -> ProjectMediaAsset:
        with self._lock:
            assets = self.list(project_id)
            for index, asset in enumerate(assets):
                if asset.id != asset_id:
                    continue
                updated = asset.model_copy(
                    update={
                        "local_cache_enabled": enabled,
                        "local_cache_updated_at": cached_at if enabled else asset.local_cache_updated_at,
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
                assets[index] = updated
                self._write(project_id, assets)
                self._append_activity(
                    project_id,
                    "LOCAL_MEDIA_CACHE_UPDATED",
                    asset,
                    {
                        "enabled": enabled,
                        "cachedAt": cached_at.isoformat() if cached_at else None,
                    },
                )
                return updated
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
        with self._lock:
            assets = self.list(project_id)
            for index, asset in enumerate(assets):
                if asset.id != asset_id:
                    continue
                updated = asset.model_copy(
                    update={field: selected, "updated_at": datetime.now(timezone.utc)}
                )
                assets[index] = updated
                self._write(project_id, assets)
                self._append_activity(
                    project_id,
                    event,
                    asset,
                    {"assetId": asset.id, "selected": selected, "target": label},
                )
                return updated
        raise KeyError(asset_id)

    @staticmethod
    def _normalize_transcription_progress(value: float | int) -> float:
        try:
            return round(max(0.0, min(100.0, float(value))), 1)
        except (TypeError, ValueError):
            return 0.0

    def _transcription_progress_path(self, project_id: str, asset_id: str) -> Path:
        project = self.projects.get(project_id)
        return Path(project.project_path) / "jobs" / "transcription" / f"{asset_id}.json"
    def _write_transcription_progress_snapshot(
        self,
        project_id: str,
        asset_id: str,
        *,
        state: MediaTranscriptionStatus | str,
        progress: float | int,
        error: str | None,
    ) -> None:
        path = self._transcription_progress_path(project_id, asset_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "id": asset_id,
            "transcriptionStatus": state,
            "transcriptionProgress": self._normalize_transcription_progress(progress),
            "transcriptionError": error,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        temporary.replace(path)
    def _index_path(self, project_id: str) -> Path:
        project = self.projects.get(project_id)
        path = Path(project.project_path) / "assets" / "media" / "index.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _write(self, project_id: str, assets: list[ProjectMediaAsset]) -> None:
        path = self._index_path(project_id)
        serialized = "[\n" + ",\n".join(
            asset.model_dump_json(by_alias=True, indent=2) for asset in assets
        ) + "\n]"
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(serialized, encoding="utf-8")
        temporary.replace(path)

    def _normalize_asset(self, project_id: str, asset: ProjectMediaAsset) -> ProjectMediaAsset:
        project_root = Path(self.projects.get(project_id).project_path).resolve()
        source_path = self._portable_path(project_root, asset.source_path)
        analysis_path = (
            self._portable_path(project_root, asset.analysis_path)
            if asset.analysis_path
            else None
        )
        url = f"/api/projects/{project_id}/media/{asset.id}/audio" if analysis_path else None
        update = {"source_path": source_path, "analysis_path": analysis_path, "url": url}
        if asset.word_timing_quality != "source" and asset.words:
            inspection = inspect_word_timings(asset.words, asset.duration)
            update["words"] = inspection.words
            update["word_timing_quality"] = inspection.quality
            update["word_timing_note"] = inspection.note
        return asset.model_copy(update=update)

    def _append_activity(self, project_id: str, event: str, asset: ProjectMediaAsset, details: dict) -> None:
        project = self.projects.get(project_id)
        self.activity.append(project.project_path, event, asset.name, details)

    @classmethod
    def _portable_path(cls, project_root: Path, value: str) -> str:
        path = Path(value)
        resolved = path.resolve() if path.is_absolute() else (project_root / path).resolve()
        if resolved != project_root and project_root not in resolved.parents:
            raise ValueError("Media path must stay inside its project folder.")
        return resolved.relative_to(project_root).as_posix()

    @staticmethod
    def _resolved_project_path(project_root: Path, value: str) -> Path:
        resolved = (project_root / value).resolve()
        if resolved != project_root and project_root not in resolved.parents:
            raise ValueError("Media path escapes its project folder.")
        return resolved