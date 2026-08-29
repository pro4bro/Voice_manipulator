from __future__ import annotations

from typing import Protocol

from .models import (
    EmotionLabel,
    EngineProfileSchema,
    EngineStatus,
    MediaAssetCreate,
    MediaRevisionSource,
    TimelineEditRange,
    TimelineGainKeyframe,
    ProjectCreate,
    ProjectMediaAsset,
    ProjectRecord,
    TrainingCatalog,
    WorkspacePage,
)


class ProjectRepository(Protocol):
    def list(self) -> list[ProjectRecord]: ...

    def get(self, project_id: str) -> ProjectRecord: ...

    def create(self, payload: ProjectCreate) -> ProjectRecord: ...

    def open(self, path: str) -> ProjectRecord: ...

    def set_last_page(self, project_id: str, page: WorkspacePage) -> ProjectRecord: ...


class VoiceEngine(Protocol):
    def status(self) -> EngineStatus: ...

    def profile_schema(self) -> EngineProfileSchema: ...


class FolderPicker(Protocol):
    def pick(self, initial_path: str | None = None) -> str | None: ...


class MediaLibrary(Protocol):
    def list(self, project_id: str) -> list[ProjectMediaAsset]: ...

    def get(self, project_id: str, asset_id: str) -> ProjectMediaAsset: ...

    def create(
        self, project_id: str, payload: MediaAssetCreate, asset_id: str | None = None
    ) -> ProjectMediaAsset: ...

    def update_script(
        self,
        project_id: str,
        asset_id: str,
        text: str,
        source: MediaRevisionSource,
        words: list[dict] | None = None,
    ) -> ProjectMediaAsset: ...

    def set_training_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset: ...

    def set_transcription_selected(
        self, project_id: str, asset_id: str, selected: bool
    ) -> ProjectMediaAsset: ...

    def update_timeline_edits(
        self,
        project_id: str,
        asset_id: str,
        removed_ranges: list[TimelineEditRange],
        gain_keyframes: list[TimelineGainKeyframe] | None = None,
    ) -> ProjectMediaAsset: ...

    def update_annotations(
        self,
        project_id: str,
        asset_id: str,
        speaker_profile_ids: list[str],
        environment_profile_ids: list[str],
        emotion: EmotionLabel,
    ) -> ProjectMediaAsset: ...

    def update_local_cache(self, project_id: str, asset_id: str, enabled: bool, cached_at = None) -> ProjectMediaAsset: ...

    def set_diarization_state(self, project_id: str, asset_id: str, state: str, *, progress: float | None = None, error: str | None = None) -> ProjectMediaAsset: ...

    def update_diarization_assignments(self, project_id: str, asset_id: str, assignments: dict[str, str | None]) -> ProjectMediaAsset: ...

    def remove(self, project_id: str, asset_id: str) -> None: ...


class TrainingCatalogRepository(Protocol):
    def get(self, project_id: str) -> TrainingCatalog: ...

    def save(self, project_id: str, catalog: TrainingCatalog) -> TrainingCatalog: ...
