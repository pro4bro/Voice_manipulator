from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import shutil
import threading
import time
import wave
from dataclasses import replace
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_reading_sessions import FileReadingSessions
from app.adapters.media_import_processor import MediaImportProcessor
from app.domain.models import ProjectCreate, ReadingSession
from app.settings import Settings


def wav_bytes() -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24000)
        audio.writeframes(b"\x01\x00" * 2400)
    return buffer.getvalue()


def write_test_pack(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    payload = {
        "packId": "test-read-v1",
        "language": "vi",
        "languageName": "Tiếng Việt",
        "title": "Bài kiểm tra",
        "version": 1,
        "license": "test",
        "passages": [{
            "id": "angry-passage",
            "kind": "emotion",
            "emotion": "angry",
            "title": "Dứt khoát",
            "direction": "Đọc rõ lời.",
            "cards": [
                {"id": "card-a", "text": "Một câu đọc thử.", "tags": []},
                {"id": "card-b", "text": "Câu đọc tiếp theo.", "tags": []},
            ],
        }],
    }
    (root / "test.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return root


@pytest.fixture
def reading_client(tmp_path, monkeypatch):
    from app.main import create_app

    pack_root = write_test_pack(tmp_path / "packs")
    settings = replace(
        Settings.from_env(), data_root=tmp_path / "data", reading_packs_root=pack_root,
        authored_reading_packs_root=tmp_path / "authored",
    )
    monkeypatch.setattr(MediaImportProcessor, "_probe", lambda _self, _path: {
        "streams": [{"codec_type": "audio", "codec_name": "pcm_s16le", "sample_rate": "24000", "channels": 1}],
        "format": {"duration": "0.1"},
    })
    monkeypatch.setattr(MediaImportProcessor, "_extract_audio", lambda _self, source, destination: shutil.copyfile(source, destination))
    with TestClient(create_app(settings=settings)) as client:
        project_response = client.post("/api/projects", json={"name": "Reading Session Test"})
        assert project_response.status_code == 201
        project = project_response.json()
        catalog = client.put(
            f"/api/projects/{project['id']}/training-catalog",
            json={"speakers": [{"id": "speaker-test", "name": "Người đọc thử"}]},
        )
        assert catalog.status_code == 200
        yield client, project


def create_session(client: TestClient, project_id: str, session_id: str) -> dict:
    response = client.post(f"/api/projects/{project_id}/reading-sessions", json={
        "sessionId": session_id,
        "packId": "test-read-v1",
        "speakerProfileId": "speaker-test",
        "emotions": ["angry"],
        "mode": "flow",
    })
    assert response.status_code == 201, response.text
    return response.json()


def post_take(client: TestClient, project_id: str, session: dict, audio: bytes, capture_id: str,
              card_id: str | None = None, expected_revision: int | None = None) -> dict:
    return client.post(
        f"/api/projects/{project_id}/reading-sessions/{session['id']}/takes",
        data={"capture_id": capture_id, "card_id": card_id or session["plan"]["cards"][session["cardIndex"]]["cardId"],
              "expected_revision": expected_revision or session["revision"]},
        files={"file": ("take.wav", audio, "audio/wav")},
    )


def test_session_snapshot_survives_project_move_and_refuses_unknown_schema(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Portable reading"))
    from app.adapters.file_training_catalog import FileTrainingCatalog
    from app.domain.models import SpeakerProfile, TrainingCatalog

    FileTrainingCatalog(projects).save(project.id, TrainingCatalog(speakers=[SpeakerProfile(id="speaker-a", name="Reader")]))
    session = ReadingSession(
        id="92345678-1234-4234-8234-123456789abc",
        speaker_profile_id="speaker-a", speaker_name="Reader", pack_title="Original pack", pack_version=1,
        plan={"pack_id": "old-pack", "language": "vi", "mode": "flow", "emotions": ["angry"], "cards": [{
            "card_id": "card-a", "passage_id": "passage-a", "passage_title": "Title", "direction": "Read",
            "emotion": "angry", "text": "Frozen source text.", "estimated_seconds": 1.0,
        }]},
    )
    repository = FileReadingSessions(projects)
    repository.create(project.id, session)
    source_file = Path(project.project_path) / "assets/training/reading-sessions" / session.id / "session.json"
    assert "C:" not in source_file.read_text(encoding="utf-8")
    moved = tmp_path / "moved" / Path(project.project_path).name
    moved.parent.mkdir()
    shutil.move(project.project_path, moved)
    projects.open(str(moved))
    assert repository.get(project.id, session.id).plan.cards[0].text == "Frozen source text."

    source_file = moved / "assets/training/reading-sessions" / session.id / "session.json"
    payload = json.loads(source_file.read_text(encoding="utf-8"))
    payload["schemaVersion"] = 2
    source_file.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(ValueError, match="Unsupported Reading Session schema"):
        repository.get(project.id, session.id)


def test_unknown_upload_response_is_reconciled_and_retry_does_not_import_twice(reading_client, monkeypatch):
    client, project = reading_client
    session_id = "92345678-1234-4234-8234-123456789abc"
    session = create_session(client, project["id"], session_id)
    assert session["speakerProfileId"] == "speaker-test"
    assert session["plan"]["cards"][0]["text"] == "Một câu đọc thử."
    same = client.post(f"/api/projects/{project['id']}/reading-sessions", json={
        "sessionId": session_id, "packId": "test-read-v1", "speakerProfileId": "speaker-test",
        "emotions": ["angry"], "mode": "flow",
    })
    assert same.status_code == 201
    assert same.json()["id"] == session_id
    conflicting_session = client.post(f"/api/projects/{project['id']}/reading-sessions", json={
        "sessionId": session_id, "packId": "different-pack", "speakerProfileId": "speaker-test",
        "emotions": ["angry"], "mode": "flow",
    })
    assert conflicting_session.status_code == 409

    original_process = MediaImportProcessor.process
    imported = {"count": 0}

    async def publish_then_lose_response(self, *args, **kwargs):
        result = await original_process(self, *args, **kwargs)
        imported["count"] += 1
        raise RuntimeError("simulated connection loss after media index publication")

    monkeypatch.setattr(MediaImportProcessor, "process", publish_then_lose_response)
    audio = wav_bytes()
    capture_id = "12345678-1234-4234-8234-123456789abc"
    lost = post_take(client, project["id"], session, audio, capture_id)
    assert lost.status_code == 503
    assert len(client.get(f"/api/projects/{project['id']}/media").json()) == 1

    recovered = client.get(f"/api/projects/{project['id']}/reading-sessions/{session_id}")
    assert recovered.status_code == 200
    linked = recovered.json()
    assert linked["cardIndex"] == 1
    assert linked["takes"][0]["captureId"] == capture_id
    assert linked["takes"][0]["durationSeconds"] == pytest.approx(0.1)
    assert linked["recordedSecondsByCard"]["card-a"] == pytest.approx(0.1)
    assert linked["pendingCaptures"] == []

    monkeypatch.setattr(MediaImportProcessor, "process", original_process)
    retry = post_take(client, project["id"], session, audio, capture_id)
    assert retry.status_code == 200, retry.text
    assert retry.json()["session"]["takes"][0]["assetId"] == linked["takes"][0]["assetId"]
    assert imported["count"] == 1
    assets = client.get(f"/api/projects/{project['id']}/media").json()
    assert len(assets) == 1
    assert assets[0]["text"] == "Một câu đọc thử."
    assert assets[0]["captureTier"] == "guided"
    assert assets[0]["sourceContentHash"]
    assert assets[0]["readingSessionId"] == session_id
    assert assets[0]["speakerProfileIds"] == ["speaker-test"]
    assert assets[0]["emotion"] == "angry"

    changed_bytes = wav_bytes()[:-2] + b"\x02\x00"
    conflict = post_take(client, project["id"], session, changed_bytes, capture_id)
    assert conflict.status_code == 409


def test_unpublished_intent_reopens_retryably_and_cannot_block_skip_or_end(reading_client, monkeypatch):
    client, project = reading_client
    session_id = "92345678-1234-4234-8234-123456789abc"
    session = create_session(client, project["id"], session_id)
    audio = wav_bytes()
    capture_id = "12345678-1234-4234-8234-123456789abc"
    original_process = MediaImportProcessor.process
    attempted = {"once": False}

    async def fail_before_publication_once(self, *args, **kwargs):
        if not attempted["once"]:
            attempted["once"] = True
            raise RuntimeError("simulated importer failure before index publication")
        return await original_process(self, *args, **kwargs)

    monkeypatch.setattr(MediaImportProcessor, "process", fail_before_publication_once)
    first = post_take(client, project["id"], session, audio, capture_id)
    assert first.status_code == 503
    assert client.get(f"/api/projects/{project['id']}/media").json() == []

    reopened = client.get(f"/api/projects/{project['id']}/reading-sessions/{session_id}").json()
    assert reopened["pendingCaptures"] == []
    assert reopened["retiredCaptures"][0]["captureId"] == capture_id
    collision = post_take(client, project["id"], reopened, wav_bytes()[:-2] + b"\x03\x00", capture_id)
    assert collision.status_code == 409

    retry = post_take(client, project["id"], reopened, audio, capture_id,
                      expected_revision=session["revision"])
    assert retry.status_code == 200, retry.text
    assert retry.json()["session"]["takes"][0]["captureId"] == capture_id
    assert retry.json()["session"]["retiredCaptures"] == []
    assert len(client.get(f"/api/projects/{project['id']}/media").json()) == 1
    finished = client.post(f"/api/projects/{project['id']}/reading-sessions/{session_id}/skip", json={
        "expectedRevision": retry.json()["session"]["revision"], "cardId": "card-b",
    })
    assert finished.status_code == 200
    assert finished.json()["status"] == "completed"

    second_session = create_session(client, project["id"], "92345678-1234-4234-8234-123456789abd")
    late_capture = "12345678-1234-4234-8234-123456789abd"
    attempted["once"] = False
    failed = post_take(client, project["id"], second_session, audio, late_capture)
    assert failed.status_code == 503
    retired = client.get(f"/api/projects/{project['id']}/reading-sessions/{second_session['id']}").json()
    skipped = client.post(f"/api/projects/{project['id']}/reading-sessions/{second_session['id']}/skip", json={
        "expectedRevision": retired["revision"], "cardId": "card-a",
    }).json()
    late = post_take(client, project["id"], skipped, audio, late_capture, "card-a")
    assert late.status_code == 409
    ended = client.post(f"/api/projects/{project['id']}/reading-sessions/{second_session['id']}/end", json={
        "expectedRevision": skipped["revision"],
    })
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"


def test_skip_uses_revision_and_one_active_session_is_enforced(reading_client):
    client, project = reading_client
    session = create_session(client, project["id"], "92345678-1234-4234-8234-123456789abc")
    duplicate = client.post(f"/api/projects/{project['id']}/reading-sessions", json={
        "sessionId": "92345678-1234-4234-8234-123456789abd", "packId": "test-read-v1",
        "speakerProfileId": "speaker-test", "emotions": ["angry"], "mode": "flow",
    })
    assert duplicate.status_code == 409

    skipped = client.post(f"/api/projects/{project['id']}/reading-sessions/{session['id']}/skip", json={
        "expectedRevision": session["revision"], "cardId": "card-a",
    })
    assert skipped.status_code == 200
    assert skipped.json()["cardIndex"] == 1
    assert skipped.json()["skippedCardIds"] == ["card-a"]
    stale = client.post(f"/api/projects/{project['id']}/reading-sessions/{session['id']}/skip", json={
        "expectedRevision": session["revision"], "cardId": "card-b",
    })
    assert stale.status_code == 409
    ended = client.post(f"/api/projects/{project['id']}/reading-sessions/{session['id']}/end", json={
        "expectedRevision": skipped.json()["revision"],
    })
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"
    page = client.get(f"/api/projects/{project['id']}/reading-sessions?status=ended&limit=1")
    assert page.status_code == 200
    assert page.json()["total"] == 1
    assert page.json()["items"][0]["status"] == "ended"


def test_blocked_session_file_read_does_not_block_api_health(reading_client, monkeypatch):
    client, project = reading_client
    session = create_session(client, project["id"], "92345678-1234-4234-8234-123456789abc")
    repository = client.app.state.reading_sessions
    original_get = repository.get
    entered = threading.Event()
    release = threading.Event()

    def blocked_get(*args):
        entered.set()
        release.wait(timeout=3)
        return original_get(*args)

    monkeypatch.setattr(repository, "get", blocked_get)
    with ThreadPoolExecutor(max_workers=2) as executor:
        reading = executor.submit(
            client.get,
            f"/api/projects/{project['id']}/reading-sessions/{session['id']}",
        )
        try:
            assert entered.wait(timeout=1)
            started = time.perf_counter()
            health = executor.submit(client.get, "/api/health").result(timeout=1)
            assert health.status_code == 200
            assert time.perf_counter() - started < 1
        finally:
            release.set()
        assert reading.result(timeout=2).status_code == 200
