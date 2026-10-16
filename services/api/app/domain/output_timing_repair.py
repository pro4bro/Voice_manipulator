from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import Field

from app.domain.models import DomainModel


class OutputTimingRepairStartRequest(DomainModel):
    expected_key: str = Field(pattern=r"^[a-f0-9]{64}$")


class OutputTimingRepairApplyRequest(DomainModel):
    job_id: str = Field(min_length=1, max_length=100)
    expected_key: str = Field(pattern=r"^[a-f0-9]{64}$")


class OutputTimingRepairJob(DomainModel):
    id: str = Field(default_factory=lambda: f"timing-{uuid4().hex[:16]}")
    project_id: str
    output_id: str
    key: str = Field(pattern=r"^[a-f0-9]{64}$")
    status: Literal["queued", "running", "complete", "cancelled", "failed", "stale"]
    done: int = Field(default=0, ge=0)
    total: int = Field(ge=1)
    report: dict[str, Any] = Field(default_factory=dict)
    proposal_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

