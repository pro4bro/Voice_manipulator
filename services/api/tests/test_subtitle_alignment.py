from copy import deepcopy
import json
from pathlib import Path
import shutil
import wave

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.subtitle_alignment import SubtitleAlignment
from app.adapters.subtitle_alignment_routes import subtitle_alignment_router
from app.domain.models import MediaAssetCreate, ProjectCreate, TimelineEditRange


def setup(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Alignment", location=str(tmp_path / "projects")))
    root = Path(project.project_path)
    audio = root / "assets/source.wav"
    audio.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(audio), "wb") as w:
        w.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        w.writeframes(b"\0\0" * 72000)
    words = [dict(text="Xin", start=.2, end=.4, timingSource="faster-whisper-dtw", timingTrusted=True,
                  speakerId="speaker-1", emotion="normal"),
             dict(text="chào", start=.6, end=.8, timingSource="manual", timingTrusted=True)]
    media = FileMediaLibrary(projects)
    asset = media.create(project.id, MediaAssetCreate(name="source.wav", source_path=str(audio),
        analysis_path=str(audio), source_extension=".wav", media_kind="audio", origin="import",
        duration=3, text="Xin chào", words=words, word_timing_quality="source"))
    store = SubtitleAlignment(projects, media, tmp_path / "runtime")
    app = FastAPI()
    app.include_router(subtitle_alignment_router(store))
    return projects, project, media, asset, audio, store, TestClient(app)


def url(project, asset):
    return f"/api/projects/{project.id}/media/{asset.id}/subtitle-alignment"


def proposal(client, base, **kwargs):
    response = client.post(base + "/proposals", json={"mode": "offset", "startOffsetMs": 100, "endOffsetMs": 80, **kwargs})
    assert response.status_code == 200, response.text
    return response.json()


def test_analysis_does_not_change_words_and_apply_restore_retains_metadata(tmp_path):
    projects, p, media, asset, audio, store, client = setup(tmp_path)
    base = url(p, asset)
    before = deepcopy(media.get(p.id, asset.id).words)
    raw = audio.read_bytes()
    result = proposal(client, base)
    assert media.get(p.id, asset.id).words == before
    assert result["rows"][1]["status"] == "locked"
    response = client.post(base + f"/{result['id']}/apply", json={"indexes": [0]})
    assert response.status_code == 200, response.text
    changed = media.get(p.id, asset.id).words
    assert changed[0]["start"] == pytest.approx(.3)
    assert changed[0]["end"] == pytest.approx(.48)
    assert changed[0]["speakerId"] == "speaker-1"
    assert changed[0]["sourceTiming"]["start"] == .2
    assert changed[1] == before[1]
    assert audio.read_bytes() == raw
    restored = client.post(base + f"/{result['id']}/restore")
    assert restored.status_code == 200, restored.text
    assert media.get(p.id, asset.id).words == before
    assert client.get(base + "/latest").json()["state"] == "restored"


@pytest.mark.parametrize("change", ["words", "audio", "disabled", "removed"])
def test_apply_fences_stale_inputs_without_partial_write(tmp_path, change):
    _, p, media, asset, audio, _, client = setup(tmp_path)
    base = url(p, asset)
    result = proposal(client, base)
    if change == "words":
        words = deepcopy(media.get(p.id, asset.id).words)
        words[0]["text"] = "Chúc"
        media.update_script(p.id, asset.id, "Chúc chào", "user", words)
    elif change == "audio":
        audio.write_bytes(audio.read_bytes() + b"changed")
    elif change == "disabled":
        media.set_disabled(p.id, asset.id, True)
    else:
        media.update_timeline_edits(p.id, asset.id, [TimelineEditRange(start=.1, end=.5)], [])
    before = deepcopy(media.get(p.id, asset.id).words)
    response = client.post(base + f"/{result['id']}/apply", json={"indexes": [0]})
    assert response.status_code in (409, 422), response.text
    assert media.get(p.id, asset.id).words == before


@pytest.mark.parametrize("indexes", [[], [0, 0], [1], [99]])
def test_invalid_or_locked_selection_never_writes(tmp_path, indexes):
    _, p, media, asset, _, _, client = setup(tmp_path)
    base = url(p, asset)
    result = proposal(client, base)
    before = deepcopy(media.get(p.id, asset.id).words)
    response = client.post(base + f"/{result['id']}/apply", json={"indexes": indexes})
    assert response.status_code == 422, response.text
    assert media.get(p.id, asset.id).words == before


def test_reviewed_override_and_stale_restore_are_explicit(tmp_path):
    _, p, media, asset, _, _, client = setup(tmp_path)
    base = url(p, asset)
    result = proposal(client, base)
    response = client.post(base + f"/{result['id']}/apply", json={"indexes": [0],
        "edits": [{"index": 0, "start": .31, "end": .49, "reviewed": True}]})
    assert response.status_code == 200, response.text
    assert media.get(p.id, asset.id).words[0]["timingSource"] == "manual"
    current = media.get(p.id, asset.id)
    media.update_script(p.id, asset.id, current.text + "!", "user", current.words)
    assert client.post(base + f"/{result['id']}/restore").status_code == 409
    assert media.get(p.id, asset.id).text.endswith("!")


def test_changed_or_overlapping_overrides_cannot_bypass_proposal(tmp_path):
    _, p, media, asset, _, _, client = setup(tmp_path)
    base = url(p, asset)
    result = proposal(client, base)
    before = deepcopy(media.get(p.id, asset.id).words)
    for edit in [{"index": 0, "start": .3, "end": .7, "reviewed": True},
                 {"index": 0, "start": .3, "end": .48, "reviewed": False}]:
        response = client.post(base + f"/{result['id']}/apply", json={"indexes": [0], "edits": [edit]})
        assert response.status_code == 422, response.text
    assert media.get(p.id, asset.id).words == before


def test_missing_model_is_visible_and_proposals_are_portable(tmp_path):
    projects, p, media, asset, _, store, client = setup(tmp_path)
    base = url(p, asset)
    result = client.post(base + "/proposals", json={"mode": "auto"}).json()
    assert result["aligner"]["status"] == "unavailable"
    assert result["summary"]["ready"] == 0
    original = Path(p.project_path)
    moved = original.with_name("moved")
    shutil.move(str(original), str(moved))
    # Existing Open Existing path reconnects without altering the proposal's relative references.
    reopened = projects.open(str(moved))
    assert reopened.id == p.id
    latest = store.latest(p.id, asset.id)
    assert latest["id"] == result["id"]
    assert not latest["stale"]
    for path in moved.rglob("proposal-*.json"):
        assert str(original) not in path.read_text(encoding="utf-8")


@pytest.mark.parametrize("payload", [{"indexes": [True]}, {"indexes": [0.5]}, {"startOffsetMs": True}])
def test_request_does_not_coerce_boolean_or_fractional_indexes(tmp_path, payload):
    _, p, _, asset, _, _, client = setup(tmp_path)
    assert client.post(url(p, asset) + "/proposals", json=payload).status_code == 422


@pytest.mark.parametrize("changed_audio", [False, True])
def test_interrupted_receipt_recovery_is_bound_to_the_same_source(tmp_path, monkeypatch, changed_audio):
    _, p, media, asset, audio, store, client = setup(tmp_path)
    result = proposal(client, url(p, asset))
    write = store._write
    def interrupted(path, document):
        if document.get("state") == "applied":
            raise OSError("simulated crash before final receipt")
        write(path, document)
    monkeypatch.setattr(store, "_write", interrupted)
    with pytest.raises(OSError):
        store.apply(p.id, asset.id, result["id"], [0], [])
    monkeypatch.setattr(store, "_write", write)
    assert media.get(p.id, asset.id).words[0]["start"] == pytest.approx(.3)
    if changed_audio:
        audio.write_bytes(audio.read_bytes() + b"changed")
    recovered = store.latest(p.id, asset.id)
    assert recovered["state"] == ("applying" if changed_audio else "applied")
    assert recovered["stale"] is changed_audio


def test_malformed_pcm_is_a_visible_validation_error(tmp_path):
    _, p, _, asset, audio, _, client = setup(tmp_path)
    audio.write_bytes(b"not a wav")
    response = client.post(url(p, asset) + "/proposals", json={"mode": "offset"})
    assert response.status_code == 422


def test_manual_words_are_diagnosed_read_only_and_modes_reuse_bound_acoustic_artifact(tmp_path, monkeypatch):
    _, p, media, asset, _, store, client = setup(tmp_path)
    base = url(p, asset)
    before = deepcopy(media.get(p.id, asset.id).words)
    monkeypatch.setattr("app.adapters.subtitle_alignment.pcm_envelope", lambda _: {
        "rms": [.1] * 300, "frameSeconds": .01, "duration": 3})
    monkeypatch.setattr(store.aligner, "report", lambda: {"status": "available"})
    monkeypatch.setattr(store, "_alignment_identity", lambda: {"worker": "fixture", "model": "fixture"})
    calls = []
    def run(root, audio, words, folder, indexes):
        from app.adapters.subtitle_alignment_audio import sha256
        calls.append(indexes)
        measured = [{"text": w["text"], "start": w["start"] + .7, "end": w["end"] + .7, "score": .95} for w in words]
        result = {"status": "complete", "words": measured, "audioSha256": sha256(audio)}
        (folder / "alignment-input.json").write_text(json.dumps({"words": words, "audioSha256": sha256(audio), "indexes": indexes}), encoding="utf-8")
        (folder / "alignment-output.json").write_text(json.dumps(result), encoding="utf-8")
        (folder / "alignment.log").write_text("unit-test aligner stub", encoding="utf-8")
        return result
    monkeypatch.setattr(store.aligner, "run", run)
    diagnostic = client.post(base + "/proposals", json={"mode": "diagnose"})
    assert diagnostic.status_code == 200, diagnostic.text
    data = diagnostic.json()
    assert calls == [[0, 1]]
    assert data["diagnostics"]["drift"]["comparedWords"] == 2
    assert data["diagnostics"]["drift"]["severeCount"] == 2
    assert data["rows"][1]["status"] == "locked"
    response = client.post(base + f"/{data['id']}/apply", json={"indexes": [0], "edits": [
        {"index": 0, "start": .3, "end": .5, "reviewed": True}]})
    assert response.status_code == 422
    for mode in ("ctc", "waveform", "group-offset", "common-offset", "edge-offset"):
        response = client.post(base + "/proposals", json={"mode": mode})
        assert response.status_code == 200, response.text
        assert response.json()["aligner"]["reused"] is True
    assert client.post(base + "/proposals", json={"mode": "offset", "startOffsetMs": 100, "endOffsetMs": 100}).status_code == 200
    assert client.post(base + "/proposals", json={"mode": "diagnose"}).json()["aligner"]["reused"] is True
    assert len(calls) == 1
    assert media.get(p.id, asset.id).words == before
    changed = deepcopy(before)
    changed[0]["start"] = .21
    media.update_script(p.id, asset.id, asset.text, "user", changed)
    assert client.post(base + "/proposals", json={"mode": "diagnose"}).status_code == 200
    assert len(calls) == 2
    all_manual = [{**w, "timingSource": "manual"} for w in media.get(p.id, asset.id).words]
    media.update_script(p.id, asset.id, asset.text, "user", all_manual)
    response = client.post(base + "/proposals", json={"mode": "diagnose"})
    assert response.status_code == 200, response.text
    assert response.json()["summary"]["locked"] == 2
    assert response.json()["diagnostics"]["drift"]["comparedWords"] == 2
    assert len(calls) == 3
    assert media.get(p.id, asset.id).words == all_manual


def test_diagnosis_keeps_invalid_source_words_inspectable_when_cuts_exist(tmp_path):
    _, p, media, asset, _, _, client = setup(tmp_path)
    words = deepcopy(media.get(p.id, asset.id).words)
    words[0]["start"] = None
    media.update_script(p.id, asset.id, asset.text, "user", words)
    media.update_timeline_edits(p.id, asset.id, [TimelineEditRange(start=.1, end=.5)], [])
    response = client.post(url(p, asset) + "/proposals", json={"mode": "diagnose"})
    assert response.status_code == 200, response.text
    assert response.json()["diagnostics"]["drift"]["invalidCount"] == 1
