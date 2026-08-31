from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import runtime_controller
from app.runtime_controller import RuntimeLifecycle, app


def _pretend(monkeypatch: pytest.MonkeyPatch, owners: dict[int, int], parents: dict[int, int], session: dict):
    """Drive the real classification logic over a made-up process table."""
    monkeypatch.setattr(runtime_controller, "listening_owners", lambda: owners)
    monkeypatch.setattr(runtime_controller, "parent_pids", lambda: parents)
    monkeypatch.setattr(RuntimeLifecycle, "_session", staticmethod(lambda: session))


def test_runtime_status_reports_the_two_managed_workloads(monkeypatch: pytest.MonkeyPatch):
    lifecycle = RuntimeLifecycle(Path("workloads.ps1"))
    # API up, Studio down. 700 is the launcher's pid; 701 is the interpreter it
    # re-executed, which is what actually holds the port.
    _pretend(monkeypatch, {18120: 701}, {701: 700}, {"apiPid": 700, "studioPid": 900})

    status = lifecycle.status()

    assert status.overall == "partial"
    assert status.api == "running"
    assert status.studio == "stopped"
    assert status.model_dump(by_alias=True)["activeAction"] is None


def test_a_service_is_recognised_through_its_launcher_stub(monkeypatch: pytest.MonkeyPatch):
    """A venv python re-executes the base interpreter, so the pid moves down a level."""
    lifecycle = RuntimeLifecycle(Path("workloads.ps1"))
    _pretend(
        monkeypatch,
        {18120: 701, 18081: 901},
        {701: 700, 901: 900},
        {"apiPid": 700, "studioPid": 900},
    )

    status = lifecycle.status()

    assert status.overall == "running"
    assert [process.pid for process in status.processes if process.role != "controller"] == [701, 901]


def test_a_foreign_process_holding_a_port_is_not_reported_as_running(
    monkeypatch: pytest.MonkeyPatch,
):
    """Something else on 18120 used to read as a healthy API.

    The status came from a connect test, so any listener satisfied it and the
    workspace showed every system on while nothing of ours was answering.
    """
    lifecycle = RuntimeLifecycle(Path("workloads.ps1"))
    _pretend(
        monkeypatch,
        {18120: 555, 18081: 901},
        {555: 1, 901: 900},
        {"apiPid": 700, "studioPid": 900},
    )

    status = lifecycle.status()

    assert status.api == "foreign"
    assert status.overall == "blocked"
    assert next(p for p in status.processes if p.role == "api").pid == 555


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
