import asyncio
import io
import json
import threading
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.sokuji_bridge import SokujiBridge, SokujiBridgeError, make_sokuji_router


class FakeProcess:
    def __init__(self, stdout='{"port":8765}\n'):
        self.stdout = io.StringIO(stdout)
        self.stderr = io.StringIO("")
        self.returncode = None
        self.terminated = False
        self.killed = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = -15

    def kill(self):
        self.killed = True
        self.returncode = -9

    def wait(self, timeout=None):
        self.returncode = self.returncode or 0
        return self.returncode


class BlockingStdout:
    def __init__(self, release):
        self.release = release

    def __iter__(self):
        self.release.wait()
        return iter(())


class FakeConnection:
    def __init__(self, response_type):
        self.response_type = response_type
        self.request = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def send(self, raw):
        self.request = json.loads(raw)

    async def recv(self):
        return json.dumps({"type": self.response_type, "id": self.request["id"], "models": []})


def make_bridge(tmp_path, **kwargs):
    repo = tmp_path / "sokuji"
    runtime = tmp_path / "runtime"
    return SokujiBridge(repo, runtime, **kwargs)


def test_start_reads_handshake_and_stop_terminates_only_bridge_process(tmp_path):
    bridge = make_bridge(tmp_path)
    process = FakeProcess()
    with patch.object(bridge, "unavailable_reason", return_value=None), patch(
        "app.adapters.sokuji_bridge.subprocess.Popen", return_value=process
    ) as popen:
        bridge._start_sync()
        assert bridge.running
        assert bridge._port == 8765
        assert popen.call_args.args[0][-2:] == ["-m", "sokuji_sidecar"]
        assert popen.call_args.kwargs["cwd"] == bridge.sidecar
        bridge.stop()
    assert process.terminated
    assert not bridge.running


def test_start_timeout_terminates_sidecar_and_clears_running_state(tmp_path):
    bridge = make_bridge(tmp_path, startup_timeout=0.03, stop_timeout=0.01)
    release_reader = threading.Event()
    process = FakeProcess()
    process.stdout = BlockingStdout(release_reader)
    with patch.object(bridge, "unavailable_reason", return_value=None), patch(
        "app.adapters.sokuji_bridge.subprocess.Popen", return_value=process
    ):
        with pytest.raises(SokujiBridgeError, match="handshake timed out"):
            bridge._start_sync()
    release_reader.set()
    assert process.terminated
    assert bridge._process is None
    assert not bridge.running


def test_catalog_uses_only_allowlisted_rpc_and_checks_response_id(tmp_path):
    bridge = make_bridge(tmp_path)
    process = FakeProcess()
    bridge._process = process
    bridge._port = 8765
    connection = FakeConnection("models_catalog_result")

    with patch("websockets.connect", return_value=connection):
        reply = asyncio.run(bridge.catalog("translate"))
    assert reply["type"] == "models_catalog_result"
    assert connection.request["type"] == "models_catalog"
    assert connection.request["kind"] == "translate"
    with pytest.raises(ValueError, match="catalog kind"):
        asyncio.run(bridge.catalog("download"))


def test_rpc_rejects_mismatched_protocol_response(tmp_path):
    bridge = make_bridge(tmp_path)
    bridge._process = FakeProcess()
    bridge._port = 8765

    class MismatchedConnection(FakeConnection):
        async def recv(self):
            return json.dumps({"type": "pong", "id": "wrong"})

    with patch("websockets.connect", return_value=MismatchedConnection("pong")):
        with pytest.raises(SokujiBridgeError, match="request id"):
            asyncio.run(bridge.health())


def test_health_route_does_not_spawn_and_catalog_requires_explicit_start(tmp_path):
    bridge = make_bridge(tmp_path)
    bridge._readiness_checked = True
    bridge._readiness_reason = None
    with patch.object(bridge, "unavailable_reason", side_effect=AssertionError("health must not run readiness subprocess")):
        app = FastAPI()
        app.include_router(make_sokuji_router(bridge))
        with TestClient(app) as client:
            health = client.get("/api/open-engines/sokuji/health")
            catalog = client.get("/api/open-engines/sokuji/catalog?kind=asr")
    assert health.status_code == 200
    assert health.json()["running"] is False
    assert catalog.status_code == 409
    assert "not running" in catalog.json()["detail"]


def test_start_route_returns_uniform_top_level_status_shape(tmp_path):
    bridge = make_bridge(tmp_path)
    async def fake_start():
        return {
            "installed": True,
            "running": True,
            "reason": None,
            "port": 8765,
            "health": {"ok": True, "type": "pong", "running": True},
        }
    with patch.object(bridge, "start", side_effect=fake_start):
        app = FastAPI()
        app.include_router(make_sokuji_router(bridge))
        with TestClient(app) as client:
            response = client.post("/api/open-engines/sokuji/start")
    assert response.status_code == 200
    assert response.json()["running"] is True
    assert response.json()["port"] == 8765
    assert response.json()["health"]["type"] == "pong"
