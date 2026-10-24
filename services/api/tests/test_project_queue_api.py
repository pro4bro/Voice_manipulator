from dataclasses import replace
import os

from fastapi.testclient import TestClient

from app.adapters.activity_center import CENTER
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_training_runs import FileTrainingRuns
from app.main import create_app
from app.domain.models import TrainingProgressLine, TrainingRunConfig
from app.settings import Settings


def test_reserved_imports_are_visible_before_upload_and_history_survives_reopen(tmp_path):
    CENTER.reset()
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    with TestClient(create_app(settings=settings)) as client:
        project = client.post("/api/projects", json={"name": "Queue fixture"}).json()
        url = f"/api/projects/{project['id']}/queue"
        tasks = [{"id": "import-first", "label": "one.wav"}, {"id": "import-second", "label": "two.mkv"}]
        assert client.post(url + "/imports", json={"tasks": tasks}).status_code == 200
        assert [task["status"] for task in client.get(url).json()["tasks"]] == ["queued", "queued"]
        assert client.post(url + "/imports", json={"tasks": tasks}).status_code == 409
        # Invalid source fails the same attempt, never creates a duplicate or Done.
        response = client.post(f"/api/projects/{project['id']}/media/import-local",
            headers={"X-Queue-Task-Id": "import-first"}, json={"sourcePath": str(tmp_path / "missing.wav"), "cacheLocal": False})
        assert response.status_code >= 400
        receipts = client.get(url).json()["tasks"]
        assert len(receipts) == 2
        assert {task["id"]: task["status"] for task in receipts} == {"import-first": "failed", "import-second": "queued"}
        assert client.post(f"/api/projects/{project['id']}/media/import-local",
            headers={"X-Queue-Task-Id": "import-first"}, json={}).status_code == 409
        assert client.get("/api/projects/missing/queue").status_code == 404
    CENTER.reset()
    with TestClient(create_app(settings=settings)) as reopened:
        assert reopened.get(url).json()["tasks"] == receipts
    CENTER.reset()


def test_project_queue_prefers_live_training_run_over_stale_done_receipt(tmp_path):
    CENTER.reset()
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    projects = FileProjectRepository(settings.data_root / "projects")
    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        project = client.post("/api/projects", json={"name": "Training queue reconciliation"}).json()
        runs = FileTrainingRuns(projects)
        run = runs.create(project["id"], "manifest", config=TrainingRunConfig(steps=400))
        run = runs.update(project["id"], run.model_copy(update={
            "status": "running", "process_id": os.getpid(), "step_id": "train", "global_step": 400,
        }))
        runs.append_progress(project["id"], run.id,
            TrainingProgressLine(step_id="train", global_step=400, done=400, total=400))
        CENTER.start_task("training", "Training · voice", task_id=f"training:{run.id}",
            project_id=project["id"], fraction=1.0)
        CENTER.finish_task(f"training:{run.id}", status="complete")

    # A queue reconnect must reconstruct the live projection from run.json,
    # even though the persisted task receipt says Done.
    CENTER.reset()
    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        queued = client.get(f"/api/projects/{project['id']}/queue").json()["tasks"]

    training = next(task for task in queued if task["kind"] == "training")
    assert training["id"] == f"training:{run.id}"
    assert training["status"] == "running"
    assert training["fraction"] == 0.96
    CENTER.reset()


def test_project_queue_uses_terminal_training_run_status_not_done_receipt(tmp_path):
    for status in ("failed", "cancelled", "interrupted"):
        CENTER.reset()
        settings = replace(Settings.from_env(), data_root=tmp_path / status)
        projects = FileProjectRepository(settings.data_root / "projects")
        with TestClient(create_app(project_repository=projects, settings=settings)) as client:
            project = client.post("/api/projects", json={"name": f"Training {status}"}).json()
            runs = FileTrainingRuns(projects)
            run = runs.create(project["id"], "manifest")
            runs.update(project["id"], run.model_copy(update={"status": status, "process_id": None}))
            CENTER.start_task("training", "Training · voice", task_id=f"training:{run.id}",
                project_id=project["id"], fraction=1.0)
            CENTER.finish_task(f"training:{run.id}", status="complete")

            queued = client.get(f"/api/projects/{project['id']}/queue").json()["tasks"]

        training = next(task for task in queued if task["kind"] == "training")
        assert training["status"] == status
        CENTER.reset()


def test_project_queue_marks_training_interrupted_when_process_disappears(tmp_path):
    CENTER.reset()
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    projects = FileProjectRepository(settings.data_root / "projects")
    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        project = client.post("/api/projects", json={"name": "Training disappeared"}).json()
        runs = FileTrainingRuns(projects)
        run = runs.create(project["id"], "manifest", config=TrainingRunConfig(steps=400))
        runs.update(project["id"], run.model_copy(update={
            "status": "running", "process_id": 999_999_999, "step_id": "train", "global_step": 320,
        }))
        CENTER.start_task("training", "Training · voice", task_id=f"training:{run.id}",
            project_id=project["id"], fraction=0.798)

        queued = client.get(f"/api/projects/{project['id']}/queue").json()["tasks"]

    training = next(task for task in queued if task["kind"] == "training")
    assert training["status"] == "interrupted"
    assert training["fraction"] == 0.798
    CENTER.reset()
