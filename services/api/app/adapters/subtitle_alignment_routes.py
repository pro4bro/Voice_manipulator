from typing import Annotated, Literal
import wave
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat
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
