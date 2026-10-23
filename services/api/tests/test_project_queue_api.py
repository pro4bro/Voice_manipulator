from dataclasses import replace

from fastapi.testclient import TestClient

from app.adapters.activity_center import CENTER
from app.main import create_app
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
