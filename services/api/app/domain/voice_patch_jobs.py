from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import Field

from app.domain.models import DomainModel


class VoicePatchJobRequest(DomainModel):
    expected_draft_revision: int = Field(ge=0)
    expected_script_revision: int = Field(ge=0)
    expected_edit_revision: int = Field(ge=0)
    replacement_text: str = Field(min_length=1, max_length=5000)
    voice_id: str = Field(min_length=1, max_length=120)


class VoicePatchApplyRequest(DomainModel):
    expected_draft_revision: int = Field(ge=0)
    job_id: str = Field(min_length=1, max_length=100)
    expected_key: str = Field(pattern=r"^[a-f0-9]{64}$")


class VoicePatchJob(DomainModel):
    id: str = Field(default_factory=lambda: f"patch-{uuid4().hex[:16]}")
    project_id: str
    output_id: str
    status: Literal["queued", "running", "complete", "stopped", "cancelled", "failed", "stale"]
    key: str = Field(pattern=r"^[a-f0-9]{64}$")
    draft_revision: int = Field(ge=0)
    script_revision: int = Field(ge=0)
    edit_revision: int = Field(ge=0)
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_metadata_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    generator_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    clip_key: str = Field(pattern=r"^[a-f0-9]{32}$")
    replacement_text: str
    voice_id: str
    speaker_profile_id: str
    clip: str | None = None
    done: int = Field(default=0, ge=0)
    total: int = Field(default=1, ge=1)
    replacement_audio_url: str | None = None
    audio_url: str | None = None
    report: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

