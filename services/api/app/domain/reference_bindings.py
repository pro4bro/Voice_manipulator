from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from pydantic import Field, model_validator
from app.domain.models import DomainModel

ReferenceProperty = Literal["timing", "intonation", "volume", "emotion", "shout", "whisper"]


class ReferenceScope(DomainModel):
    kind: Literal["voice-output", "asset", "script"]
    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$")
    revision: str = Field(min_length=1, max_length=160)


class ReferenceTextRange(DomainModel):
    row_id: str = Field(min_length=1, max_length=80)
    start: int = Field(ge=0)
    end: int = Field(gt=0)

    @model_validator(mode="after")
    def valid(self):
        if self.end <= self.start:
            raise ValueError("Text selection must have a positive length.")
        return self


class ReferenceTarget(DomainModel):
    id: str = Field(min_length=1, max_length=160)
    start: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    end: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    row_ids: list[str] = Field(default_factory=list, max_length=400)
    word_indexes: list[int] = Field(default_factory=list, max_length=100000)
    text_ranges: list[ReferenceTextRange] = Field(default_factory=list, max_length=400)
    text: str = Field(default="", max_length=2000000)

    @model_validator(mode="after")
    def valid(self):
        if (self.start is None) != (self.end is None) or (self.start is not None and self.end <= self.start):
            raise ValueError("Selection timing must have both start/end and a positive duration.")
        if self.start is None and not self.row_ids and not self.text_ranges:
            raise ValueError("Untimed selection needs stable sentence IDs.")
        if any(index < 0 for index in self.word_indexes) or len(set(self.word_indexes)) != len(self.word_indexes):
            raise ValueError("Word selection indexes must be unique and nonnegative.")
        return self


class ReferenceSource(DomainModel):
    asset_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$")
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    properties: list[ReferenceProperty] = Field(min_length=1, max_length=6)
    strength: float = Field(default=1, ge=0, le=1, allow_inf_nan=False)
    priority: int = Field(default=0, ge=0, le=100)
    audio_sha256: str | None = None
    name: str | None = None

    @model_validator(mode="after")
    def valid(self):
        if self.end <= self.start or len(set(self.properties)) != len(self.properties):
            raise ValueError("Reference source needs a valid span and unique properties.")
        return self


class ReferenceAssignment(DomainModel):
    scope: ReferenceScope
    targets: list[ReferenceTarget] = Field(min_length=1, max_length=400)
    sources: list[ReferenceSource] = Field(min_length=1, max_length=32)
    expected_revision: int = Field(ge=0)


class ReferenceBinding(DomainModel):
    id: str
    scope: ReferenceScope
    target: ReferenceTarget
    sources: list[ReferenceSource]
    status: Literal["requested", "missing", "stale"] = "requested"
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReferenceBindingDocument(DomainModel):
    version: Literal[1] = 1
    revision: int = Field(default=0, ge=0)
    bindings: list[ReferenceBinding] = Field(default_factory=list, max_length=10000)
