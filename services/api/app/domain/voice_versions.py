from typing import Any
from pydantic import Field
from app.domain.models import DomainModel
from app.domain.voice_script_document import VoiceScriptDocument


class VoiceVersionState(DomainModel):
    revision: int = Field(default=0, ge=0)
    script: VoiceScriptDocument = Field(default_factory=VoiceScriptDocument)
    config: dict[str, Any] = Field(default_factory=dict)
    generated_script: VoiceScriptDocument | None = None
    generated_config: dict[str, Any] = Field(default_factory=dict)
    composition: dict[str, Any] | None = None
    output_id: str | None = None
    owned_output_ids: list[str] = Field(default_factory=list)
    history: list[dict[str, Any]] = Field(default_factory=list, max_length=32)
    sidecars: dict[str, Any] = Field(default_factory=dict)


class VoiceVersionSave(DomainModel):
    revision: int = Field(ge=0)
    script: VoiceScriptDocument
    config: dict[str, Any] = Field(default_factory=dict)


class VoiceVersionSlotAction(DomainModel):
    revision: int = Field(ge=0)
    id: str
    kind: str
    name: str | None = Field(default=None, min_length=1, max_length=160)
