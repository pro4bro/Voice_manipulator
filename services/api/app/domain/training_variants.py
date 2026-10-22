from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.domain.models import DatasetManifest, DomainModel, EmotionLabel


VocalEffort = Literal["ordinary", "soft", "whisper", "loud", "shout"]


class TrainingVariantSelection(DomainModel):
    emotion: EmotionLabel
    vocal_effort: VocalEffort
    segment_ids: list[str] = Field(default_factory=list)


class TrainingVariantPreviewRequest(DomainModel):
    manifest_id: str = Field(min_length=1, max_length=160, pattern=r"^dataset-[A-Za-z0-9_-]+$")
    speaker_profile_id: str = Field(min_length=1, max_length=160)
    training_model_id: str = Field(min_length=1, max_length=80)
    ordered_neutral_anchor_segment_ids: list[str] = Field(default_factory=list)
    variants: list[TrainingVariantSelection] = Field(min_length=1, max_length=128)
    # Draft labels are request-scoped and intentionally do not persist to media/manifests.
    segment_effort_labels: dict[str, VocalEffort] = Field(default_factory=dict)
    parameters: dict[str, Any] = Field(default_factory=dict)
    # Caller declaration only. The product has no trusted base-identity resolver yet.
    base_fingerprint: str | None = Field(default=None, max_length=256)


class TrainingVariantPlanMetadata(DomainModel):
    training_model_id: str
    engine: str
    mode: str
    engine_revision: str | None = None
    runnable: bool
    available: bool
    status: str
    blocked_reason: str | None = None
    parameter_specs: list[dict[str, Any]] = Field(default_factory=list)
    resolved_parameters: dict[str, Any] = Field(default_factory=dict)
    config_fingerprint: str
    base_fingerprint: str | None = None
    base_identity_verified: Literal[False] = False


class TrainingVariantPlanCell(DomainModel):
    emotion: EmotionLabel
    vocal_effort: VocalEffort
    selected_segment_ids: list[str]
    train_segment_ids: list[str]
    dev_segment_ids: list[str]
    neutral_anchor_segment_ids: list[str]
    train_duration_seconds: float
    dev_duration_seconds: float
    anchor_duration_seconds: float


class TrainingVariantPlan(DomainModel):
    dry_run: Literal[True] = True
    executable: Literal[False] = False
    ready_for_review: bool
    plan_fingerprint: str
    source_manifest_id: str
    source_manifest_hash: str
    speaker_profile_id: str
    base_identity_verified: Literal[False] = False
    metadata: TrainingVariantPlanMetadata
    cells: list[TrainingVariantPlanCell]
    blockers: list[str] = Field(default_factory=list)


def manifest_fingerprint(manifest: DatasetManifest) -> str:
    """Canonical model digest for callers that do not have the stored-file receipt."""
    import hashlib

    return hashlib.sha256(manifest.model_dump_json(by_alias=True).encode("utf-8")).hexdigest()
