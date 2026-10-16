from __future__ import annotations

import hashlib
import struct
import time
import wave
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.context_patch_source import ContextPatchTransferRequest, FileContextPatchSource
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.hybrid_patch_processor import HybridVoicePatchProcessor
from app.adapters.voice_patch_job_routes import make_voice_patch_job_router
from app.domain.models import MediaAssetCreate
from app.domain.voice_patch_jobs import VoicePatchApplyRequest, VoicePatchJobRequest
from test_context_patch_processor import RecordingEngine, ready_source
from test_voice_fix import setup_fix


RATE = 24000


def setup_hybrid(tmp_path, engine=None, *, kind="lora"):
    engine = engine or RecordingEngine()
    project, outputs, lease, speaker, scripts, _edits, _output, _old_engine = setup_fix(tmp_path)
    speaker.generator.engines["omnivoice"].worker = engine
    speaker.recognizer = None
    voice_id = f"voice-an-hybrid-{kind}"
    folder = speaker.generator.voices.root(project.id) / voice_id
    artifact = folder / ("adapter" if kind == "lora" else "checkpoint")
    artifact.mkdir(parents=True)
    (artifact / "weights.bin").write_bytes(b"hybrid test trained weights")
    original = speaker.generator.voices.get(project.id, outputs.list(project.id)[0].segments[0].voice_id)
    trained = original.model_copy(update={
        "id": voice_id, "name": "An trained hybrid", "kind": kind,
        "adapter_path": f"assets/voices/{voice_id}/adapter" if kind == "lora" else None,
        "model_path": f"assets/voices/{voice_id}/checkpoint" if kind == "full" else None,
        "source_run_id": "run-hybrid-test",
    })
    (folder / "voice.json").write_text(trained.model_dump_json(by_alias=True, indent=2), encoding="utf-8")

    media = FileMediaLibrary(speaker.projects)
    source_audio = Path(project.project_path) / "assets" / "media" / "asset-hybrid" / "analysis.wav"
    source_audio.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(source_audio), "wb") as audio:
        audio.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        samples = [5000 if (index // 500) % 2 else -5000 for index in range(RATE * 8)]
        audio.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    media.create(project.id, MediaAssetCreate(
        name="Hybrid annotated source.wav", sourceExtension=".wav", mediaKind="audio",
        sourcePath=str(source_audio), analysisPath=str(source_audio), duration=8,
        sampleRate=RATE, audioCodec="pcm_s16le", origin="import",
        words=[
            {"text": "trước", "start": .1, "end": 2.3, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
            {"text": "target", "start": 3, "end": 3.4, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
            {"text": "lời", "start": 3.5, "end": 3.9, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
            {"text": "sau", "start": 4.6, "end": 6.9, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        ], text="trước target lời sau", wordTimingQuality="source", speakerProfileIds=["speaker-an"],
    ), asset_id="asset-hybrid")
    source = FileContextPatchSource(media, scripts, speaker.projects)
    ready_source(source_audio)
    transferred = source.transfer(project.id, ContextPatchTransferRequest(
        expectedRevision=0, assetId="asset-hybrid",
        expectedScriptRevision=scripts.get(project.id).revision, startWord=1, endWord=2,
    ))
    selected = next(item for item in transferred.draft.context_candidates if item.side == "after")
    document = source.select_context(project.id, transferred.revision, selected.id)
    service = HybridVoicePatchProcessor(source, speaker)
    return project, outputs, lease, speaker, scripts, source, document, service, engine, source_audio, trained


def request(document, scripts, voice_id, text="Hybrid target replacement"):
    return VoicePatchJobRequest(expectedDraftRevision=document.revision,
        expectedScriptRevision=document.draft.script_revision,
        expectedEditRevision=document.draft.edit_revision, replacementText=text, voiceId=voice_id)


def review_target(store, project, document):
    return store.review_target(project.id, document.revision, document.draft.source_sha256,
        document.draft.start_frame, document.draft.end_frame)


def wait(service, project_id, job_id, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = service.get_job(project_id, job_id)
        if job.status not in {"queued", "running"}:
            return job
        time.sleep(.01)
    raise AssertionError("hybrid Patch job did not finish")


def test_hybrid_patch_combines_context_payload_with_trained_model_and_applies_once(tmp_path):
    project, outputs, lease, speaker, scripts, store, document, service, engine, _audio, trained = setup_hybrid(tmp_path)
    document = review_target(store, project, document)
    trained_before = speaker.generator.voices.get(project.id, trained.id).model_dump(mode="json", by_alias=True)
    reference = Path(project.project_path) / document.draft.selected_context.artifact_path
    reference_hash = hashlib.sha256(reference.read_bytes()).hexdigest()
    job = wait(service, project.id, service.start(project.id, request(document, scripts, trained.id)).id)

    assert job.status == "complete", job.error
    payload = engine.payloads[-1]
    assert payload["text"] == "Hybrid target replacement"
    assert payload["ref_text"] == "sau"
    assert payload["ref_audio"] == str(reference)
    assert payload["lora_adapter"].endswith("adapter")
    assert payload["model"] == trained.base_model
    assert payload["ref_text"] not in payload["text"]
    assert job.report["modelStrategy"] == "trained-model-with-context-reference"
    assert job.report["trainedVoiceId"] == trained.id
    assert job.report["contextAudioSha256"] == reference_hash
    assert speaker.generator.voices.get(project.id, trained.id).model_dump(mode="json", by_alias=True) == trained_before
    assert len(speaker.generator.voices.list(project.id)) == 3
    applied = service.apply(project.id, VoicePatchApplyRequest(expectedDraftRevision=document.revision,
        jobId=job.id, expectedKey=job.key))
    assert applied["output"].generator_id == "voice-patch-hybrid"
    assert applied["output"].parameters["voicePatch"]["trainedVoiceId"] == trained.id
    again = service.apply(project.id, VoicePatchApplyRequest(expectedDraftRevision=document.revision,
        jobId=job.id, expectedKey=job.key))
    assert again == applied
    assert len(outputs.list(project.id)) == 2
    assert lease.holder() is None


def test_hybrid_patch_cannot_generate_before_explicit_target_review(tmp_path):
    project, _outputs, _lease, _speaker, scripts, _store, document, service, engine, _audio, trained = setup_hybrid(tmp_path)
    assert service.plan(project.id)["processingAvailable"] is False
    assert any("Review and confirm" in item for item in service.plan(project.id)["blockers"])
    with pytest.raises(ValueError, match="Review and confirm"):
        service.start(project.id, request(document, scripts, trained.id))
    assert engine.payloads == []


def test_hybrid_processor_namespace_plan_and_http_routes_are_distinct(tmp_path):
    project, _outputs, _lease, _speaker, scripts, store, document, service, _engine, _audio, trained = setup_hybrid(tmp_path)
    document = review_target(store, project, document)
    assert service.plan(project.id)["processingAvailable"] is True
    assert trained.id in {item["voiceId"] for item in service.plan(project.id)["voiceChoices"]}
    job = wait(service, project.id, service.start(project.id, request(document, scripts, trained.id)).id)
    assert service.job_path(project.id, job.id).is_relative_to(Path(project.project_path) / "jobs" / "hybrid-patch")
    app = FastAPI()
    app.include_router(make_voice_patch_job_router(service, prefix="/api/projects/{project_id}/voice-patch/hybrid"))
    with TestClient(app) as client:
        base = f"/api/projects/{project.id}/voice-patch/hybrid"
        plan = client.get(base + "/process")
        audio = client.get(base + f"/jobs/{job.id}/audio?kind=replacement")
        assert plan.status_code == 200 and plan.json()["processingAvailable"] is True
        assert audio.status_code == 200 and audio.content[:4] == b"RIFF"
        assert client.get(f"/api/projects/{project.id}/voice-patch/context/jobs/{job.id}").status_code == 404


def test_hybrid_patch_keeps_full_checkpoint_and_replaces_only_its_reference(tmp_path):
    project, _outputs, _lease, speaker, scripts, _store, document, service, engine, _audio, trained = setup_hybrid(
        tmp_path, kind="full")
    document = review_target(_store, project, document)
    original = speaker.generator.voices.get(project.id, trained.id)
    job = wait(service, project.id, service.start(project.id, request(document, scripts, trained.id)).id)
    assert job.status == "complete", job.error
    payload = engine.payloads[-1]
    assert payload["lora_adapter"] is None
    assert payload["model"].endswith("checkpoint")
    assert payload["ref_text"] == "sau"
    assert speaker.generator.voices.get(project.id, trained.id) == original


@pytest.mark.parametrize("change, message", [
    ({"speaker_profile_id": "speaker-other"}, "Speaker Profile"),
    ({"base_model": "other/OmniVoice"}, "base family"),
    ({"kind": "clone"}, "LoRA or full"),
])
def test_hybrid_patch_rejects_incompatible_voice_before_inference(tmp_path, change, message):
    project, _outputs, _lease, speaker, scripts, store, document, service, engine, _audio, trained = setup_hybrid(tmp_path)
    document = review_target(store, project, document)
    changed = trained.model_copy(update=change)
    record = speaker.generator.voices.root(project.id) / trained.id / "voice.json"
    record.write_text(changed.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        service.start(project.id, request(document, scripts, trained.id))
    assert engine.payloads == []


def test_hybrid_patch_rejects_missing_weights_and_stale_reference(tmp_path):
    project, _outputs, _lease, speaker, scripts, store, document, service, engine, _audio, trained = setup_hybrid(tmp_path)
    document = review_target(store, project, document)
    weights = speaker.generator.voices.absolute(project.id, trained.adapter_path) / "weights.bin"
    weights.unlink()
    assert service.plan(project.id)["processingAvailable"] is False
    with pytest.raises(ValueError, match="missing its trained adapter"):
        service.start(project.id, request(document, scripts, trained.id))
    assert engine.payloads == []
    # A fresh draft restores the required artifact, then stale selected context is detected.
    weights.write_bytes(b"restored trained weights")
    reference = Path(project.project_path) / document.draft.selected_context.artifact_path
    reference.write_bytes(reference.read_bytes()[:-2] + b"xx")
    with pytest.raises(ValueError, match="checksum|current|Extracted context reference"):
        service.start(project.id, request(document, scripts, trained.id))
    assert engine.payloads == []


def test_hybrid_job_cancellation_allows_retry_and_source_edit_makes_job_stale(tmp_path):
    from test_voice_script import BlockingEngine

    blocking = BlockingEngine(cancelable=True)
    project, outputs, lease, speaker, scripts, store, document, service, _engine, audio, trained = setup_hybrid(tmp_path, blocking)
    document = review_target(store, project, document)
    started = service.start(project.id, request(document, scripts, trained.id))
    assert blocking.entered.wait(timeout=2)
    assert service.stop(project.id, started.id, include_active=True)
    cancelled = wait(service, project.id, started.id)
    assert cancelled.status == "cancelled"
    assert lease.holder() is None and len(outputs.list(project.id)) == 1
    retry_engine = RecordingEngine()
    speaker.generator.engines["omnivoice"].worker = retry_engine
    retried = wait(service, project.id, service.start(project.id, request(document, scripts, trained.id)).id)
    assert retried.status == "complete", retried.error
    # A changed reference artifact invalidates the completed job on its next read.
    reference = Path(project.project_path) / document.draft.selected_context.artifact_path
    reference.write_bytes(reference.read_bytes()[:-2] + b"zz")
    assert service.get_job(project.id, retried.id).status == "stale"


def test_hybrid_source_duration_policy_is_applied_by_shared_processor_build(tmp_path):
    project, _outputs, _lease, _speaker, scripts, store, document, service, _engine, _audio, trained = setup_hybrid(tmp_path)
    document = review_target(store, project, document)
    req = request(document, scripts, trained.id)
    source_req = req.model_copy(update={"duration_policy": "source"})
    natural = service._build(project.id, req)
    exact = service._build(project.id, source_req)
    assert exact["step"].duration == (document.draft.end_frame - document.draft.start_frame) / RATE
    assert exact["clipKey"] != natural["clipKey"]
    assert service._request_from_snapshot(exact).duration_policy == "source"
