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
        original_words = media.get(project.id, "asset-context").words
        assert client.get(base + "/source").json() == {"revision": 0, "draft": None}
        assert client.get(base + "/process").json()["processingAvailable"] is False
        hybrid = client.get(f"/api/projects/{project.id}/voice-patch/hybrid/process")
        assert hybrid.status_code == 200 and hybrid.json()["processingAvailable"] is False
        trained = client.get(f"/api/projects/{project.id}/voice-patch/trained-media/process")
        assert trained.status_code == 200 and trained.json()["processingAvailable"] is False
        history = client.get(f"/api/projects/{project.id}/voice-patch/history")
        assert history.status_code == 200 and history.json() == {"revisions": [], "invalidCount": 0}
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
        reviewed = client.post(base + "/review", json={
            "expectedRevision": 2,
            "expectedSourceSha256": selected.json()["draft"]["sourceSha256"],
            "startFrame": selected.json()["draft"]["startFrame"],
            "endFrame": selected.json()["draft"]["endFrame"],
        })
        assert reviewed.status_code == 200, reviewed.text
        receipt = reviewed.json()["draft"]["reviewedTarget"]
        assert reviewed.json()["revision"] == 3
        assert receipt["reviewKey"] and receipt["targetWordIndices"] == [1, 2]
        assert receipt["startFrame"] == selected.json()["draft"]["startFrame"]
        assert media.get(project.id, "asset-context").words == original_words
        assert client.post(base + "/review", json={
            "expectedRevision": 3,
            "expectedSourceSha256": selected.json()["draft"]["sourceSha256"],
            "startFrame": selected.json()["draft"]["startFrame"] + 1,
            "endFrame": selected.json()["draft"]["endFrame"],
        }).status_code == 409
    assert source.read_bytes() == original
    assert store.get(project.id).revision == 3
