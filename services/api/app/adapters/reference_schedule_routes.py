from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.adapters.file_reference_schedules import FileReferenceSchedules
from app.domain.reference_schedule import ReferenceScheduleApplyRequest, ReferenceScheduleRequest


def make_reference_schedule_router(bindings, scripts):
    router = APIRouter(prefix="/api/projects/{project_id}/reference-schedules")
    store = FileReferenceSchedules(bindings, scripts)

    @router.get("")
    def get(project_id: str):
        try:
            return store.get(project_id).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Project or binding does not exist") from exc
        except (OSError, ValueError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("/preview")
    def preview(project_id: str, request: ReferenceScheduleRequest):
        try:
            return store.preview(project_id, request).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Reference binding does not exist") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except OSError as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.post("")
    def apply(project_id: str, request: ReferenceScheduleApplyRequest):
        try:
            return store.apply(project_id, request).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Reference binding does not exist") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except OSError as exc:
            raise HTTPException(400, str(exc)) from exc

    @router.delete("/{binding_id}")
    def delete(project_id: str, binding_id: str, expected_revision: int):
        try:
            return store.delete(project_id, binding_id, expected_revision).model_dump(mode="json", by_alias=True)
        except KeyError as exc:
            raise HTTPException(404, "Reference schedule does not exist") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except OSError as exc:
            raise HTTPException(400, str(exc)) from exc

    return router
