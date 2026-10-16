from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.voice_patch_history import VoicePatchHistory
from app.adapters.voice_patch_review_routes import make_voice_patch_review_router
from app.adapters.voice_patch_reviews import VoicePatchReviewRequest, VoicePatchReviews
from test_voice_patch_history import accepted
from test_voice_patch_processor import setup_patch


def review_fixture(tmp_path):
    project, outputs, _lease, _speaker, _scripts, _edits, source, _engine, _voice, _store, draft, _processor = setup_patch(tmp_path)
    history, output, receipt = accepted(project, outputs, source, draft.draft, job_suffix="review")
    history.record(project.id, "voice-patch", receipt)
    reviews = VoicePatchReviews(history)
    return project, outputs, output, history, reviews


def app_for(reviews):
    app = FastAPI()
    app.include_router(make_voice_patch_review_router(reviews))
    return app


def request_payload(packet, *, revision=0, key=None, listened=True, notes="Auditioned in the fixture."):
    return {"expectedRevision": revision, "expectedKey": key or packet["expectedKey"], "listened": listened,
        "ratings": {"clarity": "acceptable", "identity": "needs-work", "delivery": "unassessed",
            "transitions": "acceptable"}, "notes": notes}


def test_get_starts_unreviewed_with_all_ratings_unassessed(tmp_path):
    project, _outputs, output, _history, reviews = review_fixture(tmp_path)
    packet = reviews.get(project.id, output.id)
    assert packet["status"] == "unreviewed"
    assert packet["revision"] == 0
    assert packet["expectedKey"] and "review" not in packet
    assert packet["ratings"] == {"clarity": "unassessed", "identity": "unassessed",
        "delivery": "unassessed", "transitions": "unassessed"}
    assert packet["notes"] == ""


def test_explicit_listening_is_required_and_current_review_reopens(tmp_path):
    project, _outputs, output, _history, reviews = review_fixture(tmp_path)
    app = app_for(reviews)
    url = f"/api/projects/{project.id}/voice-patch/history/{output.id}/review"
    with TestClient(app) as client:
        before = client.get(url).json()
        rejected = client.post(url, json=request_payload(before, listened=False))
        assert rejected.status_code == 422
        saved = client.post(url, json=request_payload(before))
        assert saved.status_code == 200, saved.text
        assert saved.json()["status"] == "current"
        assert saved.json()["review"]["listened"] is True
        restored = client.get(url).json()
        assert restored["status"] == "current"
        assert restored["review"]["notes"] == "Auditioned in the fixture."
        assert restored["review"]["ratings"]["identity"] == "needs-work"

    record = Path(project.project_path) / "notes" / "voice-patch-reviews.json"
    data = json.loads(record.read_text(encoding="utf-8"))
    assert Path(project.project_path).resolve() in record.resolve().parents
    assert data["revision"] == 1 and len(data["reviews"]) == 1
    assert str(Path(project.project_path).resolve()) not in json.dumps(data)


def test_optimistic_revision_and_accepted_key_reject_late_or_stale_writes(tmp_path):
    project, _outputs, output, _history, reviews = review_fixture(tmp_path)
    initial = reviews.get(project.id, output.id)
    request = VoicePatchReviewRequest.model_validate(request_payload(initial))
    reviews.save(project.id, output.id, request)
    stale_revision = VoicePatchReviewRequest.model_validate(request_payload(initial, revision=0, notes="Late edit"))
    with pytest.raises(ValueError, match="changed"):
        reviews.save(project.id, output.id, stale_revision)
    wrong_key = VoicePatchReviewRequest.model_validate(request_payload(initial, revision=1, key="0" * 64))
    with pytest.raises(ValueError, match="audio changed"):
        reviews.save(project.id, output.id, wrong_key)


def test_stale_assessment_is_preserved_when_review_identity_differs(tmp_path):
    project, _outputs, output, _history, reviews = review_fixture(tmp_path)
    current = reviews.get(project.id, output.id)
    reviews.save(project.id, output.id, VoicePatchReviewRequest.model_validate(request_payload(current)))
    path = Path(project.project_path) / "notes" / "voice-patch-reviews.json"
    stored = json.loads(path.read_text(encoding="utf-8"))
    stored["reviews"][0]["key"] = "0" * 64
    path.write_text(json.dumps(stored), encoding="utf-8")

    stale = reviews.get(project.id, output.id)
    assert stale["status"] == "stale"
    assert stale["review"]["notes"] == "Auditioned in the fixture."
    assert stale["expectedKey"] != stale["review"]["key"]


def test_corrupt_review_file_fails_closed_without_overwrite(tmp_path):
    project, _outputs, output, _history, reviews = review_fixture(tmp_path)
    initial = reviews.get(project.id, output.id)
    path = Path(project.project_path) / "notes" / "voice-patch-reviews.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{broken", encoding="utf-8")
    original = path.read_bytes()
    with pytest.raises(ValueError, match="corrupt"):
        reviews.get(project.id, output.id)
    with pytest.raises(ValueError, match="corrupt"):
        reviews.save(project.id, output.id, VoicePatchReviewRequest.model_validate(request_payload(initial)))
    assert path.read_bytes() == original


def test_review_path_rejects_project_notes_symlink_escape(tmp_path):
    project, _outputs, _output, _history, reviews = review_fixture(tmp_path)
    root = Path(project.project_path)
    notes = root / "notes"
    outside = tmp_path / "outside-notes"
    shutil.rmtree(notes, ignore_errors=True)
    outside.mkdir()
    try:
        notes.symlink_to(outside, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"Filesystem cannot create a test directory symlink: {exc}")
    with pytest.raises(ValueError, match="escapes"):
        reviews._path(project.id)


def test_unaccepted_or_tampered_output_has_no_review_endpoint(tmp_path):
    project, outputs, output, _history, reviews = review_fixture(tmp_path)
    app = app_for(reviews)
    url = f"/api/projects/{project.id}/voice-patch/history/{output.id}/review"
    with TestClient(app) as client:
        assert client.get(f"/api/projects/{project.id}/voice-patch/history/output-unknown/review").status_code == 404
        outputs.audio_path(project.id, output.id).write_bytes(b"tampered")
        assert client.get(url).status_code == 404
        post = client.post(url, json={"expectedRevision": 0, "expectedKey": "0" * 64, "listened": True})
        assert post.status_code == 404
