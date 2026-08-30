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
MediaTranscriptionStatus = Literal[
    "queued", "processing", "reviewing", "complete", "skipped", "not-applicable", "error"
]
MediaDiarizationStatus = Literal["idle", "queued", "processing", "complete", "requires-setup", "error"]
AIReviewStatus = Literal["pending", "complete", "skipped", "error"]
WordTimingQuality = Literal["unverified", "source", "partial", "needs-alignment"]
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


class MediaRevision(DomainModel):
    id: str = Field(default_factory=lambda: f"rev-{uuid4().hex[:12]}")
    source: MediaRevisionSource
    text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TimelineEditRange(DomainModel):
    id: str = Field(default_factory=lambda: f"cut-{uuid4().hex[:12]}")
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class TimelineGainKeyframe(DomainModel):
    id: str = Field(default_factory=lambda: f"gain-{uuid4().hex[:12]}")
    time: float = Field(ge=0)
    gain_db: float = Field(ge=-96, le=96)
    source: Literal["auto-calibration", "manual"] = "auto-calibration"


class MediaAssetCreate(DomainModel):
    name: str = Field(min_length=1, max_length=512)
    source_extension: str = Field(max_length=20)
    media_kind: MediaKind
    source_path: str
    analysis_path: str | None = None
    has_external_source: bool = False
    local_cache_enabled: bool = False
    local_cache_updated_at: datetime | None = None
    removed_ranges: list[TimelineEditRange] = Field(default_factory=list)
    gain_keyframes: list[TimelineGainKeyframe] = Field(default_factory=list)
    studio_item_id: str | None = None
    url: str | None = None
    duration: float = Field(default=0, ge=0)
    sample_rate: int | None = Field(default=None, ge=1)
    audio_codec: str | None = None
    video_codec: str | None = None
    text: str = ""
    words: list[dict[str, Any]] = Field(default_factory=list)
    word_timing_quality: WordTimingQuality = "unverified"
    word_timing_note: str | None = Field(default=None, max_length=500)
    word_timing_trust_version: int = Field(default=0, ge=0)
    origin: MediaOrigin
    status: MediaStatus = "ready"
    transcription_status: MediaTranscriptionStatus = "complete"
    transcription_selected: bool = False
    transcription_progress: float = Field(default=0, ge=0, le=100)
    transcription_error: str | None = Field(default=None, max_length=2000)
    diarization_status: MediaDiarizationStatus = "idle"
    diarization_progress: float = Field(default=0, ge=0, le=100)
    diarization_error: str | None = Field(default=None, max_length=2000)
    diarization_speaker_assignments: dict[str, str | None] = Field(default_factory=dict)
    ai_review_status: AIReviewStatus = "skipped"
    training_selected: bool = False
    speaker_profile_ids: list[str] = Field(default_factory=list)
    environment_profile_ids: list[str] = Field(default_factory=list)
    emotion: EmotionLabel = "normal"


class ProjectMediaAsset(MediaAssetCreate):
    id: str
    created_at: datetime
    updated_at: datetime
    revisions: list[MediaRevision] = Field(default_factory=list)

    @classmethod
    def create(cls, asset_id: str, payload: MediaAssetCreate) -> "ProjectMediaAsset":
        now = datetime.now(timezone.utc)
        initial_source: MediaRevisionSource = (
            "record"
            if payload.origin == "record" and payload.transcription_status in {"queued", "processing"}
            else "stt"
        )
        revisions = [MediaRevision(source=initial_source, text=payload.text)] if payload.text else []
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


class MediaTranscriptReviewResult(DomainModel):
    asset: ProjectMediaAsset
    reviewed_text: str
    status: AIReviewStatus
    error: str | None = None


class MediaTimelineEditsUpdate(DomainModel):
    removed_ranges: list[TimelineEditRange] = Field(default_factory=list)
    gain_keyframes: list[TimelineGainKeyframe] = Field(default_factory=list)


class MediaTrainingSelection(DomainModel):
    selected: bool


class MediaTranscriptionSelection(DomainModel):
    selected: bool


class MediaTranscriptionEnqueue(DomainModel):
    asset_ids: list[str] = Field(min_length=1, max_length=500)
    model: str = Field(default="large-v3", max_length=80)


class MediaTranscriptionProgress(DomainModel):
    id: str
    transcription_status: MediaTranscriptionStatus
    transcription_progress: float = Field(ge=0, le=100)
    transcription_error: str | None = None


class MediaDiarizationEnqueue(DomainModel):
    expected_speakers: int | None = Field(default=None, ge=1, le=8)


class MediaDiarizationAssignmentsUpdate(DomainModel):
    assignments: dict[str, str | None] = Field(default_factory=dict)


class MediaDiarizationProgress(DomainModel):
    id: str
    diarization_status: MediaDiarizationStatus
    diarization_progress: float = Field(ge=0, le=100)
    diarization_error: str | None = None


class MediaAnnotationUpdate(DomainModel):
    speaker_profile_ids: list[str] = Field(default_factory=list)
    environment_profile_ids: list[str] = Field(default_factory=list)
    emotion: EmotionLabel = "normal"


class SpeakerProfile(DomainModel):
    id: str = Field(default_factory=lambda: f"speaker-{uuid4().hex[:12]}")
    name: str = Field(min_length=1, max_length=120)
    language: str | None = Field(default=None, max_length=120)
    language_id: str | None = Field(default=None, max_length=32)
    region: str | None = Field(default=None, max_length=120)
    age: str | None = Field(default=None, max_length=80)
    gender: str = Field(default="unspecified", max_length=80)
    attributes: dict[str, str] = Field(default_factory=dict)
    color: str = Field(default="#ff6745", pattern=r"^#[0-9a-fA-F]{6}$")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EnvironmentNoiseProfile(DomainModel):
    id: str = Field(default_factory=lambda: f"noise-{uuid4().hex[:12]}")
    name: str = Field(min_length=1, max_length=120)
    asset_ids: list[str] = Field(default_factory=list)
    attributes: dict[str, str] = Field(default_factory=dict)
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


class LocalMediaImport(DomainModel):
    source_path: str = Field(min_length=1, max_length=4096)
    cache_local: bool = True


class LocalMediaCacheUpdate(DomainModel):
    enabled: bool


class MediaImportResult(DomainModel):
    asset: ProjectMediaAsset
    item: dict[str, Any] | None = None
    elapsed: float


class ProfileChoice(DomainModel):
    id: str
    label: str
    hint: str | None = None


class ProfileFacet(DomainModel):
    id: str
    label: str
    options: list[ProfileChoice] = Field(default_factory=list)
    hint: str | None = None


class EngineProfileSchema(DomainModel):
    engine_id: str
    engine_name: str
    languages: list[ProfileChoice] = Field(default_factory=list)
    facets: list[ProfileFacet] = Field(default_factory=list)


class AIReviewPreferences(DomainModel):
    enabled: bool = False
    base_url: str = Field(default="", max_length=1024)
    model: str = Field(default="", max_length=256)
    api_key: str | None = Field(default=None, max_length=4096)
    api_key_configured: bool = False


class DiarizationPreferences(DomainModel):
    enabled: bool = True
    model: str = Field(default="pyannote/speaker-diarization-community-1", max_length=256)
    huggingface_token: str | None = Field(default=None, max_length=4096)
    huggingface_token_configured: bool = False


class EmotionStylePreferences(DomainModel):
    color_mode: Literal["gradient", "per-emotion"] = "gradient"
    gradient_start: str = Field(default="#18d9ff", max_length=32)
    gradient_end: str = Field(default="#ff4b52", max_length=32)
    emotion_colors: dict[str, str] = Field(
        default_factory=lambda: {
            "exciting": "#18d9ff", "funny": "#49e886", "good": "#b9ff38",
            "low-energy": "#8ea2ff", "sad": "#7da9e8", "cry": "#bd8de8",
            "angry": "#ff7b35", "critical": "#ff4b52",
        }
    )
    background_enabled: bool = False
    background_color: str = Field(default="#24384b", max_length=32)
    background_opacity: float = Field(default=0.34, ge=0, le=1)


class AppPreferences(DomainModel):
    ai_review: AIReviewPreferences = Field(default_factory=AIReviewPreferences)
    diarization: DiarizationPreferences = Field(default_factory=DiarizationPreferences)
    emotion_style: EmotionStylePreferences = Field(default_factory=EmotionStylePreferences)


class SystemPaths(DomainModel):
    default_project_location: str


class SystemMetrics(DomainModel):
    cpu_percent: float = 0
    gpu_percent: float | None = None
    gpu_memory_used_mb: int | None = None
    gpu_memory_total_mb: int | None = None
    memory_percent: float = 0
    memory_used_mb: int = 0
    memory_total_mb: int = 0
    network_mbps: float = 0
    sampled_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SystemLog(DomainModel):
    files: list[str] = Field(default_factory=list)
    text: str = ""


class FolderPickRequest(DomainModel):
    initial_path: str | None = None


class FolderPickResult(DomainModel):
    path: str | None = None


class MediaFilePickRequest(DomainModel):
    initial_path: str | None = None


class MediaFilePickResult(DomainModel):
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
