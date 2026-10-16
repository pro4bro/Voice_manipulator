from __future__ import annotations

import hashlib
import json
import wave

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.output_word_review import OutputWordReview, OutputWordReviewConflict
from app.adapters.output_word_review_routes import make_output_word_review_router
from test_voice_fix import setup_fix


def setup_review(tmp_path):
    project, outputs, _lease, _speaker, _scripts, _edits, output, _engine = setup_fix(tmp_path)
    segment = output.segments[0]
    words = []
    for index, start in enumerate((segment.start + 0.04, segment.start + 0.20)):
        words.append({"word": f"word-{index}", "start": start, "end": start + 0.08,
            "segmentIndex": 0, "timingTrusted": index == 0,
            "timingSource": "script-proportional" if index else "studio-dtw"})
    saved = output.model_copy(update={"words": words, "word_timing_quality": "partial"})
    outputs.save(project.id, saved)
    service = OutputWordReview(projects=outputs.projects, outputs=outputs)
    return project, outputs, saved, service


def wav_pcm(path):
    with wave.open(str(path), "rb") as audio:
        assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) == (1, 2, 24000, "NONE")
        return audio.readframes(audio.getnframes()), audio.getnframes()


def test_word_review_plan_exposes_trusted_and_untrusted_saved_words_without_promoting_them(tmp_path):
    project, _outputs, output, service = setup_review(tmp_path)
    plan = service.plan(project.id, output.id)
    assert plan["totalWords"] == len(output.words) == 2
    assert plan["trustedWords"] == 1
    assert [item["timingTrusted"] for item in plan["words"]] == [True, False]
    assert [item["timingSource"] for item in plan["words"]] == ["studio-dtw", "script-proportional"]
    assert all(item["minFrame"] < item["startFrame"] < item["endFrame"] < item["maxFrame"]
        for item in plan["words"])
    assert plan["sampleRate"] == 24000 and plan["frames"] > 0 and plan["key"]


def test_word_review_untrusted_word_gets_exact_segment_bounded_crop_and_range_http(tmp_path):
    project, outputs, output, service = setup_review(tmp_path)
    plan = service.plan(project.id, output.id)
    target = plan["words"][1]
    path, provenance = service.audio(project.id, output.id, 1, plan["key"])
    pcm, frames = wav_pcm(path)
    assert provenance["startFrame"] == max(target["minFrame"], target["startFrame"] - 4800)
    assert provenance["endFrame"] == min(target["maxFrame"], target["endFrame"] + 4800)
    assert frames == provenance["endFrame"] - provenance["startFrame"]
    source_path = outputs.audio_path(project.id, output.id)
    with wave.open(str(source_path), "rb") as audio:
        audio.setpos(provenance["startFrame"])
        expected = audio.readframes(frames)
    assert pcm == expected

    app = FastAPI()
    app.include_router(make_output_word_review_router(service))
    client = TestClient(app)
    prefix = f"/api/projects/{project.id}/voice-outputs/{output.id}/word-review"
    response = client.get(f"{prefix}/audio", params={"index": 1, "key": plan["key"]},
        headers={"Range": "bytes=0-31"})
    assert response.status_code == 206
    assert response.headers["content-range"].startswith("bytes 0-31/")
    assert response.headers["x-word-review-index"] == "1"
    assert response.content == path.read_bytes()[:32]


def test_word_review_refreshes_identity_rejects_stale_key_and_rebuilds_corrupt_cache(tmp_path):
    project, outputs, output, service = setup_review(tmp_path)
    plan = service.plan(project.id, output.id)
    path, _ = service.audio(project.id, output.id, 0, plan["key"])
    expected = path.read_bytes()
    path.write_bytes(b"corrupt cache")
    rebuilt, _ = service.audio(project.id, output.id, 0, plan["key"])
    assert rebuilt.read_bytes() == expected

    changed_words = [dict(word) for word in output.words]
    changed_words[0]["text"] = "changed"
    outputs.save(project.id, output.model_copy(update={"words": changed_words}))
    with pytest.raises(ValueError, match="changed"):
        service.audio(project.id, output.id, 0, plan["key"])
    refreshed = service.plan(project.id, output.id)
    assert refreshed["key"] != plan["key"]
    assert hashlib.sha256(outputs.audio_path(project.id, output.id).read_bytes()).hexdigest() == plan["audioSha256"]


def test_word_review_fails_closed_on_overlapping_or_wrong_segment_word_bounds(tmp_path):
    project, outputs, output, service = setup_review(tmp_path)
    overlapping = [dict(word) for word in output.words]
    overlapping[1]["start"] = overlapping[0]["start"]
    overlapping[1]["end"] = overlapping[0]["end"]
    outputs.save(project.id, output.model_copy(update={"words": overlapping}))
    with pytest.raises(ValueError, match="overlaps"):
        service.plan(project.id, output.id)

    wrong_owner = [dict(word) for word in output.words]
    wrong_owner[0]["segmentIndex"] = 1
    outputs.save(project.id, output.model_copy(update={"words": wrong_owner}))
    with pytest.raises(ValueError, match="owning segment"):
        service.plan(project.id, output.id)


def test_word_review_rejects_missing_and_escaped_audio(tmp_path, monkeypatch):
    project, outputs, output, service = setup_review(tmp_path)
    with pytest.raises(KeyError):
        service.plan(project.id, "output-absent")

    outside = tmp_path.parent / "outside.wav"
    outside.write_bytes(outputs.audio_path(project.id, output.id).read_bytes())
    monkeypatch.setattr(outputs, "audio_path", lambda _project_id, _output_id: outside)
    with pytest.raises(ValueError, match="escapes"):
        service.plan(project.id, output.id)


def test_word_review_http_rejects_stale_identity_and_missing_word_with_clear_status(tmp_path):
    project, outputs, output, service = setup_review(tmp_path)
    app = FastAPI()
    app.include_router(make_output_word_review_router(service))
    client = TestClient(app)
    prefix = f"/api/projects/{project.id}/voice-outputs/{output.id}/word-review"
    plan = client.get(prefix).json()
    stale = client.get(f"{prefix}/audio", params={"index": 0, "key": "0" * 64})
    missing = client.get(f"{prefix}/audio", params={"index": 99, "key": plan["key"]})
    assert stale.status_code == 409
    assert missing.status_code == 404
    outputs.delete(project.id, output.id)
    assert client.get(prefix).status_code == 404


def test_word_review_apply_requires_explicit_confirmation_and_changes_only_listed_words(tmp_path):
    project, outputs, source, service = setup_review(tmp_path)
    before_audio = outputs.audio_path(project.id, source.id).read_bytes()
    before_source_metadata = service._metadata_sha(outputs.get(project.id, source.id))
    plan = service.plan(project.id, source.id)
    word = plan["words"][0]
    request = {"expectedKey": plan["key"], "reviewed": True,
        "changes": [{"index": 0, "startFrame": word["startFrame"], "endFrame": word["endFrame"]}]}
    result = service.save(project.id, source.id, request)
    applied = result["output"]
    assert result["sourceOutputId"] == source.id and applied.id != source.id
    assert outputs.audio_path(project.id, applied.id).read_bytes() == before_audio
    assert outputs.audio_path(project.id, source.id).read_bytes() == before_audio
    assert service._metadata_sha(outputs.get(project.id, source.id)) == before_source_metadata
    assert applied.words[0]["timingTrusted"] is True
    assert applied.words[0]["timingSource"] == "user-reviewed"
    assert applied.words[0]["timingReview"]["originalTimingTrusted"] is True
    assert applied.words[1] == source.words[1]
    lineage = applied.parameters["wordTimingReview"]
    assert lineage["version"] == 1 and lineage["sourceOutputId"] == source.id
    assert lineage["indexes"] == [0] and lineage["requestHash"]
    assert applied.word_timing_quality == "needs-alignment"

    with pytest.raises(Exception):
        service.save(project.id, source.id, {"expectedKey": plan["key"], "changes": request["changes"]})


def test_word_review_apply_accepts_multiple_reviewed_words_and_computes_quality_from_flags(tmp_path):
    project, outputs, source, service = setup_review(tmp_path)
    plan = service.plan(project.id, source.id)
    changes = [{"index": item["index"], "startFrame": item["startFrame"], "endFrame": item["endFrame"]}
        for item in plan["words"]]
    result = service.save(project.id, source.id,
        {"expectedKey": plan["key"], "reviewed": True, "changes": changes})
    assert result["output"].word_timing_quality == "source"
    assert all(word["timingTrusted"] is True and word["timingSource"] == "user-reviewed"
        for word in result["output"].words)
    assert result["output"].parameters["wordTimingReview"]["indexes"] == [0, 1]
    assert len(outputs.list(project.id)) == 2


def test_word_review_apply_rejects_duplicate_invalid_overlap_out_of_segment_and_stale_requests(tmp_path):
    project, _outputs, source, service = setup_review(tmp_path)
    plan = service.plan(project.id, source.id)
    word0, word1 = plan["words"]
    with pytest.raises(ValueError, match="unique"):
        service.save(project.id, source.id, {"expectedKey": plan["key"], "reviewed": True,
            "changes": [{"index": 0, "startFrame": word0["startFrame"], "endFrame": word0["endFrame"]}] * 2})
    with pytest.raises(ValueError, match="outside"):
        service.save(project.id, source.id, {"expectedKey": plan["key"], "reviewed": True,
            "changes": [{"index": 0, "startFrame": word0["startFrame"], "endFrame": word0["maxFrame"] + 1}]})
    with pytest.raises(ValueError, match="overlap"):
        service.save(project.id, source.id, {"expectedKey": plan["key"], "reviewed": True,
            "changes": [{"index": 1, "startFrame": word0["startFrame"], "endFrame": word0["endFrame"]}]})
    with pytest.raises(OutputWordReviewConflict, match="changed"):
        service.save(project.id, source.id, {"expectedKey": "0" * 64, "reviewed": True,
            "changes": [{"index": 0, "startFrame": word0["startFrame"], "endFrame": word0["endFrame"]}]})


def test_word_review_apply_is_idempotent_after_reopen_and_rejects_corrupt_or_tampered_receipt(tmp_path):
    project, outputs, source, service = setup_review(tmp_path)
    plan = service.plan(project.id, source.id)
    word = plan["words"][0]
    request = {"expectedKey": plan["key"], "reviewed": True,
        "changes": [{"index": 0, "startFrame": word["startFrame"], "endFrame": word["endFrame"]}]}
    first = service.save(project.id, source.id, request)
    reopened = OutputWordReview(projects=outputs.projects, outputs=outputs)
    second = reopened.save(project.id, source.id, request)
    assert second["output"].id == first["output"].id
    assert len(outputs.list(project.id)) == 2

    receipt_path = reopened._receipt_path(project.id, first["output"].parameters["wordTimingReview"]["requestHash"])
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    receipt_path.write_text(json.dumps({**receipt, "outputId": "output-missing"}), encoding="utf-8")
    with pytest.raises(OutputWordReviewConflict, match="missing|invalid|id"):
        reopened.save(project.id, source.id, request)

    receipt_path.write_text("{", encoding="utf-8")
    with pytest.raises(OutputWordReviewConflict, match="corrupt"):
        reopened.save(project.id, source.id, request)


def test_word_review_apply_rejects_changed_source_and_tampered_accepted_audio_or_metadata(tmp_path):
    project, outputs, source, service = setup_review(tmp_path)
    source_audio = outputs.audio_path(project.id, source.id)
    original_source_audio = source_audio.read_bytes()
    plan = service.plan(project.id, source.id)
    word = plan["words"][0]
    request = {"expectedKey": plan["key"], "reviewed": True,
        "changes": [{"index": 0, "startFrame": word["startFrame"], "endFrame": word["endFrame"]}]}
    source_audio.write_bytes(original_source_audio + b"changed")
    with pytest.raises(OutputWordReviewConflict, match="changed"):
        service.save(project.id, source.id, request)
    source_audio.write_bytes(original_source_audio)

    applied = service.save(project.id, source.id, request)["output"]
    applied_path = outputs.audio_path(project.id, applied.id)
    output_bytes = applied_path.read_bytes()
    outputs.save(project.id, applied.model_copy(update={"name": "tampered metadata"}))
    with pytest.raises(OutputWordReviewConflict, match="metadata"):
        service.save(project.id, source.id, request)
    outputs.save(project.id, applied)

    applied_path.write_bytes(output_bytes + b"tampered")
    with pytest.raises(OutputWordReviewConflict, match="WAV or metadata"):
        service.save(project.id, source.id, request)


def test_word_review_apply_http_returns_saved_output_and_rejects_missing_confirmation(tmp_path):
    project, _outputs, source, service = setup_review(tmp_path)
    app = FastAPI()
    app.include_router(make_output_word_review_router(service))
    client = TestClient(app)
    prefix = f"/api/projects/{project.id}/voice-outputs/{source.id}/word-review"
    plan = client.get(prefix).json()
    item = plan["words"][0]
    payload = {"expectedKey": plan["key"], "reviewed": True,
        "changes": [{"index": 0, "startFrame": item["startFrame"], "endFrame": item["endFrame"]}]}
    response = client.post(prefix + "/apply", json=payload)
    assert response.status_code == 200
    assert response.json()["sourceOutputId"] == source.id
    assert response.json()["output"]["parameters"]["wordTimingReview"]["indexes"] == [0]
    missing_confirmation = client.post(prefix + "/apply", json={**payload, "reviewed": False})
    assert missing_confirmation.status_code == 422


def test_word_review_audition_crops_proposed_boundaries_and_rejects_invalid_proposals(tmp_path):
    project, outputs, source, service = setup_review(tmp_path)
    plan = service.plan(project.id, source.id)
    item = plan["words"][0]
    target_start, target_end = item["startFrame"] + 12, item["endFrame"] - 12
    path, provenance = service.audio(project.id, source.id, 0, plan["key"], target_start, target_end)
    assert provenance["targetStartFrame"] == target_start
    assert provenance["targetEndFrame"] == target_end
    assert provenance["startFrame"] == max(item["minFrame"], target_start - 4800)
    assert provenance["endFrame"] == min(item["maxFrame"], target_end + 4800)
    with wave.open(str(outputs.audio_path(project.id, source.id)), "rb") as audio:
        audio.setpos(provenance["startFrame"])
        exact_pcm = audio.readframes(provenance["frames"])
    assert wav_pcm(path)[0] == exact_pcm
    with pytest.raises(ValueError, match="overlaps"):
        service.audio(project.id, source.id, 0, plan["key"], item["minFrame"], plan["words"][1]["endFrame"])
    with pytest.raises(ValueError, match="inside"):
        service.audio(project.id, source.id, 0, plan["key"], item["minFrame"] - 1, item["endFrame"])

    app = FastAPI()
    app.include_router(make_output_word_review_router(service))
    client = TestClient(app)
    prefix = f"/api/projects/{project.id}/voice-outputs/{source.id}/word-review/audio"
    response = client.get(prefix, params={"index": 0, "key": plan["key"],
        "startFrame": target_start, "endFrame": target_end})
    assert response.status_code == 200
    assert response.headers["x-word-review-target-start-frame"] == str(target_start)
    partial = client.get(prefix, params={"index": 0, "key": plan["key"], "startFrame": target_start})
    assert partial.status_code == 409
