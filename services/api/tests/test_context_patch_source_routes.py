from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings
from test_context_patch_source import setup_context


def test_production_context_source_reference_and_conflict_routes(tmp_path):
    project, _root, media, scripts, store, source = setup_context(tmp_path)
    original = source.read_bytes()
    app = create_app(project_repository=media.projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "app-data"))
    base = f"/api/projects/{project.id}/voice-patch/context"
    with TestClient(app) as client:
        assert client.get(base + "/source").json() == {"revision": 0, "draft": None}
        assert client.get(base + "/process").json()["processingAvailable"] is False
        payload = dict(expectedRevision=0, expectedScriptRevision=scripts.get(project.id).revision,
            assetId="asset-context", startWord=1, endWord=2)
        response = client.post(base + "/source", json=payload)
        assert response.status_code == 200, response.text
        document = response.json()
        assert document["draft"]["sourceKind"] == "media"
        assert client.post(base + "/source", json=payload).status_code == 409
        selected = client.post(base + "/select", json={"expectedRevision": 1,
            "candidateId": document["draft"]["contextCandidates"][0]["id"]})
        assert selected.status_code == 200, selected.text
        assert client.get(base + "/source").json() == selected.json()
        audio = client.get(base + "/source/audio")
        assert audio.status_code == 200 and audio.content[:4] == b"RIFF"
    assert source.read_bytes() == original
    assert store.get(project.id).revision == 2
