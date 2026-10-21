from typing import Annotated, Literal
from pydantic import ConfigDict, Field, model_validator
from app.domain.models import DomainModel

Id = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$")]
Time = Annotated[float, Field(ge=0, le=360000, allow_inf_nan=False)]


class LipSyncModel(DomainModel):
    model_config = ConfigDict(extra="forbid")


class LipSyncRange(LipSyncModel):
    start: Time = 0
    end: Time

    @model_validator(mode="after")
    def ordered(self):
        if self.end <= self.start:
            raise ValueError("Khoảng thời gian cần end > start.")
        return self


class LipSyncScope(LipSyncModel):
    mode: Literal["visible", "placed", "source"] = "visible"
    all_layers: bool | None = None
    layer_ids: list[Id] = Field(default_factory=list, max_length=100)
    range: LipSyncRange | None = None


class LipSyncLayer(LipSyncModel):
    id: Id
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = True


class LipSyncClip(LipSyncModel):
    id: Id
    asset_id: Id
    layer_id: Id
    start: Time = 0
    in_point: Time = 0
    out_point: Time

    @model_validator(mode="after")
    def ordered(self):
        if self.out_point - self.in_point < 0.099999:
            raise ValueError("Clip cần ít nhất 0.1 giây nguồn.")
        return self


class LipSyncAudio(LipSyncModel):
    output_id: Id
    start: Time = 0
    in_point: Time = 0
    out_point: Time

    @model_validator(mode="after")
    def ordered(self):
        if self.out_point - self.in_point < 0.099999:
            raise ValueError("Voice cần ít nhất 0.1 giây nguồn.")
        return self


class LipSyncDocument(LipSyncModel):
    version: Literal[1] = 1
    revision: int = Field(default=0, ge=0)
    layers: list[LipSyncLayer] = Field(default_factory=list, max_length=100)
    clips: list[LipSyncClip] = Field(default_factory=list, max_length=2000)
    audio: LipSyncAudio | None = None
    engine_id: str | None = Field(default=None, max_length=80)
    engine_settings: dict[str, dict] = Field(default_factory=dict, max_length=10)
    detection_scope: LipSyncScope = Field(default_factory=LipSyncScope)
    sync_scope: LipSyncScope = Field(default_factory=LipSyncScope)

    @model_validator(mode="after")
    def linked(self):
        layer_ids = {layer.id for layer in self.layers}
        if len(layer_ids) != len(self.layers) or len({clip.id for clip in self.clips}) != len(self.clips):
            raise ValueError("ID layer/clip bị trùng.")
        if any(clip.layer_id not in layer_ids for clip in self.clips):
            raise ValueError("Clip tham chiếu layer không tồn tại.")
        if any(not set(scope.layer_ids) <= layer_ids for scope in (self.detection_scope, self.sync_scope)):
            raise ValueError("Phạm vi tham chiếu layer không tồn tại.")
        return self
