from __future__ import annotations

import re
from typing import Literal
from uuid import uuid4

from pydantic import Field, model_validator

from app.domain.models import DomainModel

MAX_COMPOSITION_FRAMES = 24_000 * 60 * 60 * 4
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$")


def _valid_id(value: str) -> bool:
    return bool(_IDENTIFIER.fullmatch(value))


def _rebuild(composition: "VoiceComposition", layers: list["VoiceCompositionLayer"]) -> "VoiceComposition":
    return VoiceComposition.model_validate({
        "revision": composition.revision + 1,
        "duration_frames": composition.duration_frames,
        "layers": [layer.model_dump(mode="python") for layer in layers],
    })


class VoiceCompositionClip(DomainModel):
    id: str = Field(min_length=1, max_length=120)
    output_id: str = Field(min_length=1, max_length=120)
    start_frame: int = Field(ge=0, le=MAX_COMPOSITION_FRAMES)
    source_start_frame: int = Field(ge=0, le=MAX_COMPOSITION_FRAMES)
    frame_count: int = Field(gt=0, le=MAX_COMPOSITION_FRAMES)
    enabled: bool = True

    @model_validator(mode="after")
    def validate_ids(self):
        if not _valid_id(self.id) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,119}", self.output_id):
            raise ValueError("Voice composition clip identifiers contain unsupported characters.")
        if (self.start_frame + self.frame_count > MAX_COMPOSITION_FRAMES or
                self.source_start_frame + self.frame_count > MAX_COMPOSITION_FRAMES):
            raise ValueError("Voice composition clip exceeds the four-hour limit.")
        return self

    @property
    def end_frame(self) -> int:
        return self.start_frame + self.frame_count


class VoiceCompositionLayer(DomainModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = True
    clips: list[VoiceCompositionClip] = Field(default_factory=list, max_length=2000)

    @model_validator(mode="after")
    def validate_id(self):
        if not _valid_id(self.id):
            raise ValueError("Voice composition layer identifier contains unsupported characters.")
        return self


class VoiceComposition(DomainModel):
    revision: int = Field(ge=0)
    duration_frames: int = Field(gt=0, le=MAX_COMPOSITION_FRAMES)
    layers: list[VoiceCompositionLayer] = Field(min_length=1, max_length=256)

    @model_validator(mode="after")
    def validate_tree(self):
        layer_ids = [layer.id for layer in self.layers]
        clip_ids = [clip.id for layer in self.layers for clip in layer.clips]
        if len(layer_ids) != len(set(layer_ids)):
            raise ValueError("Voice composition layer identifiers must be unique.")
        if len(clip_ids) != len(set(clip_ids)):
            raise ValueError("Voice composition clip identifiers must be unique.")
        if any(clip.end_frame > self.duration_frames for layer in self.layers for clip in layer.clips):
            raise ValueError("Voice composition clip exceeds the composition duration.")
        return self


class VoiceCompositionCommand(DomainModel):
    action: Literal["delete-clip", "split-clip", "trim-left", "trim-right", "move-clip",
                    "toggle-layer", "toggle-clip"]
    clip_id: str | None = None
    layer_id: str | None = None
    target_layer_id: str | None = None
    start_frame: int | None = Field(default=None, ge=0, le=MAX_COMPOSITION_FRAMES)
    at_frame: int | None = Field(default=None, ge=0, le=MAX_COMPOSITION_FRAMES)
    new_clip_id: str | None = Field(default=None, min_length=1, max_length=120)
    enabled: bool | None = None


def apply_voice_composition_command(
    composition: VoiceComposition, command: VoiceCompositionCommand,
) -> VoiceComposition:
    """Apply one edit without mutating the supplied composition."""
    layers = [layer.model_copy(deep=True) for layer in composition.layers]

    def find_clip():
        for layer_index, layer in enumerate(layers):
            for clip_index, clip in enumerate(layer.clips):
                if clip.id == command.clip_id:
                    return layer_index, clip_index, clip
        raise ValueError(f"Voice composition clip not found: {command.clip_id}")

    if command.action == "toggle-layer":
        if command.layer_id is None or command.enabled is None:
            raise ValueError("Toggling a layer requires layer_id and enabled.")
        layer = next((item for item in layers if item.id == command.layer_id), None)
        if layer is None:
            raise ValueError(f"Voice composition layer not found: {command.layer_id}")
        layer.enabled = command.enabled
    elif command.action == "delete-clip":
        layer_index, clip_index, _ = find_clip()
        del layers[layer_index].clips[clip_index]
    elif command.action == "toggle-clip":
        layer_index, clip_index, _ = find_clip()
        if command.enabled is None:
            raise ValueError("Toggling a clip requires enabled.")
        layers[layer_index].clips[clip_index].enabled = command.enabled
    elif command.action == "split-clip":
        layer_index, clip_index, clip = find_clip()
        at = command.at_frame
        if at is None or not clip.start_frame < at < clip.end_frame:
            raise ValueError("Split frame must be strictly inside the clip.")
        if command.new_clip_id is None or not _valid_id(command.new_clip_id):
            raise ValueError("Splitting a clip requires a valid new_clip_id.")
        first_count = at - clip.start_frame
        left = clip.model_copy(update={"frame_count": first_count})
        right = clip.model_copy(update={
            "id": command.new_clip_id,
            "start_frame": at,
            "source_start_frame": clip.source_start_frame + first_count,
            "frame_count": clip.frame_count - first_count,
        })
        layers[layer_index].clips[clip_index:clip_index + 1] = [left, right]
    elif command.action in ("trim-left", "trim-right"):
        layer_index, clip_index, clip = find_clip()
        at = command.at_frame
        if at is None:
            raise ValueError("Trimming a clip requires at_frame.")
        if command.action == "trim-left":
            if not clip.start_frame < at < clip.end_frame:
                raise ValueError("Left trim frame must be strictly inside the clip.")
            delta = at - clip.start_frame
            layers[layer_index].clips[clip_index] = clip.model_copy(update={
                "start_frame": at,
                "source_start_frame": clip.source_start_frame + delta,
                "frame_count": clip.frame_count - delta,
            })
        else:
            if not clip.start_frame < at < clip.end_frame:
                raise ValueError("Right trim frame must be strictly inside the clip.")
            layers[layer_index].clips[clip_index] = clip.model_copy(update={"frame_count": at - clip.start_frame})
    elif command.action == "move-clip":
        layer_index, clip_index, clip = find_clip()
        target = next((item for item in layers if item.id == command.target_layer_id), None)
        if target is None or command.start_frame is None:
            raise ValueError("Moving a clip requires an existing target layer and start_frame.")
        moved = clip.model_copy(update={"start_frame": command.start_frame})
        del layers[layer_index].clips[clip_index]
        target.clips.append(moved)

    return _rebuild(composition, layers)


def add_fix_clip(
    composition: VoiceComposition,
    base_layer_id: str,
    clip: VoiceCompositionClip,
    *,
    new_layer_id: str | None = None,
) -> VoiceComposition:
    """Place a fix in the first available lower layer, adding one if needed."""
    layers = [layer.model_copy(deep=True) for layer in composition.layers]
    base_index = next((i for i, layer in enumerate(layers) if layer.id == base_layer_id), None)
    if base_index is None:
        raise ValueError(f"Voice composition base layer not found: {base_layer_id}")
    if clip.end_frame > composition.duration_frames:
        raise ValueError("Fix clip exceeds the composition duration.")
    if any(existing.id == clip.id for layer in layers for existing in layer.clips):
        raise ValueError(f"Voice composition clip identifier already exists: {clip.id}")
    deepest_overlap = max((index for index in range(base_index + 1, len(layers))
                           if any(not (clip.end_frame <= existing.start_frame or existing.end_frame <= clip.start_frame)
                                  for existing in layers[index].clips)), default=base_index)
    first_candidate = max(base_index + 1, deepest_overlap + 1)
    for layer in layers[first_candidate:]:
        if all(clip.end_frame <= existing.start_frame or existing.end_frame <= clip.start_frame
               for existing in layer.clips):
            layer.clips.append(clip.model_copy(deep=True))
            return _rebuild(composition, layers)
    identifier = new_layer_id or f"fix-{uuid4().hex[:12]}"
    if not _valid_id(identifier) or any(layer.id == identifier for layer in layers):
        raise ValueError("New fix layer identifier must be valid and unique.")
    layers.append(VoiceCompositionLayer(id=identifier, name=f"Fix {len(layers)}", clips=[clip.model_copy(deep=True)]))
    return _rebuild(composition, layers)
