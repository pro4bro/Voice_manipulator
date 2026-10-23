import asyncio

from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.testclient import TestClient

from app.adapters.activity_center import CENTER
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.project_operation_activity import ProjectOperationActivity
from app.domain.models import ProjectCreate


def test_import_and_download_are_recorded_and_failures_are_not_done(tmp_path):
    CENTER.reset()
    projects = FileProjectRepository(tmp_path)
    project = projects.create(ProjectCreate(name="Queue"))
    CENTER.configure_history(projects)
    app = FastAPI()
    app.add_middleware(ProjectOperationActivity, projects=projects, media=FileMediaLibrary(projects), delay=.001)

    @app.post("/api/projects/{project_id}/media/import-local")
    async def imported(project_id: str):
        tasks = CENTER.project_tasks(project_id)
        assert tasks[-1].kind == "import" and tasks[-1].status == "running"
        return {"asset": {"id": "footage", "name": "original.mkv"}}

    @app.get("/api/projects/{project_id}/download")
    async def download(project_id: str):
        return Response(b"wave", media_type="audio/wav")

    @app.post("/api/projects/{project_id}/slow")
    async def slow(project_id: str):
        await asyncio.sleep(.03)
        return Response(status_code=503)

    with TestClient(app) as client:
        assert client.post(f"/api/projects/{project.id}/media/import-local").status_code == 200
        assert client.get(f"/api/projects/{project.id}/download", headers={"X-Queue-Export": "1"}).content == b"wave"
        assert client.get(f"/api/projects/{project.id}/download?queue_export=1").content == b"wave"
        assert client.post(f"/api/projects/{project.id}/slow").status_code == 503
    tasks = CENTER.project_tasks(project.id)
    assert [(t.kind, t.status) for t in tasks] == [("import", "complete"), ("export", "complete"), ("export", "complete"), ("other", "failed")]
    assert tasks[0].asset_id == tasks[0].footage_id == "footage"
    assert tasks[0].label == "original.mkv"
    CENTER.reset()


def test_native_processor_activity_prevents_duplicate_slow_request_task(tmp_path):
    CENTER.reset()
    projects = FileProjectRepository(tmp_path)
    project = projects.create(ProjectCreate(name="Queue"))
    CENTER.configure_history(projects)
    app = FastAPI()
    app.add_middleware(ProjectOperationActivity, projects=projects, media=FileMediaLibrary(projects), delay=.001)

    @app.post("/api/projects/{project_id}/generate")
    async def generate(project_id: str):
        task = CENTER.start_task("tts", "Speech", project_id=project_id)
        await asyncio.sleep(.03)
        CENTER.finish_task(task)
        return {}

    with TestClient(app) as client:
        assert client.post(f"/api/projects/{project.id}/generate").status_code == 200
    assert [task.kind for task in CENTER.project_tasks(project.id)] == ["tts"]
    CENTER.reset()
