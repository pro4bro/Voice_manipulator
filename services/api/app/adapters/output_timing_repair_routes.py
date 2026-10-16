from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.adapters.output_timing_repair import OutputTimingRepair, OutputTimingRepairConflict
from app.domain.output_timing_repair import OutputTimingRepairApplyRequest, OutputTimingRepairStartRequest


def make_output_timing_repair_router(service: OutputTimingRepair) -> APIRouter:
    router = APIRouter(prefix="/api/projects/{project_id}/voice-outputs/{output_id}/timing-repair")

    @router.get("/plan")
    def plan(project_id: str, output_id: str):
        try:
            return service.plan(project_id, output_id)
        except KeyError as exc:
            raise HTTPException(404, "Project or Voice Output does not exist") from exc
        except (ValueError, OSError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/jobs")
    def start(project_id: str, output_id: str, request: OutputTimingRepairStartRequest):
        try:
            return service.start(project_id, output_id, request).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Project or Voice Output does not exist") from exc
        except OutputTimingRepairConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (OSError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.get("/jobs/{job_id}")
    def get_job(project_id: str, output_id: str, job_id: str):
        try:
            return service.get_job(project_id, output_id, job_id).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Timing Repair job does not exist") from exc
        except (ValueError, OSError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/jobs/{job_id}/stop")
    def stop(project_id: str, output_id: str, job_id: str):
        try:
            return service.stop(project_id, output_id, job_id).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Timing Repair job does not exist") from exc
        except (ValueError, OSError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.post("/apply")
    def apply(project_id: str, output_id: str, request: OutputTimingRepairApplyRequest):
        try:
            return service.apply(project_id, output_id, request)
        except KeyError as exc:
            raise HTTPException(404, "Timing Repair job or source output does not exist") from exc
        except OutputTimingRepairConflict as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (OSError, RuntimeError) as exc:
            raise HTTPException(400, str(exc)) from exc

    return router

