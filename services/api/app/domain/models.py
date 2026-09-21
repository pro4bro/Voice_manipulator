from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.title() for part in tail)


class DomainModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)


WorkspacePage = Literal["dashboard", "speech-to-text", "voice-training", "voice-manipulator", "voice-changer"]


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
# `generate`: audio a voice engine produced in this project, kept in Media Pool
# like any other take so it can be reviewed, cut and reused.
MediaOrigin = Literal["import", "record", "generate"]
# How an asset's audio and transcript came to exist. Provenance, not a quality score.
CaptureTier = Literal["guided", "record", "import"]
MediaStatus = Literal["ready", "no-audio", "error"]
MediaTranscriptionStatus = Literal[
    "queued", "processing", "reviewing", "complete", "skipped", "paused", "not-applicable", "error"
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
    # Parked without being thrown away: still visible and playable, but kept
    # out of every batch so it is not transcribed or trained on by accident.
    disabled: bool = False
    # Set when the footage is in the project's recycle bin. Its files stay where
    # they are so restoring is instant and nothing large has to be copied; what
    # makes it deleted is this timestamp, held in the one index every reader
    # already uses. A second store would be a second source of truth, and that is
    # what once left most of a workspace's projects unopenable.
    deleted_at: datetime | None = None
    capture_tier: CaptureTier = "import"

    @model_validator(mode="before")
    @classmethod
    def _derive_capture_tier(cls, data: Any) -> Any:
        """Assets written before this field existed carry only `origin`.

        Deriving the tier on load keeps every stored index valid without a
        rewrite pass. An explicit tier always wins, which is how a guided take
        stays `guided` even though its origin is `record`.
        """
        if not isinstance(data, dict):
            return data
        if data.get("captureTier") or data.get("capture_tier"):
            return data
        if data.get("origin") == "record":
            return {**data, "capture_tier": "record"}
        return data


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


class MediaTranscriptionControl(DomainModel):
    """Pause, resume or stop a run. No asset ids means the whole project's queue."""

    action: Literal["pause", "resume", "stop"]
    asset_ids: list[str] | None = Field(default=None, max_length=500)


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


class VoiceConsent(DomainModel):
    """The voice owner's permission to wear their voice, as recorded in the app.

    Pro4Bro cannot verify it; what it can do is refuse to convert into a voice
    nobody has vouched for, and keep who vouched, when, and on what basis.
    """

    granted_by: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    confirmed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    # Required before this person's voice can be a Voice Changer target.
    voice_consent: VoiceConsent | None = None
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
    # The option chosen in "Model Training", and only the values the user
    # changed for each option. Unchanged values follow the descriptor, so a
    # corrected recipe reaches projects that never touched that knob.
    model_id: str | None = Field(default=None, max_length=80)
    model_parameters: dict[str, dict[str, Any]] = Field(default_factory=dict)


class TrainingCatalog(DomainModel):
    speakers: list[SpeakerProfile] = Field(default_factory=list)
    environment_profiles: list[EnvironmentNoiseProfile] = Field(default_factory=list)
    settings: TrainingSettings = Field(default_factory=TrainingSettings)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


TrainingParameterKind = Literal["int", "float", "text", "bool", "choice"]


class TrainingParameterChoice(DomainModel):
    value: str | int | float | bool
    label: str


class TrainingParameterSpec(DomainModel):
    """One knob of one training model, as that model's own code names it.

    `key` is the upstream name - the config key or CLI flag the trainer reads -
    so a runner can pass the value through without a translation table. The
    three values are kept apart on purpose, because they disagree more often
    than not:

      default       what Pro4Bro fills in;
      recipe        what the model authors' published command or config uses;
      code_default  what the trainer does when the flag is left out.
    """

    key: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.\-]+$")
    label: str = Field(min_length=1, max_length=120)
    group: str = "Chung"
    kind: TrainingParameterKind
    default: Any = None
    recipe: Any = None
    code_default: Any = None
    source: str | None = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[TrainingParameterChoice] = Field(default_factory=list)
    unit: str | None = None
    help: str | None = None
    nullable: bool = False
    editable: bool = True
    advanced: bool = False
    # A field of TrainingRunConfig this value also fills, so run records keep
    # showing steps, learning rate and the rest whatever model produced them.
    run_field: str | None = None

    @model_validator(mode="after")
    def _default_fits(self) -> "TrainingParameterSpec":
        from app.domain.training_parameters import coerce_parameter

        if self.kind == "choice" and not self.options:
            raise ValueError(f"Choice parameter '{self.key}' has no options.")
        coerce_parameter(self, self.default)
        return self


class TrainingModelRepository(DomainModel):
    # A named root the API knows ("omnivoice", "vibevoice"), so a descriptor
    # never carries a path that only exists on the machine that wrote it.
    root: str = Field(min_length=1, max_length=60)
    path: str = "."
    entrypoint: str = Field(min_length=1, max_length=400)
    recipe: str | None = None
    url: str | None = None
    revision: str | None = None


class TrainingModelRequirement(DomainModel):
    """A file or folder an option cannot run without, such as downloaded weights."""

    root: str = Field(min_length=1, max_length=60)
    path: str = Field(min_length=1, max_length=400)
    label: str | None = None


class TrainingModelDescriptor(DomainModel):
    """A training option described by a JSON file, not by code.

    Adding a model or a repository is adding one descriptor under
    `app/resources/training-models` (shipped) or `<data>/training-models`
    (this machine only). The UI draws its parameters from the descriptor, so
    nothing in the web app has to change for a new option to show up.
    """

    schema_version: Literal[1] = 1
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9][a-z0-9\-.]*$")
    label: str = Field(min_length=1, max_length=120)
    family: str = Field(min_length=1, max_length=60)
    engine: str = Field(min_length=1, max_length=60)
    mode: str = Field(min_length=1, max_length=60)
    description: str = ""
    order: int = 100
    # How the option makes a voice: `clone` imitates a reference clip with no
    # training, `train` changes weights. The Train page separates the two.
    category: Literal["clone", "train"] = "train"
    # Whether Pro4Bro has an adapter that actually runs this option. A
    # descriptor may describe a model before its runner exists.
    runnable: bool = False
    blocked_reason: str | None = None
    repository: TrainingModelRepository
    requires: list[TrainingModelRequirement] = Field(default_factory=list)
    data_format: str | None = None
    notes: list[str] = Field(default_factory=list)
    parameters: list[TrainingParameterSpec] = Field(default_factory=list)

    @model_validator(mode="after")
    def _unique_keys(self) -> "TrainingModelDescriptor":
        keys = [parameter.key for parameter in self.parameters]
        duplicates = sorted({key for key in keys if keys.count(key) > 1})
        if duplicates:
            raise ValueError(f"Duplicate parameter keys: {', '.join(duplicates)}")
        return self


class TrainingModelOption(TrainingModelDescriptor):
    """A descriptor plus what this machine says about it."""

    origin: Literal["shipped", "local"] = "shipped"
    installed: bool = False
    available: bool = False
    status: str = ""


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


class SpeakerSimilarityPreferences(DomainModel):
    embedder_id: Literal["pyannote-community-1", "wespeaker-resnet34-lm"] = "pyannote-community-1"


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
    speaker_similarity: SpeakerSimilarityPreferences = Field(default_factory=SpeakerSimilarityPreferences)
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


ReadingPassageKind = Literal["coverage", "drill", "emotion"]


class ReadingCard(DomainModel):
    """One utterance intended to be read in a single breath."""

    id: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=2000)
    tags: list[str] = Field(default_factory=list)
    word_count: int = Field(default=0, ge=0)
    estimated_seconds: float = Field(default=0, ge=0)


class ReadingPassage(DomainModel):
    id: str = Field(min_length=1, max_length=120)
    kind: ReadingPassageKind
    emotion: EmotionLabel
    title: str = Field(min_length=1, max_length=200)
    direction: str = Field(default="", max_length=2000)
    # Who the passage suits, for filtering the library. Multi-valued, because one
    # passage serves several regions at once, and an empty list means no
    # restriction rather than no audience - a passage nobody may read is useless.
    regions: list[str] = Field(default_factory=list, max_length=40)
    genders: list[str] = Field(default_factory=list, max_length=8)
    age_ranges: list[str] = Field(default_factory=list, max_length=12)
    # Shipped packs are read-only application resources; authored ones live in
    # machine-local data and are what the authoring dialog writes.
    source: Literal["shipped", "authored"] = "shipped"
    cards: list[ReadingCard] = Field(default_factory=list)
    word_count: int = Field(default=0, ge=0)
    estimated_seconds: float = Field(default=0, ge=0)


class ReadingCardDraft(DomainModel):
    text: str = Field(min_length=1, max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=20)


class ReadingPassageDraft(DomainModel):
    """What the authoring dialog submits. Ids and counts are the server's to assign."""

    language: str = Field(min_length=1, max_length=20)
    language_name: str = Field(default="", max_length=120)
    kind: ReadingPassageKind = "emotion"
    emotion: EmotionLabel
    title: str = Field(min_length=1, max_length=200)
    direction: str = Field(default="", max_length=2000)
    regions: list[str] = Field(default_factory=list, max_length=40)
    genders: list[str] = Field(default_factory=list, max_length=8)
    age_ranges: list[str] = Field(default_factory=list, max_length=12)
    cards: list[ReadingCardDraft] = Field(min_length=1, max_length=400)


class ReadingAudienceOption(DomainModel):
    id: str
    label: str


class ReadingAudienceVocabulary(DomainModel):
    """Tag choices for the authoring dialog, so it never hardcodes a list."""

    genders: list[ReadingAudienceOption] = Field(default_factory=list)
    age_ranges: list[ReadingAudienceOption] = Field(default_factory=list)
    regions_by_language: dict[str, list[ReadingAudienceOption]] = Field(default_factory=dict)


class ReadingPackSummary(DomainModel):
    """Enough to choose a pack without loading every card."""

    pack_id: str = Field(min_length=1, max_length=120)
    language: str = Field(min_length=1, max_length=20)
    language_name: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    version: int = Field(ge=1)
    license: str = Field(default="", max_length=120)
    passage_count: int = Field(default=0, ge=0)
    card_count: int = Field(default=0, ge=0)
    word_count: int = Field(default=0, ge=0)
    estimated_seconds: float = Field(default=0, ge=0)
    emotions: list[EmotionLabel] = Field(default_factory=list)


class ReadingPack(ReadingPackSummary):
    passages: list[ReadingPassage] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Seams for Phase 07. Defined so the vocabulary is settled while the decisions
# are fresh; no adapter implements these yet, and no route depends on them.
# See .planning/phases/07-desktop-release/07-01-PLAN.md.
# ---------------------------------------------------------------------------

ModelKind = Literal["base", "adapter", "tokenizer", "recognizer", "diarizer"]


class ModelDescriptor(DomainModel):
    """One downloadable weight set.

    `sha256` is not optional in spirit: a truncated multi-gigabyte file that
    loads and produces noise is worse than one that refuses to load, so the
    store verifies before first use rather than after download.
    """

    id: str = Field(min_length=1, max_length=200)
    kind: ModelKind
    engine: str = Field(min_length=1, max_length=60)
    version: str = Field(default="", max_length=60)
    bytes: int = Field(default=0, ge=0)
    sha256: str = Field(default="", max_length=64)
    source: str = Field(default="", max_length=500)
    licence: str = Field(default="", max_length=200)


class InstalledModel(DomainModel):
    descriptor: ModelDescriptor
    path: str
    installed_at: datetime
    verified: bool = False


Role = Literal["owner", "admin", "moderator", "staff", "viewer"]

Capability = Literal[
    "read_project",
    "write_project",
    "author_library",
    "run_training",
    "export_voice_model",
    "manage_users",
]


class Principal(DomainModel):
    """Who is acting. Today there is exactly one, and it is the machine's owner."""

    id: str
    display_name: str = ""
    roles: list[Role] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Dataset compilation (plan 03-02). The manifest is what a training run
# consumes; everything an engine needs is here, and nothing engine-specific is.
# ---------------------------------------------------------------------------

DATASET_MANIFEST_VERSION = 1

DatasetSplit = Literal["train", "dev"]
TextProvenance = Literal["script", "stt", "user"]
DatasetRejectionReason = Literal[
    "no-audio",
    "missing-audio-file",
    "empty-text",
    "no-word-timing",
    "unassigned-speaker",
    "unknown-speaker",
    "mixed-speaker-unresolved",
    "no-usable-segment",
]


class DatasetSegment(DomainModel):
    id: str
    asset_id: str
    # Project-relative, per docs/PORTABILITY.md: a manifest that stored an
    # absolute path would stop resolving the moment the project moved.
    audio_path: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = Field(min_length=1)
    speaker_profile_id: str | None = None
    emotion: EmotionLabel = "normal"
    # Derived from the emotion so the conditioning probe stays possible without
    # a manifest version bump. Exporters that cannot use it drop it.
    instruct: str = ""
    capture_tier: CaptureTier = "import"
    text_provenance: TextProvenance = "stt"
    language_id: str | None = None
    split: DatasetSplit = "train"

    @property
    def duration(self) -> float:
        return round(self.end - self.start, 3)


class DatasetRejection(DomainModel):
    asset_id: str
    asset_name: str = ""
    reason: DatasetRejectionReason
    detail: str = ""


class DatasetStats(DomainModel):
    segments: int = 0
    train_segments: int = 0
    dev_segments: int = 0
    total_seconds: float = 0
    seconds_by_emotion: dict[str, float] = Field(default_factory=dict)
    segments_by_tier: dict[str, int] = Field(default_factory=dict)
    seconds_by_speaker: dict[str, float] = Field(default_factory=dict)
    # Speech that existed but was kept out: nobody owned it, or two voices
    # overlapped. Shown so a thin dataset explains itself instead of looking lost.
    seconds_dropped_unassigned: float = 0
    seconds_dropped_overlap: float = 0


class DatasetManifest(DomainModel):
    version: int = DATASET_MANIFEST_VERSION
    id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source_asset_ids: list[str] = Field(default_factory=list)
    segments: list[DatasetSegment] = Field(default_factory=list)
    rejections: list[DatasetRejection] = Field(default_factory=list)
    stats: DatasetStats = Field(default_factory=DatasetStats)


class DatasetFileSummary(DomainModel):
    """One footage file as the project overview shows it."""

    asset_id: str
    name: str
    extension: str = ""
    media_kind: str = "audio"
    audio_codec: str | None = None
    sample_rate: int | None = None
    duration: float = 0
    # Bytes of the source the user imported; 0 when it lives outside the project and is gone.
    bytes: int = 0
    origin: str = "import"
    training_selected: bool = False
    transcription_status: str = "idle"
    speaker_profile_ids: list[str] = Field(default_factory=list)
    emotion: str = "normal"
    # What this file puts into the dataset, per Speaker Profile and per emotion.
    segments: int = 0
    seconds_by_speaker: dict[str, float] = Field(default_factory=dict)
    seconds_by_emotion: dict[str, float] = Field(default_factory=dict)
    rejection: str | None = None


class DatasetReadiness(DomainModel):
    """What Train and Training Job show before anything is compiled."""

    selected_assets: int = 0
    ready_assets: int = 0
    segments: int = 0
    total_seconds: float = 0
    speaker_profile_ids: list[str] = Field(default_factory=list)
    segments_by_tier: dict[str, int] = Field(default_factory=dict)
    seconds_by_emotion: dict[str, float] = Field(default_factory=dict)
    # Per Speaker Profile, so each voice target shows how much of itself it has.
    seconds_by_speaker: dict[str, float] = Field(default_factory=dict)
    rejections: list[DatasetRejection] = Field(default_factory=list)
    # Only for sources read from a supplied script. A source is not "ready"
    # merely because it compiled; it is ready when what was read matches what
    # was written, and this is where that shows.
    script_validations: list["ScriptValidation"] = Field(default_factory=list)
    seconds_dropped_unassigned: float = 0
    seconds_dropped_overlap: float = 0
    # Every footage file of the project, selected for training or not.
    files: list[DatasetFileSummary] = Field(default_factory=list)


class ScriptValidation(DomainModel):
    """Did the speaker read the script they were given?

    This is not forced alignment. R5 measured that against DTW and declined it;
    this answers a different question, at the level of words rather than
    milliseconds, by diffing the supplied script against what was recognised.
    """

    asset_id: str
    expected_words: int = 0
    heard_words: int = 0
    matched: int = 0
    omissions: list[str] = Field(default_factory=list)
    insertions: list[str] = Field(default_factory=list)
    substitutions: list[tuple[str, str]] = Field(default_factory=list)
    match_ratio: float = Field(default=0, ge=0, le=1)


# ---------------------------------------------------------------------------
# Training runs (plan 03-03). A run lasts hours, so the app being closed
# mid-run is normal rather than exceptional, and `run.json` is what survives it.
# ---------------------------------------------------------------------------

TRAINING_RUN_VERSION = 1

TrainingStepId = Literal[
    "provision",
    "resolve-model",
    "read-manifest",
    "write-jsonl",
    "tokenize",
    "load-model",
    "train",
    "checkpoint",
    "publish",
]

# `interrupted` is not `failed`. The process is gone because the machine or the
# app stopped, which says nothing about whether the run was going well, and a
# run that reports itself as still running after its process died is the one
# state that makes a user distrust every other number on the screen.
TrainingRunStatus = Literal[
    "pending", "running", "interrupted", "cancelled", "failed", "complete"
]


class TrainingRunConfig(DomainModel):
    # The descriptor this run was configured from, and its values keyed by the
    # upstream names. Runs recorded before descriptors existed have neither.
    model_id: str | None = Field(default=None, max_length=80)
    parameters: dict[str, Any] = Field(default_factory=dict)
    engine: str = "omnivoice"
    mode: str = "lora-finetune"
    base_model: str = "k2-fsa/OmniVoice"
    use_lora: bool = True
    lora_r: int = Field(default=16, ge=1)
    lora_alpha: int = Field(default=32, ge=1)
    learning_rate: float = Field(default=1e-4, gt=0)
    steps: int = Field(default=5000, ge=1)
    save_steps: int = Field(default=1000, ge=1)
    batch_tokens: int = Field(default=8192, ge=1)
    attn_implementation: str = "sdpa"


class TrainingRunStart(DomainModel):
    """Request to start a new run or resume one whose checkpoints survived."""

    manifest_id: str = Field(min_length=1, max_length=160)
    config: TrainingRunConfig = Field(default_factory=TrainingRunConfig)
    resume_run_id: str | None = Field(default=None, max_length=160)
    # One voice per ticked Speaker Profile: each becomes its own run, trained on
    # that person's segments only, one after another on the one GPU.
    speaker_profile_ids: list[str] = Field(default_factory=list, max_length=64)


# vc: a voice-conversion model (RVC) that changes a performer's voice live;
# `model_path` holds its weights and `adapter_path` its retrieval index.
VoiceKind = Literal["clone", "lora", "full", "vc"]


class ProjectVoice(DomainModel):
    """A voice a Speaker Profile can speak with, made by Voice Training.

    `clone` needs no training: a short reference clip and its transcript are
    the whole voice. `lora` adds a trained adapter on top of the same kind of
    reference. Paths are project-relative, so the voice moves with the project.
    """

    id: str = Field(default_factory=lambda: f"voice-{uuid4().hex[:12]}")
    name: str = Field(min_length=1, max_length=160)
    speaker_profile_id: str
    engine: str = "omnivoice"
    kind: VoiceKind = "clone"
    model_id: str | None = None
    base_model: str = "k2-fsa/OmniVoice"
    reference_audio: str
    reference_text: str = Field(min_length=1)
    reference_seconds: float = Field(default=0, ge=0)
    reference_segment_id: str | None = None
    adapter_path: str | None = None
    # A fully fine-tuned checkpoint inside the project, used instead of
    # `base_model` when set. LoRA voices keep the base and add `adapter_path`.
    model_path: str | None = None
    language: str | None = None
    source_run_id: str | None = None
    # Present only for text-generation voices that belong to a coordinated
    # publication aggregate. RVC voices preserve the performer's emotion and
    # intentionally remain standalone.
    model_set_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


VoiceModelSetStatus = Literal["pending-gate", "published", "rejected"]
VoiceModelSetMemberRole = Literal["anchor", "neutral", "emotion"]


class VoiceModelSetMember(DomainModel):
    voice_id: str
    role: VoiceModelSetMemberRole = "neutral"
    emotion: EmotionLabel = "normal"
    source_run_id: str | None = None


class SpeakerSimilarityGateEvidence(DomainModel):
    """Frozen evidence for one identity-gate decision."""

    protocol_version: int = 1
    embedder_id: str
    embedder_revision: str = ""
    threshold: float = Field(ge=-1, le=1)
    calibrated: bool = False
    metric: Literal["cosine-similarity"] = "cosine-similarity"
    protocol: str = "mono-16khz-whole-window-v1"
    scores_by_voice_id: dict[str, float] = Field(default_factory=dict)
    candidate_output_ids_by_voice_id: dict[str, str] = Field(default_factory=dict)
    score_passed: bool = False
    passed: bool
    decision_reason: Literal["passed", "below-threshold", "threshold-unmeasured"]
    measured_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SpeakerEmbedderInfo(DomainModel):
    id: str
    label: str
    model_id: str
    revision: str
    threshold: float = Field(ge=-1, le=1)
    calibrated: bool = False
    available: bool = False
    status: str


class VoiceModelSetGateRequest(DomainModel):
    embedder_id: str | None = Field(default=None, min_length=1, max_length=120)
    output_ids_by_voice_id: dict[str, str] = Field(min_length=1, max_length=32)


class VoiceModelSetLineage(DomainModel):
    manifest_id: str
    manifest_hash: str
    engine: str
    engine_revision: str
    model_id: str | None = None
    base_model: str
    config: TrainingRunConfig
    segment_count: int = Field(ge=1)
    source_run_ids: list[str] = Field(min_length=1)


class VoiceModelSet(DomainModel):
    """One identity-safe publication unit for text generation.

    Persistence begins at `pending-gate`. Only the similarity-gate round may
    move it to `published`; creating a usable ProjectVoice is not sufficient.
    """

    id: str = Field(default_factory=lambda: f"set-{uuid4().hex[:12]}")
    name: str = Field(min_length=1, max_length=160)
    speaker_profile_id: str
    generation_family: str
    anchor_voice_id: str
    anchor_segment_id: str
    members: list[VoiceModelSetMember] = Field(min_length=1)
    lineage: VoiceModelSetLineage
    status: VoiceModelSetStatus = "pending-gate"
    gate: SpeakerSimilarityGateEvidence | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    published_at: datetime | None = None

    @computed_field
    @property
    def voice_ids(self) -> list[str]:
        return [member.voice_id for member in self.members]


class AudioDeviceInfo(DomainModel):
    """One PortAudio device as the Voice Changer runtime sees it."""

    index: int
    name: str
    host_api: str
    max_input_channels: int = 0
    max_output_channels: int = 0
    default_sample_rate: float = 0
    # A virtual audio cable: sending audio into it makes a microphone other
    # applications can pick.
    virtual_cable: bool = False


class VoiceChangerPreflight(DomainModel):
    """What live conversion needs on this machine, and what it found."""

    runtime_ready: bool
    runtime_python: str | None = None
    missing: list[str] = Field(default_factory=list)
    devices: list[AudioDeviceInfo] = Field(default_factory=list)
    device_error: str | None = None
    # Windows audio endpoints, read without the runtime, so a missing virtual
    # cable is reported even before anything is installed.
    endpoints: list[str] = Field(default_factory=list)
    virtual_cable: str | None = None
    gpu_holder: str | None = None


class VoiceChangerStartRequest(DomainModel):
    engine_id: str = Field(min_length=1, max_length=80)
    voice_id: str | None = None
    input_device: int = Field(ge=0)
    # The virtual microphone: audio sent into a virtual cable other apps record from.
    virtual_device: int | None = Field(default=None, ge=0)
    speaker_device: int | None = Field(default=None, ge=0)
    # PortAudio renumbers devices whenever one appears or disappears, so the
    # worker finds each device again by name and host API when it has them.
    input_device_name: str | None = Field(default=None, max_length=300)
    virtual_device_name: str | None = Field(default=None, max_length=300)
    speaker_device_name: str | None = Field(default=None, max_length=300)
    host_api: str | None = Field(default=None, max_length=80)
    # Hearing your own converted voice with a delay disturbs speaking, so it is off unless asked for.
    monitor: bool = False
    parameters: dict[str, Any] = Field(default_factory=dict)


class VoiceChangerStatus(DomainModel):
    state: Literal["idle", "running", "error"] = "idle"
    project_id: str | None = None
    engine_id: str | None = None
    voice_id: str | None = None
    sample_rate: int | None = None
    block_ms: float | None = None
    algorithmic_latency_ms: float | None = None
    device_latency_ms: float | None = None
    # Engine time per block as measured by the worker.
    processing_ms: float | None = None
    input_level_db: float = -120
    input_peak_db: float = -120
    output_level_db: float = -120
    output_peak_db: float = -120
    input_spectrum: list[float] = Field(default_factory=list)
    output_spectrum: list[float] = Field(default_factory=list)
    underruns: int = 0
    overruns: int = 0
    recording: bool = False
    recording_seconds: float = 0
    outputs: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None
    started_at: datetime | None = None


class VoiceChangerRecording(DomainModel):
    """A live session recorded as two channels: left the spoken voice, right the converted one."""

    id: str
    name: str
    engine_id: str
    voice_id: str | None = None
    voice_name: str | None = None
    speaker_profile_id: str | None = None
    duration: float = Field(default=0, ge=0)
    sample_rate: int
    channels: int = 2
    # The pipeline's own delay removed from the converted channel, and what the
    # audio itself said on top of that.
    delay_ms: float = 0
    refined_delay_ms: float | None = None
    audio_path: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProjectAsrAdapter(DomainModel):
    """A speech-recognition adapter trained in this project."""

    id: str = Field(default_factory=lambda: f"asr-{uuid4().hex[:12]}")
    name: str
    engine: str = "vibevoice-asr"
    base_model: str
    adapter_path: str
    speaker_profile_id: str | None = None
    source_run_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VoiceOutputSegment(DomainModel):
    """One Script row inside a Voice Output: who read it, and where it sits."""

    row_id: str
    voice_id: str
    voice_name: str
    speaker_profile_id: str
    engine: str
    generator_id: str
    text: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    # The cached clip this row was cut from; a later read of the same row with
    # the same voice and settings reuses it instead of speaking it again.
    clip: str | None = None


class VoiceOutput(DomainModel):
    """One piece of generated speech in the project's Voice Output store."""

    id: str
    name: str
    text: str
    voice_id: str
    voice_name: str
    speaker_profile_id: str
    engine: str
    generator_id: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    duration: float = Field(default=0, ge=0)
    sample_rate: int = 24000
    audio_path: str
    # Word timing measured on the generated audio, in the same shape Speech to
    # Text gives footage, so Script and Timeline follow speech the same way.
    words: list[dict[str, Any]] = Field(default_factory=list)
    word_timing_quality: str | None = None
    word_timing_note: str | None = None
    segments: list[VoiceOutputSegment] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VoiceScriptRow(DomainModel):
    id: str = Field(min_length=1, max_length=80)
    voice_id: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=5000)


class VoiceScriptRequest(DomainModel):
    """A typed Script, row by row, each row read by the voice picked for it."""

    rows: list[VoiceScriptRow] = Field(min_length=1, max_length=400)
    # Generation values per generator id, as the Voice Generator panel holds them.
    parameters: dict[str, dict[str, Any]] = Field(default_factory=dict)
    # Silence between two rows, so a change of speaker does not land on a breath.
    gap_seconds: float = Field(default=0.35, ge=0, le=5)


class VoiceScriptJob(DomainModel):
    id: str
    project_id: str
    status: Literal["running", "complete", "failed"] = "running"
    total: int = Field(ge=0)
    done: int = Field(default=0, ge=0)
    reused: int = Field(default=0, ge=0)
    current_row_id: str | None = None
    message: str | None = None
    output: VoiceOutput | None = None
    error: str | None = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None


class VoiceGenerateRequest(DomainModel):
    text: str = Field(min_length=1, max_length=5000)
    generator_id: str = Field(default="omnivoice-generate", max_length=80)
    # Values keyed by the engine's own generation names, checked against the
    # generator descriptor before anything runs.
    parameters: dict[str, Any] = Field(default_factory=dict)
    # Fixed output length, for replacing a region of known duration.
    duration: float | None = Field(default=None, gt=0, le=600)


class TrainingCheckpoint(DomainModel):
    step: int = Field(ge=0)
    path: str
    bytes: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TrainingRun(DomainModel):
    """The record that outlives the process.

    Everything needed to resume is here rather than recomputed from current
    settings: `accelerate` fails on a shape mismatch if the LoRA fields or the
    base checkpoint differ from the run that wrote the checkpoint.
    """

    version: int = TRAINING_RUN_VERSION
    id: str
    project_id: str
    manifest_id: str
    manifest_hash: str = ""
    engine_revision: str = ""
    speaker_profile_id: str | None = None
    # Runs started together for several voice targets share a batch. A run
    # recorded before batches existed is a batch of one.
    batch_id: str | None = None
    batch_index: int = Field(default=0, ge=0)
    batch_size: int = Field(default=1, ge=1)
    emotion: EmotionLabel = "normal"
    config: TrainingRunConfig = Field(default_factory=TrainingRunConfig)
    status: TrainingRunStatus = "pending"
    step_id: TrainingStepId = "provision"
    global_step: int = Field(default=0, ge=0)
    checkpoints: list[TrainingCheckpoint] = Field(default_factory=list)
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    process_id: int | None = None


class OwnedItem(DomainModel):
    id: str
    name: str


class TrainingRunFootprint(DomainModel):
    """What deleting a run takes with it."""

    run_id: str
    bytes: int = 0
    voices: list[OwnedItem] = Field(default_factory=list)
    asr_adapters: list[OwnedItem] = Field(default_factory=list)


class TrainingProgressLine(DomainModel):
    """One append-only line. Never rewritten, so a crash cannot corrupt history."""

    at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    step_id: TrainingStepId
    message: str = ""
    # Step 7 is the whole run by wall clock, and a percentage there says almost
    # nothing. These are what tell a person whether to keep waiting.
    global_step: int | None = None
    loss: float | None = None
    dev_loss: float | None = None
    learning_rate: float | None = None
    steps_per_second: float | None = None
    vram_mb: int | None = None
    # Tokenization reports in shards, which is its own unit and not a fraction
    # of the run.
    done: int | None = None
    total: int | None = None
    # What a person reading the log back should notice first.
    level: Literal["info", "warning", "error"] = "info"


class ActivityEvent(DomainModel):
    """One line of the app's log, from any part of it."""

    seq: int
    at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str = "app"
    level: Literal["info", "warning", "error"] = "info"
    message: str
    # How many times in a row this same line arrived; 1 means once.
    repeat: int = 1
    task_id: str | None = None


class ActivityTask(DomainModel):
    """A piece of work in flight, as the status bar shows it."""

    id: str
    kind: str
    label: str
    detail: str = ""
    status: Literal["running", "complete", "failed", "cancelled"] = "running"
    fraction: float | None = None
    eta_seconds: float | None = None
    project_id: str | None = None
    error: str | None = None
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None
    seconds: float | None = None


class ActivitySnapshot(DomainModel):
    seq: int = 0
    events: list[ActivityEvent] = Field(default_factory=list)
    tasks: list[ActivityTask] = Field(default_factory=list)


class TrainingRunLog(DomainModel):
    run_id: str
    journal: list[TrainingProgressLine] = Field(default_factory=list)
    process_log: str = ""
    process_log_bytes: int = 0
    truncated: bool = False


class TrainingRuntimePackage(DomainModel):
    name: str
    installed: bool = False
    wheel_path: str | None = None


class TrainingRuntimeReport(DomainModel):
    """What provisioning would do, before it does any of it."""

    root: str
    exists: bool = False
    python: str | None = None
    packages: list[TrainingRuntimePackage] = Field(default_factory=list)
    cached_wheels: list[str] = Field(default_factory=list)
    ready: bool = False
    interpreter_tag: str = ""
    # Cached wheels built for another Python. Reported here rather than
    # discovered three gigabytes into an install.
    wheel_tag_mismatch: list[str] = Field(default_factory=list)

    @property
    def missing(self) -> list[str]:
        return [package.name for package in self.packages if not package.installed]


class DatasetExportReport(DomainModel):
    """What an engine-shaped export produced from a manifest.

    Paths here are absolute and machine-local by design: the manifest is the
    portable record, an export is scratch belonging to one run.
    """

    train_jsonl: str
    dev_jsonl: str
    train_samples: int = Field(default=0, ge=0)
    dev_samples: int = Field(default=0, ge=0)
    # A guided take already is its own file, so it is referenced rather than cut.
    sliced_segments: int = Field(default=0, ge=0)
    reused_segments: int = Field(default=0, ge=0)
    total_seconds: float = Field(default=0, ge=0)


class GpuLeaseHolder(DomainModel):
    """Who currently holds the machine's GPU.

    `pid` is the liveness proof. A heartbeat alone cannot tell a busy process
    from a killed one, and a killed one must not keep the card.
    """

    token: str
    label: str
    pid: int
    acquired_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    heartbeat_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
