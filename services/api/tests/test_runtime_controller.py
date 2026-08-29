from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.runtime_controller import RuntimeLifecycle, app


def test_runtime_status_reports_the_two_managed_workloads(monkeypatch: pytest.MonkeyPatch):
    lifecycle = RuntimeLifecycle(Path("workloads.ps1"))
    monkeypatch.setattr(lifecycle, "_port_open", lambda port: port == 18120)

    status = lifecycle.status()

    assert status.overall == "partial"
    assert status.api == "running"
    assert status.studio == "stopped"
    assert status.model_dump(by_alias=True)["activeAction"] is None


def test_runtime_rejects_overlapping_lifecycle_actions():
    lifecycle = RuntimeLifecycle(Path("workloads.ps1"))
    lifecycle._busy = True
    lifecycle._active_action = "restart"

    with pytest.raises(RuntimeError, match="already handling restart"):
        lifecycle.request("stop")


def test_controller_health_does_not_depend_on_project_workloads():
    with TestClient(app) as client:
        response = client.get("/api/runtime/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "controller": "running"}
