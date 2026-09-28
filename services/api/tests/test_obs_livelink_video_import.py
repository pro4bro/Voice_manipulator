import json
import shutil
import subprocess
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.adapters.file_project_repository import FileProjectRepository
from app.domain.models import ProjectCreate
from app.settings import Settings


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg is required to create a valid MKV fixture")
def test_imports_exact_completed_mkv_once_and_keeps_project_path_relative(tmp_path, monkeypatch):
    ffmpeg = shutil.which("ffmpeg")
    folder = tmp_path / "OBS recordings"
    folder.mkdir()
    source = folder / "same-time-name.mkv"
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
        "color=c=black:s=64x64:d=0.5", "-an", "-c:v", "mpeg4", "-y", str(source),
    ], check=True)

    pairing_path = tmp_path / "pairing.json"
    identity = {"installId": str(uuid4()), "token": "s" * 40}
    pairing_path.write_text(json.dumps(identity), encoding="utf-8")
    monkeypatch.setattr(main, "ObsPluginInstallation", lambda *_: SimpleNamespace(user_config=pairing_path))
    projects = FileProjectRepository(tmp_path / "projects")
    project = projects.create(ProjectCreate(name="OBS video import"))
    settings = replace(Settings.from_env(), data_root=tmp_path / "data", ffmpeg_path=ffmpeg)
    client = TestClient(main.create_app(project_repository=projects, settings=settings))
    auth = {"Authorization": "Bearer " + identity["token"]}
    process_id = str(uuid4())
    hello = client.post("/api/obs-livelink/v3/hello", headers=auth, json={
        "installId": identity["installId"], "processInstanceId": process_id,
        "pluginVersion": "0.5.0", "obsVersion": "32.2.2", "protocolMin": 3,
        "protocolMax": 3, "channels": [], "recordingActive": False,
    })
    assert hello.status_code == 200
    snapshot = hello.json()
    assert client.put("/api/obs-livelink/v3/lease", json={
        "projectId": project.id, "ownerId": "recorder-test",
    }).status_code == 200
    assert client.put("/api/obs-livelink/v3/recording-folder", json={"enabled": True}).status_code == 200
    event_base = {"installId": identity["installId"], "processInstanceId": process_id,
                  "connectionId": snapshot["connectionId"], "connectionEpoch": snapshot["connectionEpoch"]}
    started = client.post("/api/obs-livelink/v3/lifecycle", headers=auth, json={
        **event_base, "eventId": "start-1", "sequence": 0, "kind": "obs-start",
        "monotonicNs": 100, "spanId": "video-span-1",
    })
    assert started.status_code == 200
    endpoint = f"/api/projects/{project.id}/obs-livelink/video-spans/import"
    assert client.post(endpoint, json={"spanId": "video-span-1"}).status_code == 409
    stopped = client.post("/api/obs-livelink/v3/lifecycle", headers=auth, json={
        **event_base, "eventId": "stop-1", "sequence": 1, "kind": "obs-stop",
        "monotonicNs": 200, "spanId": "video-span-1", "recordingFolder": str(folder),
        "lastRecordingPath": str(source),
    })
    assert stopped.status_code == 200

    imported = client.post(endpoint, json={"spanId": "video-span-1"})
    assert imported.status_code == 200, imported.text
    asset = imported.json()
    assert asset["sourcePath"].startswith("assets/media/")
    assert str(tmp_path) not in asset["sourcePath"]
    assert (Path(project.project_path) / asset["sourcePath"]).is_file()
    again = client.post(endpoint, json={"spanId": "video-span-1"})
    assert again.status_code == 200
    assert again.json()["id"] == asset["id"]
    journal = next((Path(project.project_path) / "assets" / "obs-livelink").glob("*/recording.json"))
    persisted = journal.read_text(encoding="utf-8")
    assert str(source) not in persisted
    assert json.loads(persisted)["videoSpans"][0]["importedVideoAssetId"] == asset["id"]
