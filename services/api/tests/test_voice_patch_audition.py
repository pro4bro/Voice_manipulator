from __future__ import annotations

import wave
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.voice_patch_audition import VoicePatchAudition
from app.adapters.voice_patch_audition_routes import make_voice_patch_audition_router
from app.adapters.voice_patch_history import VoicePatchHistory
from app.domain.voice_patch_jobs import VoicePatchApplyRequest
from test_hybrid_patch_processor import request as hybrid_request
from test_hybrid_patch_processor import review_target, setup_hybrid, wait as wait_hybrid
from test_voice_patch_processor import request as patch_request
from test_voice_patch_processor import setup_patch, wait_job


def applied_raw(tmp_path):
    project, outputs, _lease, speaker, scripts, _edits, source, _engine, trained, _store, draft, processor = setup_patch(tmp_path)
    script = scripts.get(project.id)
    job = wait_job(processor, project.id, processor.start(project.id, patch_request(
        draft.draft, draft.revision, script.revision, 0, trained.id, "Audition replacement")).id)
    packet = processor.apply(project.id, VoicePatchApplyRequest(
        expectedDraftRevision=draft.revision, jobId=job.id, expectedKey=job.key))
    history = VoicePatchHistory(outputs.projects, outputs)
    media = FileMediaLibrary(speaker.projects)
    audition = VoicePatchAudition(history, outputs, media)
    return project, outputs, source, packet["output"], history, media, audition


def applied_media(tmp_path):
    project, outputs, _lease, speaker, scripts, store, document, processor, _engine, source_path, trained = setup_hybrid(tmp_path)
    document = review_target(store, project, document)
    job = wait_hybrid(processor, project.id, processor.start(project.id,
        hybrid_request(document, scripts, trained.id, "Media audition replacement")).id)
    packet = processor.apply(project.id, VoicePatchApplyRequest(
        expectedDraftRevision=document.revision, jobId=job.id, expectedKey=job.key))
    history = VoicePatchHistory(outputs.projects, outputs)
    media = FileMediaLibrary(speaker.projects)
    audition = VoicePatchAudition(history, outputs, media)
    return project, outputs, source_path, packet["output"], history, media, audition


def read_wav(path: Path) -> tuple[int, bytes]:
    with wave.open(str(path), "rb") as audio:
        assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) == (1, 2, 24000, "NONE")
        frames = audio.getnframes()
        return frames, audio.readframes(frames)


def test_trained_media_without_context_resolves_saved_media_source(tmp_path):
    from test_trained_media_patch_processor import setup_trained, request, wait
    project, outputs, _lease, speaker, _scripts, store, document, processor, _engine, source_path, trained = setup_trained(tmp_path)
    document = review_target(store, project, document)
    job = wait(processor, project.id, processor.start(project.id, request(document, trained.id)).id)
    output = processor.apply(project.id, VoicePatchApplyRequest(expectedDraftRevision=document.revision,
        jobId=job.id, expectedKey=job.key))["output"]
    audition = VoicePatchAudition(VoicePatchHistory(outputs.projects, outputs), outputs, FileMediaLibrary(speaker.projects))
    plan = audition.plan(project.id, output.id)
    assert plan["sourceAvailable"] is True
    crop, _info = audition.audio(project.id, output.id, "source", "full", plan["key"])
    assert read_wav(crop) == read_wav(source_path)


def app_for(audition):
    app = FastAPI()
    app.include_router(make_voice_patch_audition_router(audition))
    return app


def test_raw_output_audition_crops_exact_pcm_and_supports_http_range(tmp_path):
    project, outputs, source, variant, _history, _media, audition = applied_raw(tmp_path)
    plan = audition.plan(project.id, variant.id)
    assert plan["sourceAvailable"] is True and plan["sourceName"] == source.name
    assert plan["voiceName"] == variant.voice_name
    target = plan["target"]
    expected_start = max(0, target["startFrame"] - 6000)
    expected_end = min(read_wav(outputs.audio_path(project.id, source.id))[0], target["endFrame"] + 6000)
    source_frames, source_pcm = read_wav(outputs.audio_path(project.id, source.id))
    source_crop, source_info = audition.audio(project.id, variant.id, "source", "region", plan["key"])
    assert source_info["startFrame"] == expected_start and source_info["endFrame"] == expected_end
    assert read_wav(source_crop) == (expected_end - expected_start,
        source_pcm[expected_start * 2:expected_end * 2])

    variant_frames, variant_pcm = read_wav(outputs.audio_path(project.id, variant.id))
    variant_end_target = target["startFrame"] + target["replacementFrames"]
    expected_variant_end = min(variant_frames, variant_end_target + 6000)
    variant_crop, variant_info = audition.audio(project.id, variant.id, "variant", "region", plan["key"])
    assert variant_info["startFrame"] == expected_start and variant_info["endFrame"] == expected_variant_end
    assert read_wav(variant_crop) == (expected_variant_end - expected_start,
        variant_pcm[expected_start * 2:expected_variant_end * 2])
    assert source_frames > target["endFrame"]

    with TestClient(app_for(audition)) as client:
        full = client.get(f"/api/projects/{project.id}/voice-patch/history/{variant.id}/audition/audio",
            params={"kind": "variant", "view": "full", "key": plan["key"]}, headers={"Range": "bytes=44-51"})
        assert full.status_code == 206
        assert full.headers["accept-ranges"] == "bytes"
        assert full.headers["x-audition-sample-rate"] == "24000"
        assert full.headers["x-audition-start-frame"] == "0"


def test_media_source_integrity_failure_blocks_source_but_keeps_variant_audition(tmp_path):
    project, outputs, source_path, variant, _history, _media, audition = applied_media(tmp_path)
    changed = bytearray(source_path.read_bytes())
    changed[-1] ^= 0x01
    source_path.write_bytes(changed)
    plan = audition.plan(project.id, variant.id)
    assert plan["sourceAvailable"] is False
    assert "checksum" in plan["sourceReason"]
    with TestClient(app_for(audition)) as client:
        source_response = client.get(plan["audioUrls"]["source"]["region"])
        variant_response = client.get(plan["audioUrls"]["variant"]["region"])
        assert source_response.status_code == 409
        assert variant_response.status_code == 200
    source_path.unlink()
    assert audition.plan(project.id, variant.id)["sourceAvailable"] is False
    assert outputs.audio_path(project.id, variant.id).is_file()


def test_corrupt_audition_cache_is_rebuilt_from_immutable_input(tmp_path):
    project, _outputs, _source, variant, _history, _media, audition = applied_raw(tmp_path)
    plan = audition.plan(project.id, variant.id)
    path, info = audition.audio(project.id, variant.id, "variant", "tail", plan["key"])
    expected = read_wav(path)
    path.write_bytes(b"corrupt")
    rebuilt, rebuilt_info = audition.audio(project.id, variant.id, "variant", "tail", plan["key"])
    assert rebuilt == path and rebuilt_info == info and read_wav(rebuilt) == expected


def test_changed_audition_identity_and_unknown_or_tampered_outputs_fail_closed(tmp_path):
    project, outputs, _source, variant, _history, _media, audition = applied_raw(tmp_path)
    plan = audition.plan(project.id, variant.id)
    with TestClient(app_for(audition)) as client:
        wrong_key = client.get(plan["variantUrl"].replace(plan["key"], "0" * 64))
        unknown = client.get(f"/api/projects/{project.id}/voice-patch/history/output-missing/audition")
        assert wrong_key.status_code == 409
        assert unknown.status_code == 404
        outputs.audio_path(project.id, variant.id).write_bytes(b"tampered")
        rejected = client.get(f"/api/projects/{project.id}/voice-patch/history/{variant.id}/audition")
        assert rejected.status_code == 404


def test_source_path_escape_is_reported_as_unavailable(tmp_path, monkeypatch):
    project, _outputs, _source_path, variant, _history, media, audition = applied_media(tmp_path)
    outside = tmp_path / "outside.wav"
    outside.write_bytes(b"not media")
    monkeypatch.setattr(media, "resolve_audio_path", lambda _project_id, _asset_id: outside)
    plan = audition.plan(project.id, variant.id)
    assert plan["sourceAvailable"] is False
    assert "escapes" in plan["sourceReason"]


def test_crop_bounds_clamp_at_first_and_last_frame(tmp_path):
    project, outputs, _source, variant, _history, _media, audition = applied_raw(tmp_path)
    # An accepted row at frame zero exercises the first boundary; full/tail crops
    # remain non-empty and never extend beyond the immutable variant.
    plan = audition.plan(project.id, variant.id)
    target = plan["target"]
    if target["startFrame"] == 0:
        head, head_info = audition.audio(project.id, variant.id, "variant", "head", plan["key"])
        assert head_info["startFrame"] == 0
        assert read_wav(head)[0] > 0
    frames, _pcm = read_wav(outputs.audio_path(project.id, variant.id))
    full, full_info = audition.audio(project.id, variant.id, "variant", "full", plan["key"])
    tail, tail_info = audition.audio(project.id, variant.id, "variant", "tail", plan["key"])
    assert full_info["startFrame"] == 0 and full_info["endFrame"] == frames
    assert tail_info["endFrame"] <= frames and read_wav(tail)[0] > 0
    assert audition._crop_bounds("source", "head", 24000, 0, 1000, 1000) == (0, 6000)
    assert audition._crop_bounds("source", "tail", 24000, 23000, 24000, 1000) == (18000, 24000)
    assert audition._crop_bounds("variant", "tail", 24000, 10000, 23000, 14000) == (18000, 24000)
