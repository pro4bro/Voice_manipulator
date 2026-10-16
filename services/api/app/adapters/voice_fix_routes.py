from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.adapters.voice_fix import VoiceFixService
from app.domain.voice_fix import VoiceFixRequest, VoiceFixStopRequest


def make_voice_fix_router(service: VoiceFixService) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-outputs/{output_id}/fix")

    @router.get("")
    def plan(project_id: str, output_id: str):
        try:
            return service.plan(project_id, output_id).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Project or Voice Output does not exist") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except OSError as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/jobs")
    def start(project_id: str, output_id: str, request: VoiceFixRequest):
        try:
            return service.start(project_id, output_id, request.expected_script_revision,
                request.expected_edit_revision, request.expected_key, request.parameters).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Project or Voice Output does not exist") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except OSError as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get("/jobs/{job_id}")
    def get_job(project_id: str, output_id: str, job_id: str):
        try:
            return service.get_job(project_id, output_id, job_id).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Fix job does not exist") from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/jobs/{job_id}/stop")
    def stop(project_id: str, output_id: str, job_id: str, request: VoiceFixStopRequest):
        try:
            return service.stop(project_id, output_id, job_id, include_active=request.include_active).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Fix job does not exist") from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(409, str(exc)) from exc

    return router
