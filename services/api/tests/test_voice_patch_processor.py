from __future__ import annotations

import hashlib
import json
import time
import wave
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.file_voice_patch import FileVoicePatch
from app.adapters.voice_patch_processor import VoicePatchProcessor
from app.adapters.voice_patch_job_routes import make_voice_patch_job_router
from app.domain.voice_patch import VoicePatchTransferRequest
from app.domain.voice_patch_jobs import VoicePatchApplyRequest, VoicePatchJobRequest
from test_voice_fix import setup_fix


def _trained_voice(project, speaker, source_voice_id):
    source = speaker.generator.voices.get(project.id, source_voice_id)
    voice_id = "voice-an-trained"
    folder = speaker.generator.voices.root(project.id) / voice_id
    adapter = folder / "adapter"
    adapter.mkdir(parents=True)
    (adapter / "weights.bin").write_bytes(b"test lora weights")
    voice = source.model_copy(update={
        "id": voice_id,
        "name": "An LoRA",
        "kind": "lora",
        "adapter_path": f"assets/voices/{voice_id}/adapter",
        "source_run_id": "run-test",
    })
    (folder / "voice.json").write_text(voice.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
    return voice


def setup_patch(tmp_path, engine=None):
    project, outputs, lease, speaker, scripts, edits, output, engine = setup_fix(tmp_path, engine)
    speaker.recognizer = None
    trained = _trained_voice(project, speaker, output.segments[0].voice_id)
    store = FileVoicePatch(edits)
    script = scripts.get(project.id)
    draft = store.transfer(project.id, VoicePatchTransferRequest(
        expectedRevision=0, outputId=output.id, rowId="r1",
        expectedScriptRevision=script.revision, expectedEditRevision=0,
    ))
    processor = VoicePatchProcessor(store, speaker)
    return project, outputs, lease, speaker, scripts, edits, output, engine, trained, store, draft, processor


def wait_job(processor, project_id, job_id, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = processor.get_job(project_id, job_id)
        if job.status not in {"queued", "running"}:
            return job
        time.sleep(.01)
    raise AssertionError("Voice Patch job did not finish")


def read_pcm(path: Path):
    with wave.open(str(path), "rb") as audio:
        return (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()), audio.readframes(audio.getnframes())


def request(draft, revision, script_revision, edit_revision, voice_id, text="Đây là câu đã thay"):
    return VoicePatchJobRequest(expectedDraftRevision=revision, expectedScriptRevision=script_revision,
        expectedEditRevision=edit_revision, replacementText=text, voiceId=voice_id)


def test_patch_processor_uses_trained_matching_profile_and_keeps_output_hidden_until_apply(tmp_path):
    project, outputs, lease, speaker, scripts, edits, source, engine, trained, _store, draft, processor = setup_patch(tmp_path)
    source_path = outputs.audio_path(project.id, source.id)
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    script = scripts.get(project.id)
    plan = processor.plan(project.id)
    assert plan["processingAvailable"] is True

    started = processor.start(project.id, request(draft.draft, draft.revision, script.revision, 0, trained.id))
    job = wait_job(processor, project.id, started.id)

    assert job.status == "complete" and job.done == 1, job.error
    assert job.replacement_audio_url.endswith("/audio?kind=replacement")
    assert job.audio_url.endswith("/audio?kind=composite")
    assert len(outputs.list(project.id)) == 1
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source_hash
    assert engine.spoken[-1] == "Đây là câu đã thay"
    assert lease.holder() is None
    composite = processor.preview_path(project.id, job.id, "composite")
    replacement = processor.preview_path(project.id, job.id, "replacement")
    params, composite_pcm = read_pcm(composite)
    assert params == (1, 2, 24000)
    assert read_pcm(replacement)[0] == params
    report = job.report
    source_pcm = read_pcm(source_path)[1]
    assert composite_pcm[:report["startFrame"] * 2] == source_pcm[:report["startFrame"] * 2]
    assert composite_pcm[(report["startFrame"] + report["replacementFrames"]) * 2:] == source_pcm[report["endFrame"] * 2:]


def test_patch_apply_creates_immutable_natural_ripple_and_is_idempotent(tmp_path):
    project, outputs, _lease, _speaker, scripts, edits, source, _engine, trained, _store, draft, processor = setup_patch(tmp_path)
    source_path = outputs.audio_path(project.id, source.id)
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    source_pcm = read_pcm(source_path)[1]
    script = scripts.get(project.id)
    started = processor.start(project.id, request(draft.draft, draft.revision, script.revision, 0, trained.id))
    job = wait_job(processor, project.id, started.id)
    apply_request = VoicePatchApplyRequest(expectedDraftRevision=draft.revision, jobId=job.id, expectedKey=job.key)

    packet = processor.apply(project.id, apply_request)
    result = packet["output"]
    assert result.id != source.id
    assert result.segments[0].text == "Đây là câu đã thay"
    assert result.segments[1].start > source.segments[1].start
    applied_pcm = read_pcm(outputs.audio_path(project.id, result.id))[1]
    start, end, replacement_frames = job.report["startFrame"], job.report["endFrame"], job.report["replacementFrames"]
    assert applied_pcm[:start * 2] == source_pcm[:start * 2]
    assert applied_pcm[(start + replacement_frames) * 2:] == source_pcm[end * 2:]
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source_hash
    assert processor.apply(project.id, apply_request)["output"].id == result.id
    assert processor.latest(project.id)["output"].id == result.id
    assert len(outputs.list(project.id)) == 2


def test_patch_blocks_clone_mismatched_profile_and_unsupported_delivery_before_inference(tmp_path):
    project, _outputs, lease, speaker, scripts, edits, output, engine, trained, _store, draft, processor = setup_patch(tmp_path)
    script = scripts.get(project.id)
    script.rows[0].settings.delivery = "whisper"
    script = scripts.save(project.id, script)
    # Transfer a fresh draft because the Script revision is part of the source snapshot.
    document = processor.store.transfer(project.id, VoicePatchTransferRequest(
        expectedRevision=1, outputId=output.id, rowId="r1",
        expectedScriptRevision=script.revision, expectedEditRevision=0,
    ))
    with pytest.raises(ValueError, match="delivery|unsupported"):
        processor.start(project.id, request(document.draft, document.revision, script.revision, 0, trained.id))
    assert engine.spoken == ["Xin chào", "Tạm biệt"]
    assert lease.holder() is None

    with pytest.raises(ValueError, match="trained|LoRA|full"):
        processor.start(project.id, request(document.draft, document.revision, script.revision, 0,
            document.draft.voice_id))


def test_patch_apply_rejects_stale_or_corrupt_preview_and_source_remains_unmodified(tmp_path):
    project, outputs, _lease, _speaker, scripts, _edits, source, _engine, trained, _store, draft, processor = setup_patch(tmp_path)
    script = scripts.get(project.id)
    started = processor.start(project.id, request(draft.draft, draft.revision, script.revision, 0, trained.id))
    job = wait_job(processor, project.id, started.id)
    path = processor.preview_path(project.id, job.id, "composite")
    path.write_bytes(b"broken")
    with pytest.raises((ValueError, KeyError)):
        processor.apply(project.id, VoicePatchApplyRequest(expectedDraftRevision=draft.revision,
            jobId=job.id, expectedKey=job.key))
    assert len(outputs.list(project.id)) == 1


def test_patch_job_becomes_stale_when_script_changes_before_apply(tmp_path):
    project, outputs, _lease, _speaker, scripts, _edits, _source, _engine, trained, _store, draft, processor = setup_patch(tmp_path)
    script = scripts.get(project.id)
    started = processor.start(project.id, request(draft.draft, draft.revision, script.revision, 0, trained.id))
    job = wait_job(processor, project.id, started.id)
    script.rows[1].text = "Sau đó cập nhật"
    scripts.save(project.id, script)
    assert processor.get_job(project.id, job.id).status == "stale"
    with pytest.raises(ValueError):
        processor.apply(project.id, VoicePatchApplyRequest(expectedDraftRevision=draft.revision,
            jobId=job.id, expectedKey=job.key))
    assert len(outputs.list(project.id)) == 1


def test_patch_cancel_releases_lease_and_retry_reuses_durable_draft(tmp_path):
    from test_voice_script import BlockingEngine
    project, outputs, lease, speaker, scripts, _edits, source, engine, trained, store, draft, processor = setup_patch(tmp_path)
    blocker = BlockingEngine(cancelable=True)
    speaker.generator.engines["omnivoice"].worker = blocker
    script = scripts.get(project.id)
    started = processor.start(project.id, request(draft.draft, draft.revision, script.revision, 0, trained.id))
    assert blocker.entered.wait(timeout=2)
    processor.stop(project.id, started.id, include_active=True)
    stopped = wait_job(processor, project.id, started.id)
    assert stopped.status == "cancelled"
    assert lease.holder() is None
    assert len(outputs.list(project.id)) == 1

    speaker.generator.engines["omnivoice"].worker = engine
    retry = processor.start(project.id, request(draft.draft, draft.revision, script.revision, 0, trained.id))
    finished = wait_job(processor, project.id, retry.id)
    assert finished.status == "complete", finished.error
    reopened = VoicePatchProcessor(store, speaker)
    assert reopened.get_job(project.id, finished.id).status == "complete"
    assert len(outputs.list(project.id)) == 1


def test_patch_http_process_job_preview_apply_and_reopen_routes(tmp_path):
    project, outputs, _lease, speaker, scripts, _edits, _source, _engine, trained, _store, draft, processor = setup_patch(tmp_path)
    app = FastAPI()
    app.include_router(make_voice_patch_job_router(processor))
    with TestClient(app) as client:
        base = f"/api/projects/{project.id}/voice-patch"
        plan = client.get(base + "/process")
        assert plan.status_code == 200 and plan.json()["processingAvailable"] is True
        script = scripts.get(project.id)
        created = client.post(base + "/jobs", json={
            "expectedDraftRevision": draft.revision, "expectedScriptRevision": script.revision,
            "expectedEditRevision": 0, "replacementText": "Đổi lời trong patch", "voiceId": trained.id,
        })
        assert created.status_code == 200, created.text
        job_id = created.json()["id"]
        finished = wait_job(processor, project.id, job_id)
        job_response = client.get(base + f"/jobs/{job_id}")
        assert job_response.status_code == 200 and job_response.json()["status"] == "complete"
        audio = client.get(base + f"/jobs/{job_id}/audio?kind=composite")
        assert audio.status_code == 200 and audio.content[:4] == b"RIFF"
        applied = client.post(base + "/apply", json={
            "expectedDraftRevision": draft.revision, "jobId": job_id, "expectedKey": finished.key,
        })
        assert applied.status_code == 200, applied.text
        reopened = client.get(base + "/applied")
        assert reopened.status_code == 200 and reopened.json() == applied.json()
    assert len(outputs.list(project.id)) == 2


@pytest.mark.parametrize("crossing", [False, True])
def test_boundary_cues_use_half_open_ownership_and_reject_crossing(tmp_path, crossing):
    project, outputs, _lease, _speaker, scripts, _edits, source, _engine, trained, store, _draft, processor = setup_patch(tmp_path)
    cue = {"text": "boundary cue", "start": .49 if crossing else .5, "end": .51 if crossing else .6,
        "timingTrusted": True}
    if crossing:
        cue["segmentIndex"] = 0
    outputs.save(project.id, source.model_copy(update={"words": [*source.words, cue]}))
    script = scripts.get(project.id)
    draft = store.transfer(project.id, VoicePatchTransferRequest(expectedRevision=1, outputId=source.id,
        rowId="r1", expectedScriptRevision=script.revision, expectedEditRevision=0))
    job = wait_job(processor, project.id, processor.start(project.id,
        request(draft.draft, draft.revision, script.revision, 0, trained.id)).id)
    body = VoicePatchApplyRequest(expectedDraftRevision=draft.revision, jobId=job.id, expectedKey=job.key)
    if crossing:
        with pytest.raises(ValueError, match="boundary|cross"):
            processor.apply(project.id, body)
    else:
        applied = processor.apply(project.id, body)["output"]
        assert any(word["text"] == "boundary cue" for word in applied.words)

