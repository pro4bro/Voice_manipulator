from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.domain.models import (
    EmotionLabel,
    MediaAssetCreate,
    MediaRevision,
    MediaRevisionSource,
    ProjectMediaAsset,
)
from app.domain.ports import ProjectRepository
from app.adapters.project_activity_log import ProjectActivityLog


class FileMediaLibrary:
    def __init__(self, projects: ProjectRepository) -> None:
        self.projects = projects
        self.activity = ProjectActivityLog()

    def list(self, project_id: str) -> list[ProjectMediaAsset]:
        path = self._index_path(project_id)
        if not path.is_file():
            return []
        try:
            import json

            records = json.loads(path.read_text(encoding="utf-8"))
            assets = [ProjectMediaAsset.model_validate(record) for record in records]
        except (OSError, ValueError, TypeError):
            return []
        normalized = [self._normalize_asset(project_id, asset) for asset in assets]
        if normalized != assets:
            self._write(project_id, normalized)
        assets = normalized
        return sorted(assets, key=lambda asset: asset.created_at, reverse=True)

    def create(
        self, project_id: str, payload: MediaAssetCreate, asset_id: str | None = None
    ) -> ProjectMediaAsset:
        assets = self.list(project_id)
        project_root = Path(self.projects.get(project_id).project_path)
        portable_payload = payload.model_copy(
            update={
                "source_path": self._portable_path(project_root, payload.source_path),
                "analysis_path": self._portable_path(project_root, payload.analysis_path) if payload.analysis_path else None,
            }
        )
        asset = ProjectMediaAsset.create(asset_id or f"asset-{uuid4().hex[:12]}", portable_payload)
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

    def set_training_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset:
        assets = self.list(project_id)
        for index, asset in enumerate(assets):
            if asset.id != asset_id:
                continue
            updated = asset.model_copy(
                update={
                    "training_selected": selected,
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            assets[index] = updated
            self._write(project_id, assets)
            project = self.projects.get(project_id)
            self.activity.append(
                project.project_path,
                "TRAINING_SELECTION_CHANGED",
                f"{'Selected' if selected else 'Removed'} {asset.name} for Voice Training",
                {"assetId": asset.id, "selected": selected},
            )
            return updated
        raise KeyError(asset_id)

    def update_annotations(
        self,
        project_id: str,
        asset_id: str,
        speaker_profile_ids: list[str],
        emotion: EmotionLabel,
    ) -> ProjectMediaAsset:
        assets = self.list(project_id)
        for index, asset in enumerate(assets):
            if asset.id != asset_id:
                continue
            updated = asset.model_copy(
                update={
                    "speaker_profile_ids": list(dict.fromkeys(speaker_profile_ids)),
                    "emotion": emotion,
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            assets[index] = updated
            self._write(project_id, assets)
            project = self.projects.get(project_id)
            self.activity.append(
                project.project_path,
                "MEDIA_ANNOTATIONS_CHANGED",
                f"Updated speaker and emotion labels for {asset.name}",
                {
                    "assetId": asset.id,
                    "speakerProfileIds": updated.speaker_profile_ids,
                    "emotion": updated.emotion,
                },
            )
            return updated
        raise KeyError(asset_id)

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
        analysis_path = self._portable_path(project_root, asset.analysis_path) if asset.analysis_path else None
        url = f"/api/projects/{project_id}/media/{asset.id}/audio" if analysis_path else None
        return asset.model_copy(
            update={"source_path": source_path, "analysis_path": analysis_path, "url": url}
        )

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
