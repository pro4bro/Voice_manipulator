from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import Field

from app.adapters.context_patch_source import ContextPatchTransferRequest
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.domain.models import DomainModel


class ContextSelection(DomainModel):
    expected_revision: int = Field(ge=0)
    candidate_id: str = Field(min_length=1, max_length=100)


class ContextTargetReview(DomainModel):
    expected_revision: int = Field(ge=0)
    expected_source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    start_frame: int = Field(ge=0)
    end_frame: int = Field(gt=0)


def make_context_patch_source_router(store) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-patch/context")

    @router.get("/source")
    def get(project_id: str):
        try:
            return store.get(project_id).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Project or source media is missing") from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/source")
    def transfer(project_id: str, body: ContextPatchTransferRequest):
        try:
            return store.transfer(project_id, body).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Project or source media is missing") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/select")
    def select(project_id: str, body: ContextSelection):
        try:
            return store.select_context(project_id, body.expected_revision, body.candidate_id).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Source or reference candidate is missing") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/review")
    def review(project_id: str, body: ContextTargetReview):
        try:
            return store.review_target(project_id, body.expected_revision, body.expected_source_sha256,
                body.start_frame, body.end_frame).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Source media is missing") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get("/source/audio")
    def selected_audio(project_id: str):
        try:
            document = store.get(project_id)
            captured = store.validate(project_id, document.revision, require_review=False)
            return FileResponse(captured["context"]["audio_path"], media_type="audio/wav", filename="patch-context.wav")
        except (KeyError, ValueError, OSError) as exc:
            raise HTTPException(409, "Selected reference is missing or stale; select it again") from exc

    return router
