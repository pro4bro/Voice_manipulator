"""A cancelled asyncio waiter must not leave its checkpoint writer behind."""
import json
import threading
from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

from app.adapters.file_growing_mkv_follower import FileGrowingMkvFollower
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.domain.models import MediaAssetCreate, ProjectCreate
from app.main import create_app
from app.settings import Settings


def test_shutdown_waits_for_inflight_mkv_checkpoint_writer(tmp_path, monkeypatch):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Watcher shutdown"))
    parent = FileMediaLibrary(projects).create(project.id, MediaAssetCreate(
        name="Growing source", origin="import", source_path="source.mkv",
        source_extension=".mkv", media_kind="video", growing_mkv_follow=True,
    ))
    checkpoint = Path(project.project_path) / "assets" / "media" / parent.id / "follow-state.json"
    checkpoint.write_text(json.dumps({"parentId": parent.id, "finished": False, "tracks": []}), encoding="utf-8")
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    shutdown, closed = threading.Event(), threading.Event()
    errors = []

    def poll(self, project_record, asset_id, *, max_clusters=8):
        entered.set()
        release.wait()
        finished.set()
        return {"finished": False}

    monkeypatch.setattr(FileGrowingMkvFollower, "poll", poll)

    def run_api():
        try:
            with TestClient(create_app(project_repository=projects, settings=replace(
                Settings.from_env(), data_root=tmp_path / "machine",
            ))):
                assert shutdown.wait(5)
        except Exception as exc:
            errors.append(exc)
        finally:
            closed.set()

    api = threading.Thread(target=run_api)
    api.start()
    try:
        assert entered.wait(3)
        shutdown.set()
        assert not closed.wait(.2), "API closed with its checkpoint writer still running"
        assert not finished.is_set()
    finally:
        release.set()
        shutdown.set()
        api.join(5)
    assert finished.is_set() and closed.is_set() and not api.is_alive()
    assert not errors
