from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.title() for part in tail)


class DomainModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)


WorkspacePage = Literal["speech-to-text", "voice-training", "voice-manipulator"]


class ProjectCreate(DomainModel):
    name: str = Field(min_length=1, max_length=120)
    location: str | None = Field(default=None, max_length=1024)
    language: str | None = None
    accent: str | None = None
    sample_rate: int | None = Field(default=None, ge=8000, le=192000)
    purpose: str | None = None


class ProjectOpen(DomainModel):
    path: str = Field(min_length=1, max_length=1024)


class ProjectRecord(ProjectCreate):
    id: str
    project_path: str = ""
    created_at: datetime
    updated_at: datetime
    last_page: WorkspacePage = "speech-to-text"

    @classmethod
    def create(
        cls, project_id: str, payload: ProjectCreate, project_path: Path
    ) -> "ProjectRecord":
        now = datetime.now(timezone.utc)
        return cls(
            id=project_id,
            project_path=str(project_path),
            created_at=now,
            updated_at=now,
            **payload.model_dump(),
        )


MediaKind = Literal["audio", "video"]
MediaOrigin = Literal["import", "record"]
MediaStatus = Literal["ready", "no-audio", "error"]
MediaTranscriptionStatus = Literal["complete", "skipped", "not-applicable"]
MediaRevisionSource = Literal["stt", "ai", "user", "record", "import"]
EmotionLabel = Literal[
    "exciting",
    "funny",
    "good",
    "normal",
    "low-energy",
    "sad",
    "cry",
    "angry",
    "critical",
    "mix",
]
SpeakerGender = Literal["female", "male", "nonbinary", "unspecified"]


class MediaRevision(DomainModel):
    id: str = Field(default_factory=lambda: f"rev-{uuid4().hex[:12]}")
    source: MediaRevisionSource
    text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MediaAssetCreate(DomainModel):
    name: str = Field(min_length=1, max_length=512)
    source_extension: str = Field(max_length=20)
    media_kind: MediaKind
    source_path: str
    analysis_path: str | None = None
    studio_item_id: str | None = None
    url: str | None = None
    duration: float = Field(default=0, ge=0)
    sample_rate: int | None = Field(default=None, ge=1)
    audio_codec: str | None = None
    video_codec: str | None = None
    text: str = ""
    words: list[dict[str, Any]] = Field(default_factory=list)
    origin: MediaOrigin
    status: MediaStatus = "ready"
    transcription_status: MediaTranscriptionStatus = "complete"
    training_selected: bool = False
    speaker_profile_ids: list[str] = Field(default_factory=list)
    emotion: EmotionLabel = "normal"


class ProjectMediaAsset(MediaAssetCreate):
    id: str
    created_at: datetime
    updated_at: datetime
    revisions: list[MediaRevision] = Field(default_factory=list)

    @classmethod
    def create(cls, asset_id: str, payload: MediaAssetCreate) -> "ProjectMediaAsset":
        now = datetime.now(timezone.utc)
        revisions = [MediaRevision(source="stt", text=payload.text)] if payload.text else []
        return cls(
            id=asset_id,
            created_at=now,
            updated_at=now,
            revisions=revisions,
            **payload.model_dump(),
        )


class MediaScriptUpdate(DomainModel):
    text: str = Field(max_length=500_000)
    source: MediaRevisionSource = "user"
    words: list[dict[str, Any]] | None = None


class MediaTrainingSelection(DomainModel):
    selected: bool


class MediaAnnotationUpdate(DomainModel):
    speaker_profile_ids: list[str] = Field(default_factory=list)
    emotion: EmotionLabel = "normal"


class SpeakerProfile(DomainModel):
    id: str = Field(default_factory=lambda: f"speaker-{uuid4().hex[:12]}")
    name: str = Field(min_length=1, max_length=120)
    language: str | None = Field(default=None, max_length=80)
    region: str | None = Field(default=None, max_length=120)
    age: int | None = Field(default=None, ge=0, le=120)
    gender: SpeakerGender = "unspecified"
    color: str = Field(default="#ff6745", pattern=r"^#[0-9a-fA-F]{6}$")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EnvironmentNoiseProfile(DomainModel):
    id: str = Field(default_factory=lambda: f"noise-{uuid4().hex[:12]}")
    name: str = Field(min_length=1, max_length=120)
    asset_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TrainingSettings(DomainModel):
    target_speaker_ids: list[str] = Field(default_factory=list)
    max_steps: int = Field(default=10_000, ge=1, le=10_000_000)
    checkpoint_every: int = Field(default=1_000, ge=1, le=10_000_000)
    batch_size: int = Field(default=4, ge=1, le=512)
    learning_rate: float = Field(default=0.00002, gt=0, le=1)
    denoise_before_training: bool = True
    learn_environment_noise: bool = False
    environment_profile_id: str | None = None


class TrainingCatalog(DomainModel):
    speakers: list[SpeakerProfile] = Field(default_factory=list)
    environment_profiles: list[EnvironmentNoiseProfile] = Field(default_factory=list)
    settings: TrainingSettings = Field(default_factory=TrainingSettings)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MediaImportResult(DomainModel):
    asset: ProjectMediaAsset
    item: dict[str, Any] | None = None
    elapsed: float


class SystemPaths(DomainModel):
    default_project_location: str


class FolderPickRequest(DomainModel):
    initial_path: str | None = None


class FolderPickResult(DomainModel):
    path: str | None = None


class EngineStatus(DomainModel):
    id: str
    name: str
    path: str
    installed: bool
    revision: str | None = None
    branch: str | None = None
    dirty: bool = False
    capabilities: list[str] = Field(default_factory=list)


class HealthStatus(DomainModel):
    status: str = "ok"
    app: str = "Pro4Bro Voice Manipulator"
    version: str = "0.1.0"
