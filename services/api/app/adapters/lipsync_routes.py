from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.domain.lipsync_settings import resolve_lipsync_settings
from app.domain.lipsync import LipSyncDocument
from app.adapters.file_lipsync import FileLipSync
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.domain.lipsync_coverage import coverage
from app.adapters.lipsync_preflight import prepare_lipsync
from app.adapters.lipsync_runtime import LipSyncRuntime
from app.adapters.lipsync_jobs import LipSyncJobs
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.gpu_lease import GpuBusy
from app.domain.lipsync_faces import FaceReview
from fastapi.responses import FileResponse
from pathlib import Path
from typing import Literal
from fastapi import Depends, Query
from app.adapters.file_lipsync_sessions import FileLipSyncSessions
from app.domain.lipsync_sessions import LipSyncVersionState


class SettingsRequest(BaseModel):
    parameters: dict = Field(default_factory=dict)


class JobRequest(BaseModel):
    kind: Literal["analysis", "render"]
    revision: int = Field(ge=0)
    analysis_id: str | None = Field(default=None, alias="analysisId")
    analysis_revision: int | None = Field(default=None, alias="analysisRevision")


class SessionRequest(BaseModel):
    revision: int = Field(ge=0)
    name: str | None = Field(default=None, min_length=1, max_length=120)


class VersionRequest(SessionRequest):
    source_id: str = Field(alias="sourceId")
    source_revision: int = Field(alias="sourceRevision", ge=0)


class SelectionRequest(BaseModel):
    revision: int = Field(ge=0)
    version_id: str = Field(alias="versionId")


def lipsync_router(catalog, projects, media, outputs, *, runtime_root=None, gpu_lease=None):
    router = APIRouter()
    store = FileLipSync(projects, media, outputs, catalog)
    runtime = LipSyncRuntime(runtime_root or Path(__file__).resolve().parents[4])
    jobs = LipSyncJobs(store, runtime, FileTrainingCatalog(projects), gpu_lease)
    sessions = FileLipSyncSessions(store)
    contexts = {}

    def checked(action):
        try:
            return action()
        except (ScriptRevisionConflict, GpuBusy) as exc:
            raise HTTPException(409, str(exc))
        except (KeyError, FileNotFoundError):
            raise HTTPException(404, "Không có project/job/khuôn mặt")
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, str(exc))

    def context(project_id: str, version_id: str | None = Query(default=None, alias="versionId")):
        if version_id is None:
            return store, jobs
        def resolve():
            with store._lock:
                scoped = sessions.scoped(project_id, version_id)
                key = (project_id, version_id)
                if key not in contexts:
                    processor = LipSyncJobs(scoped, runtime, FileTrainingCatalog(projects), gpu_lease)
                    if version_id == "legacy":
                        processor.active = jobs.active
                    contexts[key] = scoped, processor
                return contexts[key]
        return checked(resolve)

    @router.get("/api/projects/{project_id}/lipsync/sessions")
    def get_sessions(project_id: str):
        return checked(lambda: sessions.get(project_id))

    @router.post("/api/projects/{project_id}/lipsync/sessions")
    def create_session(project_id: str, request: SessionRequest):
        return checked(lambda: sessions.create_session(project_id, request.revision, request.name))

    @router.post("/api/projects/{project_id}/lipsync/versions")
    def create_version(project_id: str, request: VersionRequest):
        return checked(lambda: sessions.create_version(project_id, request.revision, request.source_id, request.source_revision, request.name))

    @router.put("/api/projects/{project_id}/lipsync/selection")
    def select_version(project_id: str, request: SelectionRequest):
        return checked(lambda: sessions.select(project_id, request.revision, request.version_id))

    @router.get("/api/projects/{project_id}/lipsync/state", response_model=LipSyncVersionState)
    def get_state(project_id: str, ctx=Depends(context)):
        return checked(lambda: ctx[0].get_state(project_id))

    @router.put("/api/projects/{project_id}/lipsync/state", response_model=LipSyncVersionState)
    def save_state(project_id: str, state: LipSyncVersionState, ctx=Depends(context)):
        return checked(lambda: ctx[0].save_state(project_id, state))

    @router.get("/api/lipsync/runtime")
    def runtime_report():
        return {"analysis": runtime.report(analysis=True), "render": runtime.report()}

    @router.get("/api/projects/{project_id}/lipsync/jobs")
    def list_jobs(project_id: str, ctx=Depends(context)):
        store, jobs = ctx
        return checked(lambda: jobs.list(project_id))

    @router.post("/api/projects/{project_id}/lipsync/jobs")
    def start_job(project_id: str, request: JobRequest, ctx=Depends(context)):
        store, jobs = ctx
        return checked(lambda: jobs.start(project_id, request.kind, request.revision, request.analysis_id, request.analysis_revision))

    @router.post("/api/projects/{project_id}/lipsync/jobs/{job_id}/cancel")
    def cancel_job(project_id: str, job_id: str, ctx=Depends(context)):
        store, jobs = ctx
        return checked(lambda: jobs.cancel(project_id, job_id))

    @router.get("/api/projects/{project_id}/lipsync/jobs/{job_id}/log")
    def job_log(project_id: str, job_id: str, ctx=Depends(context)):
        store, jobs = ctx
        def read():
            jobs.get(project_id, job_id)
            path = jobs.faces.directory(project_id, job_id) / "worker.log"
            if not path.is_file():
                return {"text": ""}
            with path.open("rb") as stream:
                stream.seek(max(0, path.stat().st_size - 16000))
                return {"text": stream.read().decode("utf-8", errors="replace")}
        return checked(read)

    @router.get("/api/projects/{project_id}/lipsync/faces/{analysis_id}")
    def face_gallery(project_id: str, analysis_id: str, ctx=Depends(context)):
        store, jobs = ctx
        def read():
            analysis, review = jobs.faces.get(project_id, analysis_id)
            return {"analysisId": analysis_id, "sampledFrames": analysis["sampledFrames"], "sampleInterval": analysis["sampleInterval"],
                    "observations": [{k: v for k, v in o.items() if k not in ("embedding", "thumbnail")} for o in analysis["observations"]],
                    "review": review.model_dump(by_alias=True)}
        return checked(read)

    @router.put("/api/projects/{project_id}/lipsync/faces/{analysis_id}")
    def save_face_review(project_id: str, analysis_id: str, review: FaceReview, ctx=Depends(context)):
        store, jobs = ctx
        def save():
            if review.analysis_id != analysis_id:
                raise ValueError("Sai analysis ID")
            return jobs.faces.save(project_id, review)
        return checked(save)

    @router.get("/api/projects/{project_id}/lipsync/faces/{analysis_id}/{observation_id}/thumbnail")
    def face_thumbnail(project_id: str, analysis_id: str, observation_id: str, ctx=Depends(context)):
        store, jobs = ctx
        return checked(lambda: FileResponse(jobs.faces.thumbnail(project_id, analysis_id, observation_id), media_type="image/jpeg"))

    @router.get("/api/projects/{project_id}/lipsync/render-plan/{analysis_id}")
    def render_plan(project_id: str, analysis_id: str, ctx=Depends(context)):
        store, jobs = ctx
        return checked(lambda: jobs.plan(project_id, analysis_id))

    @router.get("/api/projects/{project_id}/lipsync/jobs/{job_id}/video")
    def render_video(project_id: str, job_id: str, ctx=Depends(context)):
        store, jobs = ctx
        return render_artifact(project_id, job_id, 0, ctx)

    @router.get("/api/projects/{project_id}/lipsync/jobs/{job_id}/artifacts/{index}")
    def render_artifact(project_id: str, job_id: str, index: int, ctx=Depends(context)):
        store, jobs = ctx
        def read():
            import json
            state = jobs.get(project_id, job_id)
            if state["kind"] != "render" or state["status"] != "completed":
                raise ValueError("Chưa có output đã qua QC")
            directory = jobs.faces.directory(project_id, job_id)
            result = json.loads((directory / "result.json").read_text(encoding="utf-8"))
            if result.get("qc", {}).get("structuralPassed") is not True:
                raise ValueError("Output chưa qua QC cấu trúc")
            artifacts = result["qc"]["artifacts"]
            if index < 0 or index >= len(artifacts):
                raise KeyError("Unknown output")
            artifact = artifacts[index]
            path = (store.root(project_id) / artifact["path"]).resolve()
            if not path.is_relative_to(directory.resolve()) or not path.is_file():
                raise KeyError("Missing output")
            if path.stat().st_size != artifact["bytes"] or artifact.get("mtimeNs", path.stat().st_mtime_ns) != path.stat().st_mtime_ns:
                raise ValueError("Output đổi sau QC; chạy lại job")
            return FileResponse(path, media_type="video/mp4")
        return checked(read)

    @router.post("/api/projects/{project_id}/lipsync/preflight")
    def prepare(project_id: str, document: LipSyncDocument, ctx=Depends(context)):
        store, jobs = ctx
        try:
            return prepare_lipsync(store, project_id, document)
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc))
        except KeyError:
            raise HTTPException(404, "Không có project/source/engine.")
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    @router.post("/api/projects/{project_id}/lipsync/coverage")
    def inspect_coverage(project_id: str, document: LipSyncDocument, ctx=Depends(context)):
        store, jobs = ctx
        try:
            assets = store.validate_sources(project_id, document)
            return {"detection": coverage(document, assets, document.detection_scope),
                    "sync": coverage(document, assets, document.sync_scope, "sync")}
        except KeyError:
            raise HTTPException(404, "Không có project/source/engine.")
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    @router.get("/api/projects/{project_id}/lipsync", response_model=LipSyncDocument)
    def get_document(project_id: str, ctx=Depends(context)):
        store, jobs = ctx
        try:
            return store.get(project_id)
        except KeyError:
            raise HTTPException(404, "Không có project.")

    @router.put("/api/projects/{project_id}/lipsync", response_model=LipSyncDocument)
    def save_document(project_id: str, document: LipSyncDocument, ctx=Depends(context)):
        store, jobs = ctx
        try:
            return store.save(project_id, document)
        except ScriptRevisionConflict as exc:
            raise HTTPException(409, str(exc))
        except KeyError:
            raise HTTPException(404, "Không có project/source/engine.")
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    @router.post("/api/lipsync/engines/{engine_id}/settings")
    def settings(engine_id: str, request: SettingsRequest):
        try:
            return resolve_lipsync_settings(catalog.get(engine_id), request.parameters)
        except KeyError:
            raise HTTPException(404, "Không có engine LipSync này.")
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    return router
