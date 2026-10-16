from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.domain.models import DomainModel


class VoicePatchDraft(DomainModel):
    output_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    row_id: str
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_metadata_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    script_revision: int = Field(ge=0)
    edit_revision: int = Field(ge=0)
    start_frame: int = Field(ge=0)
    end_frame: int = Field(gt=0)
    sample_rate: Literal[24000] = 24000
    text: str
    replacement_text: str
    voice_id: str
    speaker_profile_id: str
    status: Literal["ready", "stale", "missing"] = "ready"
    reason: str | None = None
    audio_url: str
    processing_available: Literal[False] = False
    report: dict = Field(default_factory=dict)


class VoicePatchDocument(DomainModel):
    revision: int = Field(default=0, ge=0)
    draft: VoicePatchDraft | None = None


class VoicePatchTransferRequest(DomainModel):
    expected_revision: int = Field(ge=0)
    output_id: str = Field(min_length=1, max_length=100)
    row_id: str = Field(min_length=1, max_length=80)
    expected_script_revision: int = Field(ge=0)
    expected_edit_revision: int = Field(ge=0)
