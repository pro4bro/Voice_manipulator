from pathlib import Path
import json

import httpx

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


def test_controller_health_does_not_depend_on_project_workloads(monkeypatch):
    monkeypatch.setattr(runtime_controller.lifecycle, "observe", lambda stop: stop.wait())
    with TestClient(app) as client:
        response = client.get("/api/runtime/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "controller": "running"}


def test_diagnostics_distinguish_live_process_without_listener_from_health_timeout(monkeypatch):
    lifecycle = RuntimeLifecycle(Path("workloads.ps1"))
    _pretend(monkeypatch, {18081: 901}, {901: 900}, {"apiPid": 700, "studioPid": 900})
    monkeypatch.setattr(runtime_controller, "process_is_alive", lambda pid: pid in (700, 900))

    def timeout(request):
        assert request.url.port == 18081
        assert request.url.path == "/api/health"
        raise httpx.ReadTimeout("fixture", request=request)

    with httpx.Client(transport=httpx.MockTransport(timeout)) as client:
        records = {item["role"]: item for item in lifecycle.diagnostic_snapshot(client)}
    assert records["api"]["health"] == "no-listener"
    assert records["api"]["processAlive"] is True
    assert records["api"]["listenerPid"] is None
    assert records["studio"]["health"] == "ReadTimeout"
    assert records["studio"]["listenerPid"] == 901
    assert records["studio"]["processAlive"] is True


def test_diagnostics_do_not_probe_foreign_listener_or_hide_failed_health(monkeypatch):
    lifecycle = RuntimeLifecycle(Path("workloads.ps1"))
    _pretend(monkeypatch, {18120: 555, 18081: 901}, {901: 900}, {"apiPid": 700, "studioPid": 900})
    monkeypatch.setattr(runtime_controller, "process_is_alive", lambda _pid: False)
    requests = []

    def unhealthy(request):
        requests.append(request.url.port)
        return httpx.Response(503)

    with httpx.Client(transport=httpx.MockTransport(unhealthy)) as client:
        records = {item["role"]: item for item in lifecycle.diagnostic_snapshot(client)}
    assert requests == [18081]
    assert records["api"]["health"] == "foreign"
    assert records["api"]["processAlive"] is False
    assert records["studio"]["health"] == "http-503"


def test_observer_retains_loss_and_recovery_without_logging_every_poll(monkeypatch, tmp_path):
    lifecycle = RuntimeLifecycle(Path("workloads.ps1"))
    samples = iter([[{"health": "ok"}], [{"health": "ok"}],
                    [{"health": "no-listener", "processAlive": True}],
                    [{"health": "no-listener", "processAlive": False}], [{"health": "ok"}]])
    monkeypatch.setattr(lifecycle, "diagnostic_snapshot", lambda _client: next(samples))
    log = tmp_path / "runtime.log"
    monkeypatch.setattr(runtime_controller, "ACTION_LOG", log)

    class StopAfterFive:
        calls = 0

        def is_set(self):
            return self.calls == 5

        def wait(self, _seconds):
            self.calls += 1

    lifecycle.observe(StopAfterFive())
    records = [json.loads(line) for line in log.read_text().splitlines()]
    assert len(records) == 4
    assert [r["services"][0]["health"] for r in records] == ["ok", "no-listener", "no-listener", "ok"]
    assert [r["services"][0].get("processAlive") for r in records[1:3]] == [True, False]
