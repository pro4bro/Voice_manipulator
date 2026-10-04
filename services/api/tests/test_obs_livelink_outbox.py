import errno
import hashlib
import json
import sqlite3
import threading
import zipfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest

from app.adapters.obs_livelink_audio import FileObsLiveLinkAudio
from app.adapters.obs_livelink_connection import LiveLinkError
from app.adapters.obs_livelink_deletions import mark_recording_deleted
from app.adapters.obs_livelink_outbox import ObsLiveLinkOutbox
from test_obs_livelink_runtime import setup, lifecycle


@pytest.fixture
def recovery(tmp_path):
    link, runtime, project, token, hello, snapshot = setup(tmp_path)
    recording_id = lifecycle(runtime, token, hello, snapshot, 0, "obs-start", 1_000_000_000,
                             "span")["appRecording"]["recordingId"]
    lifecycle(runtime, token, hello, snapshot, 1, "obs-stop", 2_000_000_000, "span")
    audio = FileObsLiveLinkAudio(link, runtime, runtime.projects, None, None)
    adapter = ObsLiveLinkOutbox(audio)
    with sqlite3.connect(adapter.path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("CREATE TABLE chunks (id INTEGER PRIMARY KEY, recording_id TEXT, channel_id TEXT, "
                   "sequence INTEGER, source_uuid TEXT, first_sample_index INTEGER, obs_timestamp_ns INTEGER, "
                   "plugin_monotonic_ns INTEGER, frames INTEGER, sample_rate INTEGER, channels INTEGER, "
                   "pcm BLOB, rejected_status INTEGER)")
        for index, rec in enumerate([recording_id, recording_id, str(uuid4())]):
            db.execute("INSERT INTO chunks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                index + 1, rec, str(uuid4()), index, str(uuid4()), index * 2, 12, 1_000_000_000,
                2, 48000, 1, b"\1\0\2\0", 422 if index != 1 else None))
    return adapter, project, recording_id


def rows(adapter):
    with sqlite3.connect(adapter.path) as db:
        return db.execute("SELECT * FROM chunks ORDER BY id").fetchall()


def test_retry_is_scoped_keeps_bytes_and_requires_current_digest(recovery):
    adapter, project, recording_id = recovery
    original = rows(adapter)
    snapshot = adapter.snapshot(project.id, recording_id)
    assert snapshot["retainedChunks"] == 2 and snapshot["rejectedChunks"] == 1
    result = adapter.retry(project.id, recording_id, snapshot["rejectedDigest"])
    assert result == {"recordingId": recording_id, "retriedChunks": 1, "durablyAccepted": False}
    after = rows(adapter)
    assert [row[:-1] for row in after] == [row[:-1] for row in original]
    assert after[0][-1] is None and after[2] == original[2]
    with pytest.raises(LiveLinkError, match="changed") as error:
        adapter.retry(project.id, recording_id, snapshot["rejectedDigest"])
    assert error.value.status == 409
    assert rows(adapter) == after


def test_export_preserves_rejected_pcm_metadata_and_legacy_clock(recovery):
    adapter, project, recording_id = recovery
    original = rows(adapter)
    path = adapter.export(project.id, recording_id)
    assert path.is_relative_to(project.project_path) and path.is_file()
    with zipfile.ZipFile(path) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["projectId"] == project.id and manifest["recordingId"] == recording_id
        assert len(manifest["chunks"]) == 2
        for metadata in manifest["chunks"]:
            pcm = archive.read(metadata["pcmEntry"])
            assert pcm == original[metadata["id"] - 1][-2]
            assert hashlib.sha256(pcm).hexdigest() == metadata["pcmSha256"]
            assert metadata["enqueued_wall_ms"] is None
        assert manifest["chunks"][0]["rejected_status"] == 422
    assert rows(adapter) == original


@pytest.mark.parametrize("action", ["snapshot", "export", "retry"])
def test_deleted_or_mismatched_project_cannot_recover(recovery, action):
    adapter, project, recording_id = recovery
    original = rows(adapter)
    args = (project.id, recording_id, "0" * 64) if action == "retry" else (project.id, recording_id)
    journal = Path(project.project_path) / "assets" / "obs-livelink" / recording_id / "recording.json"
    data = json.loads(journal.read_text())
    data["recording"]["projectId"] = "another-project"
    journal.write_text(json.dumps(data))
    with pytest.raises(LiveLinkError) as error:
        getattr(adapter, action)(*args)
    assert error.value.status == 403
    mark_recording_deleted(Path(project.project_path), recording_id)
    with pytest.raises(LiveLinkError) as error:
        getattr(adapter, action)(*args)
    assert error.value.status == 404 and rows(adapter) == original


def test_export_enospc_and_bounds_keep_every_original(recovery, monkeypatch):
    adapter, project, recording_id = recovery
    original = rows(adapter)
    def full(_):
        raise OSError(errno.ENOSPC, "simulated full storage")
    monkeypatch.setattr("app.adapters.obs_livelink_outbox.os.fsync", full)
    with pytest.raises(OSError):
        adapter.export(project.id, recording_id)
    assert not list((Path(project.project_path) / "exports").rglob("*.zip*"))
    assert rows(adapter) == original
    monkeypatch.setattr(adapter, "MAX_BYTES", 1)
    with pytest.raises(LiveLinkError) as error:
        adapter.export(project.id, recording_id)
    assert error.value.status == 413 and rows(adapter) == original


def test_export_snapshot_survives_concurrent_ack_and_does_not_block_other_recordings(recovery, monkeypatch):
    adapter, project, recording_id = recovery
    entered, release = threading.Event(), threading.Event()
    metadata = adapter._metadata
    def delayed(row):
        entered.set()
        assert release.wait(5)
        return metadata(row)
    monkeypatch.setattr(adapter, "_metadata", delayed)
    with ThreadPoolExecutor(1) as pool:
        future = pool.submit(adapter.export, project.id, recording_id)
        assert entered.wait(5)
        assert adapter.audio.runtime._lock.acquire(timeout=1)
        adapter.audio.runtime._lock.release()
        with sqlite3.connect(adapter.path) as db:
            db.execute("DELETE FROM chunks WHERE id=1")  # emulate an unrelated native ACK commit
        release.set()
        with zipfile.ZipFile(future.result()) as archive:
            assert len(json.loads(archive.read("manifest.json"))["chunks"]) == 2
    assert len(rows(adapter)) == 2


def test_busy_writer_retry_fails_explicitly_without_changing_pcm(recovery):
    adapter, project, recording_id = recovery
    original = rows(adapter)
    digest = adapter.snapshot(project.id, recording_id)["rejectedDigest"]
    with sqlite3.connect(adapter.path) as writer:
        writer.execute("BEGIN IMMEDIATE")
        with pytest.raises(LiveLinkError) as error:
            adapter.retry(project.id, recording_id, digest)
        assert error.value.status == 503
    assert rows(adapter) == original


def test_failed_retry_commit_rolls_back_flags_and_never_reports_success(recovery, monkeypatch):
    adapter, project, recording_id = recovery
    original = rows(adapter)
    digest = adapter.snapshot(project.id, recording_id)["rejectedDigest"]
    connect = sqlite3.connect
    class FullAtCommit(sqlite3.Connection):
        def commit(self):
            raise sqlite3.OperationalError("database or disk is full")
    def faulted_connect(*args, **kwargs):
        if kwargs.get("uri") and "mode=rw" in str(args[0]):
            kwargs["factory"] = FullAtCommit
        return connect(*args, **kwargs)
    monkeypatch.setattr(sqlite3, "connect", faulted_connect)
    with pytest.raises(LiveLinkError, match="full") as error:
        adapter.retry(project.id, recording_id, digest)
    assert error.value.status == 503 and rows(adapter) == original


def test_http_recovery_routes_return_artifact_and_reject_stale_retry(recovery, tmp_path, monkeypatch):
    from dataclasses import replace
    from io import BytesIO
    from types import SimpleNamespace
    from fastapi.testclient import TestClient
    import app.main as main
    from app.settings import Settings
    adapter, project, recording_id = recovery
    monkeypatch.setattr(main, "ObsLiveLinkOutbox", lambda _: adapter)
    monkeypatch.setattr(main, "ObsPluginInstallation", lambda *_: SimpleNamespace(
        user_config=adapter.audio.connection.pairing_file))
    client = TestClient(main.create_app(project_repository=adapter.audio.projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "api")))
    route = f"/api/projects/{project.id}/obs-livelink/recordings/{recording_id}/outbox"
    snapshot = client.get(route)
    assert snapshot.status_code == 200 and snapshot.json()["rejectedChunks"] == 1
    exported = client.post(route + "/export")
    assert exported.status_code == 200 and "attachment" in exported.headers["content-disposition"]
    with zipfile.ZipFile(BytesIO(exported.content)) as archive:
        assert len(json.loads(archive.read("manifest.json"))["chunks"]) == 2
    request = {"rejectedDigest": snapshot.json()["rejectedDigest"]}
    assert client.post(route + "/retry", json=request).json()["durablyAccepted"] is False
    assert client.post(route + "/retry", json=request).status_code == 409
