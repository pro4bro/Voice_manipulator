"""Frame-exact, non-destructive ripple commands. Coordinates are edited time."""
from __future__ import annotations

from typing import Literal
from pydantic import Field, model_validator
from app.domain.models import DomainModel


class StretchOperation(DomainModel):
    start_frame: int = Field(ge=0)
    end_frame: int = Field(gt=0)
    target_frames: int = Field(gt=0)
    edge: Literal["left", "right"] = "right"

    @model_validator(mode="after")
    def bounds(self):
        length = self.end_frame - self.start_frame
        if length <= 0 or not .5 <= self.target_frames / length <= 2:
            raise ValueError("Chỉ giãn từ 0.5× đến 2×; không trim bỏ lời.")
        return self

    @property
    def delta(self) -> int:
        return self.target_frames - (self.end_frame - self.start_frame)

    def map_frame(self, frame: int) -> int:
        if frame <= self.start_frame:
            return frame
        if frame >= self.end_frame:
            return frame + self.delta
        return self.start_frame + round((frame - self.start_frame) * self.target_frames / (self.end_frame - self.start_frame))


class VoiceEditDocument(DomainModel):
    version: Literal[1] = 1
    revision: int = Field(default=0, ge=0)
    output_id: str
    source_sha256: str
    sample_rate: int = Field(gt=0)
    source_frames: int = Field(gt=0)
    operations: list[StretchOperation] = Field(default_factory=list, max_length=128)
    cursor: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def check_history(self):
        if self.cursor > len(self.operations):
            raise ValueError("Invalid edit cursor")
        frames = self.source_frames
        for op in self.operations:
            if op.end_frame > frames:
                raise ValueError("Vùng giãn nằm ngoài audio.")
            frames += op.delta
            if frames > self.sample_rate * 600:
                raise ValueError("Preview tối đa 10 phút.")
        return self

    @property
    def active(self):
        return self.operations[:self.cursor]

    @property
    def frames(self) -> int:
        return self.source_frames + sum(op.delta for op in self.active)

    def map_seconds(self, seconds: float) -> float:
        frame = round(seconds * self.sample_rate)
        for op in self.active:
            frame = op.map_frame(frame)
        return frame / self.sample_rate


class VoiceEditCommand(DomainModel):
    revision: int = Field(ge=0)
    script_revision: int = Field(ge=0)
    action: Literal["stretch", "undo", "redo"] = "stretch"
    operation: StretchOperation | None = None


def apply_command(document: VoiceEditDocument, command: VoiceEditCommand) -> VoiceEditDocument:
    if command.revision != document.revision:
        raise ValueError("Timeline đã đổi; tải lại trước khi chỉnh.")
    data = document.model_dump()
    if command.action == "stretch":
        if command.operation is None:
            raise ValueError("Thiếu vùng giãn.")
        data["operations"] = [op.model_dump() for op in document.active] + [command.operation.model_dump()]
        data["cursor"] = document.cursor + 1
    else:
        cursor = document.cursor + (-1 if command.action == "undo" else 1)
        if not 0 <= cursor <= len(document.operations):
            raise ValueError("Không có bước để hoàn tác/làm lại.")
        data["cursor"] = cursor
    data["revision"] += 1
    return VoiceEditDocument.model_validate(data)
