from dataclasses import replace
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.adapters.voice_fix import VoiceFixService
from app.adapters.voice_fix_routes import make_voice_fix_router
from app.settings import Settings
from test_voice_fix import setup_fix, wait_job


def test_http_fix_snapshot_jobs_and_saved_replay(tmp_path):
    project, outputs, _, speaker, scripts, edits, output, engine = setup_fix(tmp_path)
    original = outputs.audio_path(project.id, output.id).read_bytes()
    doc = scripts.get(project.id)
    doc.rows[0].text = "Chào ngày mới"
    scripts.save(project.id, doc)
    service = VoiceFixService(speaker, edits)
    app = FastAPI(); app.include_router(make_voice_fix_router(service))
    endpoint = f"/api/projects/{project.id}/voice-outputs/{output.id}/fix"
    with TestClient(app) as client:
        plan = client.get(endpoint).json()
        assert plan["dirtyCount"] == 1
        payload = dict(expectedScriptRevision=plan["scriptRevision"], expectedEditRevision=plan["editRevision"], expectedKey=plan["key"])
        assert client.post(endpoint + "/jobs", json={**payload, "expectedScriptRevision": 0}).status_code == 409
        start = client.post(endpoint + "/jobs", json=payload)
        assert start.status_code == 200, start.text
        job = wait_job(service, project.id, output.id, start.json()["id"])
        assert job.status == "complete"
        assert client.get(endpoint + "/jobs/" + job.id).json()["done"] == 1
        replay = client.get(endpoint).json()
        assert replay["dirtyCount"] == 0 and replay["latestJob"]["id"] == job.id
    assert len(engine.spoken) == 3 and outputs.audio_path(project.id, output.id).read_bytes() == original
    service.close()


def test_production_app_registers_fix_and_can_close_without_owned_jobs(tmp_path):
    from app.main import create_app
    project, _, _, speaker, _, _, output, _ = setup_fix(tmp_path)
    app = create_app(project_repository=speaker.projects, settings=replace(Settings.from_env(), data_root=tmp_path / "app-data"))
    with TestClient(app) as client:
        response = client.get(f"/api/projects/{project.id}/voice-outputs/{output.id}/fix")
        assert response.status_code == 200, response.text
        assert "blockers" in response.json()  # A unavailable production generator stays an explicit blocker.
