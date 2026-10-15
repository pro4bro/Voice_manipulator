from __future__ import annotations

from typing import Literal
from pydantic import Field, model_validator
from app.domain.models import DomainModel


class ScriptSettings(DomainModel):
    duration: float | None = Field(default=None, gt=0, le=600)
    mood: str | None = Field(default=None, max_length=120)
    emotion: str | None = Field(default=None, max_length=120)
    intensity: float | None = Field(default=None, ge=0, le=1)
    delivery: Literal["neutral", "whisper", "shout"] | None = None
    gain_db: float | None = Field(default=None, ge=-60, le=12)
    note: str | None = Field(default=None, max_length=2000)
    locked: list[Literal["duration", "mood", "emotion", "intensity", "delivery", "gainDb", "note"]] = Field(default_factory=list)


class ScriptSentence(DomainModel):
    id: str = Field(min_length=1, max_length=80)
    text: str = Field(default="", max_length=5000)
    voice_id: str | None = None
    speaker_profile_id: str | None = None
    segment_id: str = Field(min_length=1, max_length=80)
    settings: ScriptSettings = Field(default_factory=ScriptSettings)
    origin_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class ScriptSegment(DomainModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(default="", max_length=160)
    settings: ScriptSettings = Field(default_factory=ScriptSettings)


class VoiceScriptDocument(DomainModel):
    version: Literal[1] = 1
    revision: int = Field(default=0, ge=0)
    settings: ScriptSettings = Field(default_factory=ScriptSettings)
    segments: list[ScriptSegment] = Field(default_factory=list, max_length=400)
    rows: list[ScriptSentence] = Field(default_factory=list, max_length=400)

    @model_validator(mode="after")
    def check_links(self):
        ids = [segment.id for segment in self.segments]
        row_ids = [row.id for row in self.rows]
        if len(set(ids)) != len(ids) or len(set(row_ids)) != len(row_ids):
            raise ValueError("Script IDs must be unique.")
        if any(row.segment_id not in ids for row in self.rows):
            raise ValueError("Sentence must belong to an existing segment.")
        return self


def effective_settings(document: VoiceScriptDocument, row: ScriptSentence) -> dict:
    """Ancestor locks win; mirrors the editor's clip/segment/sentence cascade."""
    result, locked = {}, set()
    segment = next((item for item in document.segments if item.id == row.segment_id), None)
    for settings in [document.settings, segment.settings if segment else ScriptSettings(), row.settings]:
        for key, value in settings.model_dump(by_alias=True).items():
            if key != "locked" and value is not None and key not in locked:
                result[key] = value
        locked.update(settings.locked)
    result["locked"] = sorted(locked)
    return result
