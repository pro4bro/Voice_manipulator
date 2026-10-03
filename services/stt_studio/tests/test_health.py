from fastapi.testclient import TestClient

from studio_app import server


def test_health_does_not_initialize_torch_cuda_or_models(monkeypatch):
    def unexpected_device_probe():
        raise AssertionError("Health must not initialize the inference runtime")

    monkeypatch.setattr(server, "_resolve_device", unexpected_device_probe)
    with TestClient(server.app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "stt-studio"}


def test_health_remains_available_when_model_loading_failed(monkeypatch):
    monkeypatch.setattr(server, "model_load_state", "error")
    monkeypatch.setattr(server, "model_load_error", "CUDA allocation failed")
    with TestClient(server.app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert server.model_load_state == "error"
    assert server.model_load_error == "CUDA allocation failed"
