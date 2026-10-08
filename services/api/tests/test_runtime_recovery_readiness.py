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
        transcription_selected=True, transcription_status="processing",
        source_archive_asset_id="asset-recovery",
    ))
    parent_id = "asset-recovery"
    library.create(project.id, MediaAssetCreate(
        name="Recovery source", origin="import", source_path="original.mkv",
        source_extension=".mkv", media_kind="video", growing_mkv_follow=True,
    ), parent_id)
    directory = Path(project.project_path) / "assets" / "media" / parent_id
    directory.mkdir(parents=True, exist_ok=True)
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
    holder = None

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
        if holder is not None:
            holder.join(3)
    assert not thread.is_alive()
    assert {name: (directory / name).read_bytes() for name in checkpoint_bytes} == checkpoint_bytes


@pytest.mark.parametrize("blocked_read", ["media", "project"])
def test_health_stays_responsive_while_open_existing_discovery_waits_on_media_lock(
    tmp_path, monkeypatch, blocked_read,
):
    source_projects = FileProjectRepository(tmp_path / "source-projects")
    project = source_projects.create(ProjectCreate(name="Open Existing readiness"))
    source_library = FileMediaLibrary(source_projects)
    parent_id = "asset-openexisting"
    track = source_library.create(project.id, MediaAssetCreate(
        name="Track 1", origin="import", source_path="original.mkv",
        analysis_path="analysis.wav", source_extension=".wav", media_kind="audio",
        transcription_selected=True, transcription_status="processing",
        source_archive_asset_id=parent_id,
    ))
    source_library.create(project.id, MediaAssetCreate(
        name="Recovery source", origin="import", source_path="original.mkv",
        source_extension=".mkv", media_kind="video", growing_mkv_follow=True,
    ), parent_id)
    directory = Path(project.project_path) / "assets" / "media" / parent_id
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "follow-state.json").write_text(json.dumps({
        "parentId": parent_id, "finished": True,
        "tracks": [{"assetId": track.id, "frames": 24000, "finalFrames": 24000}],
    }), encoding="utf-8")
    (directory / "stt-state.json").write_text(json.dumps({
        "version": 1, "parentId": parent_id, "segmentSeconds": 60,
        "tracks": {track.id: {"liveFrame": 0, "finalFrame": 0,
                              "publishedLiveFrame": 0, "publishedFinalFrame": -1}},
    }), encoding="utf-8")

    projects = FileProjectRepository(tmp_path / "api-projects")
    settings = replace(Settings.from_env(), data_root=tmp_path / "machine")
    stalled = threading.Event()
    release = threading.Event()
    lock_holder = []
    get_media = FileMediaLibrary.get

    def media_read(self, *args):
        if blocked_read == "media" and args[0] == project.id and not stalled.is_set():
            acquired = threading.Event()

            def hold_actual_instance_lock():
                with self._lock(project.id):
                    acquired.set()
                    release.wait()

            holder = threading.Thread(target=hold_actual_instance_lock)
            lock_holder.append(holder)
            holder.start()
            assert acquired.wait(1)
            stalled.set()
        return get_media(self, *args)

    async def process_once(self, _project, _parent_id, *, wait_for_detail=True):
        return {"done": False}

    monkeypatch.setattr(FileMediaLibrary, "get", media_read)
    monkeypatch.setattr(GrowingMkvTranscription, "process_once", process_once)
    if blocked_read == "project":
        open_project = projects.open

        def blocked_project_open(path):
            stalled.set()
            assert release.wait(5)
            return open_project(path)

        monkeypatch.setattr(projects, "open", blocked_project_open)

    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(create_app(
        project_repository=projects, settings=settings,
    ), log_config=None, access_log=False))
    server_thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]})
    server_thread.start()
    open_result = []

    def open_existing():
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/projects/open",
            data=json.dumps({"path": str(project.project_path)}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                open_result.append((response.status, json.load(response)))
        except Exception as exc:
            open_result.append(exc)

    open_thread = threading.Thread(target=open_existing)
    open_started = False
    try:
        deadline = time.monotonic() + 3
        while not server.started and time.monotonic() < deadline:
            time.sleep(.01)
        assert server.started, "The isolated API did not bind before Open Existing"
        open_thread.start()
        open_started = True
        assert stalled.wait(3), "Open Existing discovery did not reach the media lock"
        started = time.monotonic()
        healthy = False
        while time.monotonic() - started < .5:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=.1) as response:
                    healthy = json.load(response)["status"] == "ok"
                    break
            except (OSError, urllib.error.URLError):
                time.sleep(.01)
        assert healthy, "Health did not respond while Open Existing awaited media storage"
        assert not release.is_set(), "The media lock must remain held when health returns"
    finally:
        release.set()
        if open_started:
            open_thread.join(5)
        server.should_exit = True
        server_thread.join(5)
        listener.close()
        for holder in lock_holder:
            holder.join(3)

    assert not open_thread.is_alive()
    assert not server_thread.is_alive()
    assert len(open_result) == 1 and not isinstance(open_result[0], Exception)
    assert open_result[0][0] == 200
    assert open_result[0][1]["id"] == project.id
