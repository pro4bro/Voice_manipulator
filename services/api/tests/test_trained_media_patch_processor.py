from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.context_patch_processor import ContextVoicePatchProcessor
from app.adapters.context_patch_source import ContextPatchTransferRequest
from app.adapters.trained_media_patch_processor import TrainedMediaPatchProcessor
from app.adapters.voice_patch_job_routes import make_voice_patch_job_router
from app.domain.voice_patch_jobs import VoicePatchApplyRequest, VoicePatchJobRequest
from test_context_patch_processor import RecordingEngine
from test_hybrid_patch_processor import review_target, setup_hybrid
from test_voice_script import BlockingEngine


def without_context(source, project, scripts, document):
    return source.transfer(project.id, ContextPatchTransferRequest(
        expectedRevision=document.revision,
        assetId=document.draft.asset_id,
        expectedScriptRevision=scripts.get(project.id).revision,
        startWord=1,
        endWord=2,
    ))


def request(document, voice_id):
    return VoicePatchJobRequest(expectedDraftRevision=document.revision,
        expectedScriptRevision=document.draft.script_revision,
        expectedEditRevision=document.draft.edit_revision,
        replacementText="Trained media replacement", voiceId=voice_id)


def wait(service, project_id, job_id, timeout=6):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = service.get_job(project_id, job_id)
        if job.status not in {"queued", "running"}:
            return job
        time.sleep(.01)
    raise AssertionError("trained media Patch job did not finish")


def setup_trained(tmp_path, engine=None):
    engine = engine or RecordingEngine()
    project, outputs, lease, speaker, scripts, source, old_document, _hybrid, _old_engine, audio, trained = setup_hybrid(
        tmp_path, engine)
    document = without_context(source, project, scripts, old_document)
    service = TrainedMediaPatchProcessor(source, speaker)
    return project, outputs, lease, speaker, scripts, source, document, service, engine, audio, trained


def test_trained_media_patch_uses_saved_voice_reference_without_context_and_applies(tmp_path):
    project, outputs, lease, speaker, scripts, source, document, service, engine, _audio, trained = setup_trained(tmp_path)
    assert document.draft.selected_context is None
    assert document.draft.reviewed_target is None
    plan = service.plan(project.id)
    assert plan["processingAvailable"] is False
    assert any("Review and confirm" in item for item in plan["blockers"])
    assert trained.id in {choice["voiceId"] for choice in plan["voiceChoices"]}
    document = review_target(source, project, document)
    plan = service.plan(project.id)
    assert plan["processingAvailable"] is True
    original = speaker.generator.voices.get(project.id, trained.id)
    job = wait(service, project.id, service.start(project.id, request(document, trained.id)).id)

    assert job.status == "complete", job.error
    payload = engine.payloads[-1]
    original_reference = speaker.generator.voices.absolute(project.id, trained.reference_audio)
    assert payload["ref_audio"] == str(original_reference)
    assert payload["ref_text"] == trained.reference_text
    assert payload["text"] == "Trained media replacement"
    assert payload["ref_text"] != payload["text"]
    assert job.audio_url.startswith("/api/projects/") and "/voice-patch/trained-media/jobs/" in job.audio_url
    assert job.report["modelStrategy"] == "trained-model-with-saved-reference"
    assert job.report["reviewKey"] == document.draft.reviewed_target.review_key
    assert speaker.generator.voices.get(project.id, trained.id) == original

    applied = service.apply(project.id, VoicePatchApplyRequest(expectedDraftRevision=document.revision,
        jobId=job.id, expectedKey=job.key))
    assert applied["output"].generator_id == "voice-patch-trained-media"
    lineage = applied["output"].parameters["voicePatch"]
    assert lineage["mediaPatchStrategy"] == "trained-model-with-saved-reference"
    assert lineage["reviewKey"] == document.draft.reviewed_target.review_key
    assert len(outputs.list(project.id)) == 2
    assert lease.holder() is None


def test_trained_media_processor_http_and_storage_namespace_are_separate(tmp_path):
    project, _outputs, _lease, _speaker, _scripts, _source, document, service, _engine, _audio, trained = setup_trained(tmp_path)
    document = review_target(_source, project, document)
    job = wait(service, project.id, service.start(project.id, request(document, trained.id)).id)
    assert service.job_path(project.id, job.id).is_relative_to(Path(project.project_path) / "jobs" / "trained-media-patch")
    app = FastAPI()
    app.include_router(make_voice_patch_job_router(service,
        prefix="/api/projects/{project_id}/voice-patch/trained-media"))
    with TestClient(app) as client:
        base = f"/api/projects/{project.id}/voice-patch/trained-media"
        response = client.get(base + "/process")
        audio = client.get(base + f"/jobs/{job.id}/audio?kind=replacement")
        assert response.status_code == 200 and response.json()["processingAvailable"] is True
        assert audio.status_code == 200 and audio.content[:4] == b"RIFF"


def test_trained_media_patch_cancellation_and_retry(tmp_path):
    blocker = BlockingEngine(cancelable=True)
    project, outputs, lease, speaker, scripts, source, document, service, _engine, _audio, trained = setup_trained(
        tmp_path, blocker)
    document = review_target(source, project, document)
    started = service.start(project.id, request(document, trained.id))
    assert blocker.entered.wait(timeout=3)
    service.stop(project.id, started.id, include_active=True)
    cancelled = wait(service, project.id, started.id)
    assert cancelled.status == "cancelled"
    assert len(outputs.list(project.id)) == 1 and lease.holder() is None

    retry_engine = RecordingEngine()
    speaker.generator.engines["omnivoice"].worker = retry_engine
    retried = wait(service, project.id, service.start(project.id, request(document, trained.id)).id)
    assert retried.status == "complete", retried.error
    reopened = TrainedMediaPatchProcessor(source, speaker)
    assert reopened.get_job(project.id, retried.id).status == "complete"


def test_context_and_hybrid_strategies_still_require_context_selection(tmp_path):
    project, _outputs, _lease, speaker, scripts, source, document, hybrid, _engine, _audio, _trained = setup_hybrid(tmp_path)
    document = without_context(source, project, scripts, document)
    reviewed = review_target(source, project, document)
    context_only = ContextVoicePatchProcessor(source, speaker)
    context_plan = context_only.plan(project.id)
    hybrid_plan = hybrid.plan(project.id)
    assert context_plan["processingAvailable"] is False
    assert any("Select one" in blocker for blocker in context_plan["blockers"])
    assert hybrid_plan["processingAvailable"] is False
    assert any("Select one" in blocker for blocker in hybrid_plan["blockers"])


def test_review_change_stales_trained_media_job_and_blocks_apply(tmp_path):
    project, outputs, _lease, _speaker, _scripts, source, document, service, _engine, _audio, trained = setup_trained(tmp_path)
    document = review_target(source, project, document)
    job = wait(service, project.id, service.start(project.id, request(document, trained.id)).id)
    unchanged = source.review_target(project.id, document.revision, document.draft.source_sha256,
        document.draft.start_frame, document.draft.end_frame)
    assert unchanged.draft.reviewed_target.review_key == document.draft.reviewed_target.review_key
    assert unchanged.revision == document.revision
    changed = without_context(source, project, _scripts, unchanged)
    assert changed.draft.reviewed_target is None
    assert service.get_job(project.id, job.id).status == "stale"
    with pytest.raises(Exception, match="current Voice Patch job|changed"):
        service.apply(project.id, VoicePatchApplyRequest(expectedDraftRevision=document.revision,
            jobId=job.id, expectedKey=job.key))
    assert len(outputs.list(project.id)) == 1


def test_trained_media_source_duration_policy_is_applied_by_shared_processor_build(tmp_path):
    project, _outputs, _lease, _speaker, _scripts, source, document, service, _engine, _audio, trained = setup_trained(tmp_path)
    document = review_target(source, project, document)
    req = request(document, trained.id)
    source_req = req.model_copy(update={"duration_policy": "source"})
    natural = service._build(project.id, req)
    exact = service._build(project.id, source_req)
    assert exact["step"].duration == (document.draft.end_frame - document.draft.start_frame) / 24000
    assert exact["clipKey"] != natural["clipKey"]
    assert service._request_from_snapshot(exact).duration_policy == "source"
