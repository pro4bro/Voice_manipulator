"""Exercise real Uvicorn binding while persisted recovery reads are stalled."""
from __future__ import annotations

import json
import logging
import socket
import threading
import time
import urllib.error
import urllib.request
from dataclasses import replace
from pathlib import Path

import pytest
import uvicorn

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.growing_mkv_transcription import GrowingMkvTranscription
from app.domain.models import MediaAssetCreate, ProjectCreate
from app.main import create_app
from app.settings import Settings


@pytest.mark.parametrize("blocked_read", ["project", "checkpoint", "media"])
def test_api_binds_while_resumed_mkv_stt_waits_for_storage(tmp_path, monkeypatch, blocked_read):
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="Recovery readiness"))
    library = FileMediaLibrary(projects)
    track = library.create(project.id, MediaAssetCreate(
        name="Track 1", origin="import", source_path="original.mkv",
        analysis_path="analysis.wav", source_extension=".wav", media_kind="audio",
        transcription_selected=True,
    ))
    parent_id = "asset-recovery"
    directory = Path(project.project_path) / "assets" / "media" / parent_id
    directory.mkdir(parents=True)
    (directory / "follow-state.json").write_text(json.dumps({
        "parentId": parent_id, "finished": True, "sttDetailedEnabled": False,
        "tracks": [{"assetId": track.id, "frames": 0}],
    }), encoding="utf-8")
    (directory / "stt-state.json").write_text(json.dumps({
        "version": 1, "parentId": parent_id, "segmentSeconds": 60,
        "tracks": {track.id: {"liveFrame": 0, "finalFrame": 0,
                              "publishedLiveFrame": 0, "publishedFinalFrame": 0}},
    }), encoding="utf-8")
    checkpoint_bytes = {name: (directory / name).read_bytes()
                        for name in ("follow-state.json", "stt-state.json")}
    stalled = threading.Event()
    worker_read_started = threading.Event()
    discovery_finished = threading.Event()
    release = threading.Event()
    read = GrowingMkvTranscription._load

    def checkpoint_read(self, *args):
        worker_read_started.set()
        if blocked_read == "checkpoint":
            stalled.set()
            assert release.wait(3)
        return read(self, *args)

    monkeypatch.setattr(GrowingMkvTranscription, "_load", checkpoint_read)
    if blocked_read == "project":
        get_project = projects.get

        recovery_log = logging.getLogger("pro4bro.activity")
        log_info = recovery_log.info

        def recovery_info(message, *args, **kwargs):
            if message.startswith("Runtime recovery scan finished"):
                discovery_finished.set()
            return log_info(message, *args, **kwargs)

        monkeypatch.setattr(recovery_log, "info", recovery_info)

        def project_read(*args):
            if discovery_finished.is_set():
                stalled.set()
                assert release.wait(3)
            return get_project(*args)

        monkeypatch.setattr(projects, "get", project_read)
    if blocked_read == "media":
        get_media = FileMediaLibrary.get

        def media_read(self, *args):
            if worker_read_started.is_set():
                # Hold the actual library lock from another thread. Discovery
                # has already finished; only the resumed worker waits here.
                acquired = threading.Event()

                def hold_lock():
                    with self._lock(project.id):
                        acquired.set()
                        release.wait(3)

                holder = threading.Thread(target=hold_lock)
                holder.start()
                assert acquired.wait(1)
                stalled.set()
                try:
                    return get_media(self, *args)
                finally:
                    holder.join(3)
            return get_media(self, *args)

        monkeypatch.setattr(FileMediaLibrary, "get", media_read)

    # Reserve a port until Uvicorn takes ownership; no port selection race.
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    settings = replace(Settings.from_env(), data_root=tmp_path / "machine")
    server = uvicorn.Server(uvicorn.Config(create_app(
        project_repository=projects, settings=settings,
    ), log_config=None, access_log=False))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]})
    thread.start()
    try:
        assert stalled.wait(3), "The persisted recovery worker did not reach the read"
        started = time.monotonic()
        healthy = False
        while time.monotonic() - started < .5:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=.1) as response:
                    healthy = json.load(response)["status"] == "ok"
                    break
            except (OSError, urllib.error.URLError):
                time.sleep(.01)
        assert healthy, f"API could not bind/respond while {blocked_read} storage was stalled"
        assert not release.is_set(), "Read must still be blocked when health returns"
    finally:
        release.set()
        server.should_exit = True
        thread.join(5)
        listener.close()
    assert not thread.is_alive()
    assert {name: (directory / name).read_bytes() for name in checkpoint_bytes} == checkpoint_bytes
