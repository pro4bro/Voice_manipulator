from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from .models import (
    Capability,
    EmotionLabel,
    EngineProfileSchema,
    InstalledModel,
    ModelDescriptor,
    Principal,
    EngineStatus,
    MediaAssetCreate,
    MediaRevisionSource,
    TimelineEditRange,
    TimelineGainKeyframe,
    ProjectCreate,
    ProjectMediaAsset,
    ProjectRecord,
    ReadingPack,
    ReadingPackSummary,
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


class ReadingPackLibrary(Protocol):
    def list(self) -> list[ReadingPackSummary]: ...

    def get(self, pack_id: str) -> ReadingPack: ...


# ---------------------------------------------------------------------------
# Phase 07 seams. No adapter satisfies these yet and no route depends on them.
# They exist so that adding model delivery and identity is a new adapter rather
# than a pass over every route. See
# .planning/phases/07-desktop-release/07-01-PLAN.md.
# ---------------------------------------------------------------------------


class ModelCatalog(Protocol):
    """What weights exist for an engine, and where to get them."""

    def available(self, engine: str) -> list[ModelDescriptor]: ...


class ModelStore(Protocol):
    """Machine-local storage for base weights, shared by every project.

    Deliberately not project-owned: a base model is identical bytes for
    everyone, so keeping it in a project would multiply gigabytes per project
    and break the portability contract the moment a project moved.
    """

    def resolve(self, model_id: str) -> Path | None: ...

    def ensure(
        self, model_id: str, on_progress: Callable[[float], None] | None = None
    ) -> Path: ...

    def list_installed(self) -> list[InstalledModel]: ...

    def remove(self, model_id: str) -> None: ...

    def usage(self) -> dict[str, int]: ...


class Authentication(Protocol):
    """Who is calling. The first adapter answers 'the owner' to everything,
    because there is one user; it checks nothing and claims nothing."""

    def identify(self, credentials: str | None) -> Principal: ...


class Authorization(Protocol):
    def allows(self, principal: Principal, capability: Capability) -> bool: ...


class SecretStore(Protocol):
    """API keys and tokens, kept somewhere the file system is not.

    On Windows that means DPAPI, tied to the user account. Preferences currently
    write these into `data/preferences.json` in the clear, which must not survive
    to a shipped build.
    """

    def put(self, name: str, value: str) -> None: ...

    def get(self, name: str) -> str | None: ...

    def forget(self, name: str) -> None: ...
