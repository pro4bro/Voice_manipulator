"""A slow project recovery scan must not hold the API listener closed."""

import json
import socket
import time
import urllib.error
import urllib.request
from dataclasses import replace
from threading import Event, Thread

import uvicorn

from app.adapters.file_project_repository import FileProjectRepository
from app.main import create_app
from app.settings import Settings


def test_health_is_ready_while_project_recovery_scans_slow_storage(tmp_path, monkeypatch):
    projects = FileProjectRepository(tmp_path / "projects")
    scan_started = Event()
    release_scan = Event()
    scan_finished = Event()
    original_list = projects.list

    def slow_list():
        scan_started.set()
        release_scan.wait(5)
        result = original_list()
        scan_finished.set()
        return result

    monkeypatch.setattr(projects, "list", slow_list)
    app = create_app(
        project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "data"),
    )

    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_config=None, access_log=False))
    thread = Thread(target=server.run, kwargs={"sockets": [listener]})
    thread.start()
    try:
        assert scan_started.wait(3), "Recovery never started"
        healthy = False
        deadline = time.monotonic() + 2.5
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{port}/api/health", timeout=0.2
                ) as response:
                    healthy = json.load(response)["status"] == "ok"
                break
            except (OSError, urllib.error.URLError):
                time.sleep(0.02)
        assert healthy, "API listener waited for the slow project scan"
        assert not release_scan.is_set()
        release_scan.set()
        assert scan_finished.wait(2), "Recovery did not finish after storage returned"
    finally:
        release_scan.set()
        server.should_exit = True
        thread.join(5)
        listener.close()
    assert not thread.is_alive()
