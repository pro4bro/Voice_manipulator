from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.voice_fix_apply import VoiceFixApply
from app.domain.models import DomainModel
from pydantic import Field


class VoiceFixApplyRequest(DomainModel):
    expected_script_revision: int = Field(ge=0)
    expected_edit_revision: int = Field(ge=0)
    expected_key: str = Field(pattern=r"^[a-f0-9]{64}$")


def make_voice_fix_apply_router(service: VoiceFixApply) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-outputs/{output_id}/fix")

    @router.post("/apply")
    def apply(project_id: str, output_id: str, request: VoiceFixApplyRequest):
        try:
            return service.apply(project_id, output_id, request.expected_script_revision,
                request.expected_edit_revision, request.expected_key)
        except KeyError as exc:
            raise HTTPException(404, "Project, Voice Output, or Fix cache does not exist") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (OSError, RuntimeError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get("/applied")
    def latest(project_id: str, output_id: str):
        try:
            return service.latest(project_id, output_id)
        except KeyError as exc:
            raise HTTPException(404, "No current applied Fix exists") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(404, "No current applied Fix exists") from exc
        except (ValueError, OSError, RuntimeError, TypeError) as exc:
            raise HTTPException(404, "No valid applied Fix exists") from exc

    return router
