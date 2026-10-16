from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.voice_patch_processor import VoicePatchProcessor
from app.domain.voice_patch_jobs import VoicePatchApplyRequest, VoicePatchJobRequest


def make_voice_patch_job_router(service: VoicePatchProcessor) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-patch")

    @router.get("/process")
    def plan(project_id: str):
        try:
            return service.plan(project_id)
        except KeyError as exc:
            raise HTTPException(404, "Project or Voice Patch draft does not exist") from exc
        except (ValueError, OSError, RuntimeError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/jobs")
    def start(project_id: str, request: VoicePatchJobRequest):
        try:
            return service.start(project_id, request).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Project, source Voice Output, or selected voice does not exist") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except (OSError, RuntimeError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get("/jobs/{job_id}")
    def get_job(project_id: str, job_id: str):
        try:
            return service.get_job(project_id, job_id).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Voice Patch job does not exist") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except (ValueError, OSError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/jobs/{job_id}/stop")
    def stop(project_id: str, job_id: str, body: dict | None = None):
        include_active = bool(body and body.get("includeActive", False))
        try:
            return service.stop(project_id, job_id, include_active=include_active).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Voice Patch job does not exist") from exc

    @router.get("/jobs/{job_id}/audio")
    def audio(project_id: str, job_id: str, kind: str = "composite"):
        try:
            job = service.get_job(project_id, job_id)
            if job.status != "complete":
                raise KeyError(job_id)
            path = service.preview_path(project_id, job_id, kind)
            service._verify_artifacts(job)
            filename = "voice-patch-replacement.wav" if kind == "replacement" else "voice-patch-preview.wav"
            return FileResponse(path, media_type="audio/wav", filename=filename)
        except KeyError as exc:
            raise HTTPException(404, "Current Voice Patch preview does not exist") from exc
        except (ValueError, OSError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/apply")
    def apply(project_id: str, request: VoicePatchApplyRequest):
        try:
            return service.apply(project_id, request)
        except KeyError as exc:
            raise HTTPException(404, "Voice Patch job or source does not exist") from exc
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (OSError, RuntimeError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.get("/applied")
    def applied(project_id: str):
        try:
            return service.latest(project_id)
        except KeyError as exc:
            raise HTTPException(404, "No current applied Voice Patch exists") from exc
        except (ValueError, OSError, RuntimeError, TypeError) as exc:
            raise HTTPException(404, "No valid applied Voice Patch exists") from exc

    return router

