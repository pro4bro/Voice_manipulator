from typing import Any
from pydantic import Field, model_validator
from app.domain.models import DomainModel
from app.domain.voice_script_document import VoiceScriptDocument


class VoiceVersionState(DomainModel):
    revision: int = Field(default=0, ge=0)
    script: VoiceScriptDocument = Field(default_factory=VoiceScriptDocument)
    config: dict[str, Any] = Field(default_factory=dict)
    # Last successful synthesis snapshot (Full or Fix). The full baseline is
    # retained across Fix runs so the UI can distinguish fixed edits from new ones.
    generated_script: VoiceScriptDocument | None = None
    full_generated_script: VoiceScriptDocument | None = None
    generated_config: dict[str, Any] = Field(default_factory=dict)
    composition: dict[str, Any] | None = None
    output_id: str | None = None
    owned_output_ids: list[str] = Field(default_factory=list)
    history: list[dict[str, Any]] = Field(default_factory=list, max_length=32)
    sidecars: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def migrate_full_baseline(self):
        # Older project manifests have only the last-generated snapshot. Use it
        # as their best available Full baseline without rewriting their format.
        if self.full_generated_script is None and self.generated_script is not None:
            self.full_generated_script = self.generated_script.model_copy(deep=True)
        return self


class VoiceVersionSave(DomainModel):
    revision: int = Field(ge=0)
    script: VoiceScriptDocument
    config: dict[str, Any] = Field(default_factory=dict)


class VoiceVersionSlotAction(DomainModel):
    revision: int = Field(ge=0)
    id: str
    kind: str
    name: str | None = Field(default=None, min_length=1, max_length=160)
