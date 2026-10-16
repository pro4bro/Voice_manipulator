from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import Field

from app.domain.models import DomainModel


class VoiceFixRequest(DomainModel):
    expected_script_revision: int = Field(ge=0)
    expected_edit_revision: int = Field(ge=0)
    expected_key: str = Field(pattern=r"^[a-f0-9]{64}$")
    parameters: dict[str, dict[str, Any]] | None = None


class VoiceFixStopRequest(DomainModel):
    include_active: bool = False


class VoiceFixUnitPlan(DomainModel):
    row_id: str
    text: str
    desired_key: str | None = None
    desired_duration: float | None = None
    status: Literal["ready", "dirty", "blocked"]
    clip: str | None = None
    reason: str | None = None


class VoiceFixPlan(DomainModel):
    output_id: str
    key: str
    script_revision: int = Field(ge=0)
    edit_revision: int = Field(ge=0)
    units: list[VoiceFixUnitPlan]
    dirty_count: int = Field(ge=0)
    blockers: list[str] = Field(default_factory=list)
    latest_job: "VoiceFixJob | None" = None


class VoiceFixJobUnit(DomainModel):
    row_id: str
    desired_key: str
    status: Literal["pending", "running", "complete", "failed", "stale", "cancelled"]
    clip: str | None = None
    error: str | None = None


class VoiceFixJob(DomainModel):
    id: str = Field(default_factory=lambda: f"fix-{uuid4().hex[:16]}")
    project_id: str
    output_id: str
    status: Literal["queued", "running", "complete", "stopped", "cancelled", "failed", "stale"]
    plan_key: str
    script_revision: int = Field(ge=0)
    edit_revision: int = Field(ge=0)
    done: int = Field(default=0, ge=0)
    total: int = Field(ge=0)
    units: list[VoiceFixJobUnit]
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


VoiceFixPlan.model_rebuild()
