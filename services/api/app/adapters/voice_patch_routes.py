from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.file_voice_patch import FileVoicePatch
from app.domain.voice_patch import VoicePatchTransferRequest


def make_voice_patch_router(store: FileVoicePatch) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-patch")

    @router.get("/source")
    def get_source(project_id: str):
        try:
            return store.get(project_id).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Project or Voice Patch source does not exist") from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/source")
    def transfer(project_id: str, request: VoicePatchTransferRequest):
        try:
            return store.transfer(project_id, request).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Project or source Voice Output does not exist") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except (OSError, RuntimeError) as exc:
            raise HTTPException(400, str(exc)) from exc

    return router
