from __future__ import annotations

import hashlib
import wave

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.output_word_review import OutputWordReview
from app.adapters.output_word_review_routes import make_output_word_review_router
from test_voice_fix import setup_fix


def setup_review(tmp_path):
    project, outputs, _lease, _speaker, _scripts, _edits, output, _engine = setup_fix(tmp_path)
    segments = output.segments
    words = []
    for segment_index, segment in enumerate(segments):
        start = segment.start + 0.04
        end = min(segment.end - 0.04, start + 0.08)
        words.append({"word": f"word-{segment_index}", "start": start, "end": end,
            "segmentIndex": segment_index, "timingTrusted": segment_index == 0,
            "timingSource": "script-proportional" if segment_index else "studio-dtw"})
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
