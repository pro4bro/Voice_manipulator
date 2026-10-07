from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.omnivoice_generator import VoiceGenerationCancelled
from app.adapters.processing_cancellation import ProcessingStopError
from app.domain.models import ProjectCreate, VoiceScriptJob
from app.main import create_app
from app.settings import Settings


@pytest.fixture
def stop_api(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Stop ownership"))
    client = TestClient(create_app(project_repository=projects, settings=replace(
        Settings.from_env(), data_root=tmp_path / "data",
    )))
    return client, project.id


@pytest.mark.parametrize("route,adapter", [
    ("media/diarizations/control", "SequentialDiarizationQueue"),
    ("training-runs/control", "TrainingRunner"),
])
@pytest.mark.parametrize("mode,active", [(None, False), ("queue", False), ("all", True)])
def test_control_routes_default_to_queue_and_forward_explicit_active(stop_api, monkeypatch, route, adapter, mode, active):
    calls = []
    if adapter == "SequentialDiarizationQueue":
        async def stop(self, project_id, *, include_active=False):
            calls.append((project_id, include_active))
            return []
    else:
        def stop(self, project_id, *, include_active=False):
            calls.append((project_id, include_active))
            return []
    monkeypatch.setattr(f"app.main.{adapter}.stop", stop)
    client, project_id = stop_api
    response = client.post(f"/api/projects/{project_id}/{route}", json={} if mode is None else {"mode": mode})
    assert response.status_code == 200
    assert response.json() == []
    assert calls == [(project_id, active)]


@pytest.mark.parametrize("action,active", [("stop", False), ("stop-all", True)])
def test_stt_control_retains_selected_asset_scope(stop_api, monkeypatch, action, active):
    calls = []
    async def stop(self, project_id, asset_ids=None, *, include_active=False):
        calls.append((project_id, asset_ids, include_active))
        return []
    monkeypatch.setattr("app.main.SequentialTranscriptionQueue.stop", stop)
    async def growing_stop(self, project, *, asset_ids=None, include_active=False):
        calls.append((project.id, asset_ids, include_active))
        return []
    monkeypatch.setattr("app.main.GrowingMkvTranscription.stop", growing_stop)
    monkeypatch.setattr("app.main.ObsLiveLinkDetailedStt.stop", growing_stop)
    client, project_id = stop_api
    response = client.post(f"/api/projects/{project_id}/media/transcriptions/control", json={
        "action": action, "assetIds": ["asset-selected"],
    })
    assert response.status_code == 200
    assert calls == [(project_id, ["asset-selected"], active)] * 3


@pytest.mark.parametrize("mode,active,status", [("queue", False, "stopped"), ("all", True, "cancelled")])
def test_generation_control_covers_script_and_single_output_with_terminal_status(stop_api, monkeypatch, mode, active, status):
    calls = []
    def script_stop(self, project_id, *, include_active=False):
        calls.append(("script", project_id, include_active))
        return VoiceScriptJob(id="job", project_id=project_id, status=status, total=2)
    def single_stop(self, project_id, *, include_active=False):
        calls.append(("single", project_id, include_active))
        return include_active
    monkeypatch.setattr("app.main.VoiceScriptSpeaker.stop", script_stop)
    monkeypatch.setattr("app.main.VoiceGenerator.stop", single_stop)
    client, project_id = stop_api
    response = client.post(f"/api/projects/{project_id}/generation/control", json={"mode": mode})
    assert response.status_code == 200
    assert response.json()["status"] == status
    assert calls == [("script", project_id, active), ("single", project_id, active)]


@pytest.mark.parametrize("route,payload", [
    ("media/transcriptions/control", {"action": "stop-all"}),
    ("media/diarizations/control", {"mode": "all"}),
    ("training-runs/control", {"mode": "all"}),
    ("generation/control", {"mode": "all"}),
])
def test_missing_project_cannot_stop_another_projects_work(stop_api, route, payload):
    client, _ = stop_api
    assert client.post(f"/api/projects/missing/{route}", json=payload).status_code == 404


def test_cancelled_single_generation_is_conflict_and_never_a_created_output(stop_api, monkeypatch):
    def cancelled(self, *args, **kwargs):
        raise VoiceGenerationCancelled("Generation stopped by user")
    monkeypatch.setattr("app.main.VoiceGenerator.generate", cancelled)
    client, project_id = stop_api
    response = client.post(f"/api/projects/{project_id}/voices/voice/generate", json={"text": "hello"})
    assert response.status_code == 409
    assert response.json() == {"detail": "Generation stopped by user"}


@pytest.mark.parametrize("route,adapter", [
    ("media/transcriptions/control", "SequentialTranscriptionQueue"),
    ("media/diarizations/control", "SequentialDiarizationQueue"),
])
def test_unacknowledged_engine_stop_is_reported_as_failure(stop_api, monkeypatch, route, adapter):
    async def failed_stop(self, *args, **kwargs):
        raise ProcessingStopError("Không xác nhận được engine đã dừng. Khởi động lại Studio.")
    monkeypatch.setattr(f"app.main.{adapter}.stop", failed_stop)
    client, project_id = stop_api
    payload = {"action": "stop-all"} if adapter == "SequentialTranscriptionQueue" else {"mode": "all"}
    response = client.post(f"/api/projects/{project_id}/{route}", json=payload)
    assert response.status_code == 502
    assert "Khởi động lại Studio" in response.json()["detail"]


@pytest.mark.parametrize("mode,active", [("queue", False), ("all", True)])
def test_recording_stt_control_preserves_recording_scope(stop_api, monkeypatch, mode, active):
    calls = []
    async def stop_recording(self, project, recording_id, *, include_active=False):
        calls.append((project.id, recording_id, include_active))
        return True
    def state(self, project, recording_id):
        return {"stopMode": mode, "active": not active, "tracks": {}}
    monkeypatch.setattr("app.main.ObsLiveLinkDetailedStt.stop_recording", stop_recording)
    monkeypatch.setattr("app.main.ObsLiveLinkDetailedStt.status", state)
    client, project_id = stop_api
    response = client.post(f"/api/projects/{project_id}/obs-livelink/recordings/recording/detailed-stt/control", json={"mode": mode})
    assert response.status_code == 200
    assert response.json()["stopMode"] == mode
    assert calls == [(project_id, "recording", active)]


def test_training_stop_reports_failed_process_acknowledgement(stop_api, monkeypatch):
    def failed_stop(self, project_id, *, include_active=False):
        raise ProcessingStopError("Training child is still alive")
    monkeypatch.setattr("app.main.TrainingRunner.stop", failed_stop)
    client, project_id = stop_api
    response = client.post(f"/api/projects/{project_id}/training-runs/control", json={"mode": "all"})
    assert response.status_code == 502
    assert "still alive" in response.json()["detail"]
