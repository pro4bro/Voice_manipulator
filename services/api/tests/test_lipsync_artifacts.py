import json
from uuid import uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_lipsync_document import setup
from app.adapters.lipsync_routes import lipsync_router


def test_only_completed_unchanged_qc_artifacts_are_range_served(tmp_path):
    projects, project, media, _, store, _ = setup(tmp_path)
    identifier = str(uuid4())
    directory = store.root(project.id) / "jobs/lipsync" / identifier
    directory.mkdir(parents=True)
    path = directory / "after.mp4"
    path.write_bytes(b"route fixture, not a decodable output")
    state = {"id": identifier, "kind": "render", "status": "running", "ownerPid": 0}
    result = {"qc": {"structuralPassed": True, "artifacts": [{"path": path.relative_to(store.root(project.id)).as_posix(), "bytes": path.stat().st_size, "mtimeNs": path.stat().st_mtime_ns}]}}
    def save():
        (directory / "status.json").write_text(json.dumps(state))
        (directory / "result.json").write_text(json.dumps(result))
    app = FastAPI()
    app.include_router(lipsync_router(store.catalog, projects, media, store.outputs, runtime_root=tmp_path))
    client = TestClient(app)
    url = f"/api/projects/{project.id}/lipsync/jobs/{identifier}"
    save()
    assert client.get(url + "/video").status_code == 422
    state["status"] = "completed"
    save()
    response = client.get(url + "/video", headers={"Range": "bytes=0-4"})
    assert response.status_code == 206 and response.content == b"route"
    assert client.get(url + "/artifacts/-1").status_code == 404
    path.write_bytes(b"edited after QC")
    assert client.get(url + "/video").status_code == 422
    result["qc"]["artifacts"][0]["path"] = "../../external.mp4"
    save()
    assert client.get(url + "/artifacts/0").status_code == 404
