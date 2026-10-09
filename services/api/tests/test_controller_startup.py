"""Controller bootstrap cannot wait for TLS/proxy setup for its HTTP loopback backend."""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

import uvicorn
from fastapi.testclient import TestClient

from app import runtime_controller


def test_controller_binds_without_waiting_for_system_certificate_loading(monkeypatch, tmp_path):
    release = threading.Event()
    creating_client = threading.Event()
    certificate_reads = []
    original_client = runtime_controller.httpx.AsyncClient

    def client(*args, **kwargs):
        creating_client.set()
        return original_client(*args, **kwargs)

    def stalled_certificates(*args, **kwargs):
        certificate_reads.append(True)
        release.wait(10)
        return ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

    monkeypatch.setattr(ssl, "create_default_context", stalled_certificates)
    monkeypatch.setattr(runtime_controller.httpx, "AsyncClient", client)
    monkeypatch.setattr(runtime_controller.lifecycle, "observe", lambda stop: stop.wait())
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    config = uvicorn.Config(runtime_controller.app, log_config=None, access_log=False)
    config.load()
    server = uvicorn.Server(config)
    errors = []

    def serve():
        try:
            server.run(sockets=[sock])
        except BaseException as error:
            errors.append(error)

    thread = threading.Thread(target=serve, daemon=True)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    thread.start()
    try:
        assert creating_client.wait(10), "controller did not enter its client startup phase"
        deadline = time.monotonic() + 1.5
        health = None
        while time.monotonic() < deadline:
            try:
                with opener.open(f"http://127.0.0.1:{port}/api/runtime/health", timeout=.1) as response:
                    health = json.load(response)
                break
            except (OSError, urllib.error.URLError):
                time.sleep(.01)
        assert health == {"status": "ok", "controller": "running"}, "controller waits before binding"
        assert certificate_reads == []
    finally:
        release.set()
        server.should_exit = True
        thread.join(10)
        if not thread.is_alive():
            sock.close()
    assert not thread.is_alive()
    assert errors == []


def test_controller_ignores_system_ca_and_proxy_settings_for_http_loopback(monkeypatch, tmp_path):
    monkeypatch.setenv("SSL_CERT_FILE", str(tmp_path / "unavailable-ca.pem"))
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:1")
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:1")
    monkeypatch.setenv("ALL_PROXY", "http://127.0.0.1:1")
    monkeypatch.setenv("NO_PROXY", "")
    monkeypatch.setattr(runtime_controller.lifecycle, "observe", lambda stop: stop.wait())
    class Backend(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"path": self.path}).encode())

        def log_message(self, *_args):
            pass

    backend = ThreadingHTTPServer(("127.0.0.1", 0), Backend)
    thread = threading.Thread(target=backend.serve_forever)
    thread.start()
    monkeypatch.setattr(runtime_controller, "API_ORIGIN", f"http://127.0.0.1:{backend.server_port}")
    try:
        with TestClient(runtime_controller.app) as client:
            assert client.get("/api/runtime/health").json()["status"] == "ok"
            assert client.get("/api/local-test?probe=1").json() == {"path": "/api/local-test?probe=1"}
    finally:
        backend.shutdown()
        backend.server_close()
        thread.join(3)


def test_controller_cli_captures_a_stalled_dependency_import():
    root = Path(__file__).resolve().parents[1]
    code = '''
import importlib.abc
import runpy
import sys
import time
from app.adapters import startup_diagnostics
original = startup_diagnostics.StartupDiagnostics
class FastDiagnostics(original):
    def __init__(self, logger):
        super().__init__(logger, delay=.03, samples=1)
startup_diagnostics.StartupDiagnostics = FastDiagnostics
class DelayedImport(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == 'httpx':
            time.sleep(.15)
            raise ImportError('fixture slow import')
sys.meta_path.insert(0, DelayedImport())
runpy.run_module('app.runtime_controller', run_name='__main__')
'''
    result = subprocess.run([sys.executable, "-c", code], cwd=root, text=True,
                            capture_output=True, timeout=15,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    assert result.returncode != 0
    assert "fixture slow import" in result.stderr
    assert "[startup-stall]" in result.stderr
    assert "find_spec" in result.stderr
    assert "Controller boot" in result.stderr
