from typing import Annotated, Literal
import wave
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, model_validator
from app.adapters.subtitle_alignment import AlignmentConflict

Index = Annotated[int, Field(strict=True, ge=0)]
MethodMode = Literal["auto", "offset", "common-offset", "edge-offset", "group-offset", "ctc", "waveform", "diagnose"]


class ProposalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    mode: MethodMode = "auto"
    start_offset_ms: StrictFloat = Field(default=0, alias="startOffsetMs", ge=-2000, le=2000)
    end_offset_ms: StrictFloat = Field(default=0, alias="endOffsetMs", ge=-2000, le=2000)
    indexes: list[Index] | None = None


class ReviewedEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    index: int = Field(ge=0, strict=True)
    start: StrictFloat = Field(ge=0)
    end: StrictFloat = Field(gt=0)
    reviewed: StrictBool


class ApplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    indexes: list[Index] = Field(min_length=1)
    edits: list[ReviewedEdit] = Field(default_factory=list)


class RefinementMethod(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    mode: MethodMode
    start_offset_ms: StrictFloat = Field(default=0, alias="startOffsetMs", ge=-2000, le=2000)
    end_offset_ms: StrictFloat = Field(default=0, alias="endOffsetMs", ge=-2000, le=2000)
    strength: StrictFloat = Field(default=100, ge=0, le=100)
    max_move_ms: StrictFloat = Field(default=2000, alias="maxMoveMs", ge=0, le=2000)


class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    methods: list[RefinementMethod] = Field(min_length=1, max_length=8)
    indexes: list[Index] | None = None


class EngineSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    language: Literal["vi", "en"] = "vi"


class MfaSettings(EngineSettings):
    beam: StrictInt = Field(default=10, ge=1, le=100)
    retryBeam: StrictInt = Field(default=40, ge=1, le=200)

    @model_validator(mode="after")
    def beams(self):
        if self.retryBeam < self.beam:
            raise ValueError("Retry beam phải lớn hơn hoặc bằng beam.")
        return self


class StableSettings(EngineSettings):
    model: Literal["tiny", "base", "small", "medium", "large-v3"] = "base"
    refine: StrictBool = True
    precision: StrictFloat = Field(default=.1, ge=.02, le=.5)
    maxWordDuration: StrictFloat = Field(default=3, ge=.1, le=10)
    windowSeconds: StrictFloat = Field(default=20, ge=2, le=30)


class EasySettings(EngineSettings):
    windowSeconds: StrictFloat = Field(default=20, ge=2, le=30)
    paddingSeconds: StrictFloat = Field(default=.5, ge=0, le=2)


class EnginePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    engineId: Literal["mfa", "stable-ts", "easyaligner"]
    settings: dict = Field(default_factory=dict)
    maxMoveMs: StrictFloat = Field(default=2000, ge=0, le=2000)
    methods: list[RefinementMethod] = Field(default_factory=list, max_length=8)
    indexes: list[Index] | None = None

    @model_validator(mode="after")
    def engine_settings(self):
        cls = {"mfa": MfaSettings, "stable-ts": StableSettings, "easyaligner": EasySettings}[self.engineId]
        self.settings = cls.model_validate(self.settings).model_dump()
        if len({method.mode for method in self.methods}) != len(self.methods):
            raise ValueError("Chọn phương pháp không trùng nhau.")
        return self


def subtitle_alignment_router(store):
    router = APIRouter(prefix="/api/projects/{project_id}/media/{asset_id}/subtitle-alignment")

    def checked(action):
        try:
            return action()
        except AlignmentConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except (KeyError, FileNotFoundError) as exc:
            raise HTTPException(404, "Không có footage/audio/đề xuất căn chỉnh.") from exc
        except (ValueError, TypeError, wave.Error, EOFError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @router.post("/proposals")
    def analyze(project_id: str, asset_id: str, payload: ProposalRequest):
        return checked(lambda: store.analyze(project_id, asset_id, **payload.model_dump()))

    @router.get("/latest")
    def latest(project_id: str, asset_id: str):
        return checked(lambda: store.latest(project_id, asset_id))

    @router.post("/preview")
    def preview(project_id: str, asset_id: str, payload: PreviewRequest):
        return checked(lambda: store.analyze(project_id, asset_id, mode="pipeline", indexes=payload.indexes,
            methods=[method.model_dump() for method in payload.methods]))

    @router.get("/engines")
    def engines(project_id: str, asset_id: str):
        def catalog():
            store.media.get(project_id, asset_id)
            return store.engines.catalog()
        return checked(catalog)

    @router.post("/engine-preview")
    def engine_preview(project_id: str, asset_id: str, payload: EnginePreviewRequest):
        return checked(lambda: store.analyze_engine(project_id, asset_id, engine=payload.engineId,
            settings=payload.settings, max_move_ms=payload.maxMoveMs, indexes=payload.indexes,
            methods=[method.model_dump() for method in payload.methods]))

    @router.post("/{identity}/apply-preview")
    def apply_preview(project_id: str, asset_id: str, identity: str):
        return checked(lambda: store.apply_preview(project_id, asset_id, identity))

    @router.post("/{identity}/apply")
    def apply(project_id: str, asset_id: str, identity: str, payload: ApplyRequest):
        return checked(lambda: store.apply(project_id, asset_id, identity, payload.indexes,
                                          [edit.model_dump() for edit in payload.edits]))

    @router.post("/{identity}/restore")
    def restore(project_id: str, asset_id: str, identity: str):
        return checked(lambda: store.restore(project_id, asset_id, identity))

    return router
