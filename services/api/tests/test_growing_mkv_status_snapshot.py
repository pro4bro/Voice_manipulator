import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.adapters.file_growing_mkv_follower import FileGrowingMkvFollower


def _finished_checkpoint(tmp_path: Path):
    project_root = tmp_path / "project"
    parent_id = "asset-parent1"
    parent_dir = project_root / "assets" / "media" / parent_id
    parent_dir.mkdir(parents=True)
    source = parent_dir / "source-final.mkv"
    source.write_bytes(b"final-source")
    state_path = parent_dir / "follow-state.json"
    state_path.write_text(json.dumps({
        "version": 1,
        "parentId": parent_id,
        "finished": True,
        "sequence": 3,
        "cursor": 42,
        "tracks": [],
    }), encoding="utf-8")
    project = SimpleNamespace(project_path=str(project_root), id="project")
    return FileGrowingMkvFollower(None, None, None, None), project, parent_id, state_path


def test_status_retries_transient_checkpoint_permission_error(tmp_path, monkeypatch):
    follower, project, parent_id, state_path = _finished_checkpoint(tmp_path)
    original_read_text = Path.read_text
    attempts = 0

    def read_with_one_sharing_error(path, *args, **kwargs):
        nonlocal attempts
        if path == state_path:
            attempts += 1
            if attempts == 1:
                raise PermissionError(13, "checkpoint is briefly shared", str(path))
        return original_read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", read_with_one_sharing_error)

    status = follower.status(project, parent_id)

    assert attempts == 2
    assert status["finished"] is True
    assert status["clusters"] == 3


def test_status_propagates_persistent_checkpoint_permission_error(tmp_path, monkeypatch):
    follower, project, parent_id, state_path = _finished_checkpoint(tmp_path)
    attempts = 0
    sleeps = []

    def denied_read(path, *args, **kwargs):
        nonlocal attempts
        if path == state_path:
            attempts += 1
            raise PermissionError(13, "checkpoint remains locked", str(path))
        raise AssertionError(f"unexpected read: {path}")

    monkeypatch.setattr(Path, "read_text", denied_read)
    monkeypatch.setattr("app.adapters.file_growing_mkv_follower.time.sleep", sleeps.append)

    with pytest.raises(PermissionError, match="remains locked"):
        follower.status(project, parent_id)

    assert attempts == 5
    assert sleeps == pytest.approx([0.02, 0.04, 0.06, 0.08])
    assert sum(sleeps) <= 0.2000001


def test_status_does_not_retry_invalid_json(tmp_path, monkeypatch):
    follower, project, parent_id, state_path = _finished_checkpoint(tmp_path)
    attempts = 0

    def malformed_read(path, *args, **kwargs):
        nonlocal attempts
        if path == state_path:
            attempts += 1
            return "{invalid json"
        raise AssertionError(f"unexpected read: {path}")

    monkeypatch.setattr(Path, "read_text", malformed_read)

    with pytest.raises(json.JSONDecodeError):
        follower.status(project, parent_id)

    assert attempts == 1
