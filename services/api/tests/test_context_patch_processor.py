from __future__ import annotations

import hashlib
import struct
import time
import wave
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.context_patch_processor import ContextVoicePatchProcessor
from app.adapters.context_patch_source import ContextPatchTransferRequest, FileContextPatchSource
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.voice_patch_job_routes import make_voice_patch_job_router
from app.domain.voice_patch_jobs import VoicePatchApplyRequest, VoicePatchJobRequest
from app.domain.models import MediaAssetCreate
from test_voice_fix import setup_fix
from test_voice_script import BlockingEngine, FakeEngine


RATE = 24000


class RecordingEngine(FakeEngine):
    def __init__(self):
        super().__init__()
        self.payloads = []

    def request(self, payload):
        self.payloads.append(dict(payload))
        return super().request(payload)


def choose_context(store, project, scripts, *, side="after"):
    draft = store.transfer(project.id, ContextPatchTransferRequest(
        expectedRevision=0, assetId="asset-context", expectedScriptRevision=scripts.get(project.id).revision,
        startWord=1, endWord=2,
    ))
    candidate = next(item for item in draft.draft.context_candidates if item.side == side)
    return store.select_context(project.id, draft.revision, candidate.id)


def ready_source(source: Path, start_frame=72000, end_frame=93600):
    with wave.open(str(source), "rb") as audio:
        frames = audio.getnframes()
        samples = list(struct.unpack(f"<{frames}h", audio.readframes(frames)))
    # The fake worker emits sample 16. Keep the immutable source audible while
    # matching only the two replacement splice samples to the clip boundary.
    samples[start_frame - 1] = 16
    samples[end_frame] = 16
    with wave.open(str(source), "wb") as audio:
        audio.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        audio.writeframes(struct.pack(f"<{len(samples)}h", *samples))


def wait(service, project_id, job_id, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = service.get_job(project_id, job_id)
        if job.status not in {"queued", "running"}:
            return job
        time.sleep(.01)
    raise AssertionError("context Patch job did not finish")


def setup_processor(tmp_path, engine=None):
    engine = engine or RecordingEngine()
    project, outputs, lease, speaker, scripts, _edits, _output, _old_engine = setup_fix(tmp_path)
    speaker.generator.engines["omnivoice"].worker = engine
    speaker.recognizer = None
    media = FileMediaLibrary(speaker.projects)
    source_audio = Path(project.project_path) / "assets" / "media" / "asset-context" / "analysis.wav"
    source_audio.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(source_audio), "wb") as audio:
        audio.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        samples = [5000 if (index // 500) % 2 else -5000 for index in range(RATE * 8)]
        audio.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    media.create(project.id, MediaAssetCreate(
        name="Imported annotated speech.wav", sourceExtension=".wav", mediaKind="audio",
        sourcePath=str(source_audio), analysisPath=str(source_audio), duration=8,
        sampleRate=RATE, audioCodec="pcm_s16le", origin="import",
        words=[
            {"text": "trước", "start": .1, "end": 2.3, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
            {"text": "target", "start": 3.0, "end": 3.4, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
            {"text": "lời", "start": 3.5, "end": 3.9, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
            {"text": "sau", "start": 4.6, "end": 6.9, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        ], text="trước target lời sau", wordTimingQuality="source", speakerProfileIds=["speaker-an"],
    ), asset_id="asset-context")
    source = FileContextPatchSource(media, scripts, speaker.projects)
    ready_source(source_audio)
    document = choose_context(source, project, scripts)
    service = ContextVoicePatchProcessor(source, speaker)
    return project, outputs, lease, speaker, scripts, source, document, service, engine, source_audio


def start_request(project, document, scripts, text="New target words"):
    return VoicePatchJobRequest(expectedDraftRevision=document.revision,
        expectedScriptRevision=document.draft.script_revision,
        expectedEditRevision=document.draft.edit_revision,
        replacementText=text, voiceId="context-clone")


def review_target(store, project, document):
    return store.review_target(project.id, document.revision, document.draft.source_sha256,
        document.draft.start_frame, document.draft.end_frame)


def test_context_patch_uses_selected_context_only_as_reference_and_applies_immutable_media_output(tmp_path):
    project, outputs, lease, speaker, scripts, source, document, service, engine, source_audio = setup_processor(tmp_path)
    document = review_target(source, project, document)
    source_bytes = source_audio.read_bytes()
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    before_outputs = outputs.list(project.id)
    payload_draft = document.draft
    reference = Path(project.project_path) / payload_draft.selected_context.artifact_path
    reference_hash = hashlib.sha256(reference.read_bytes()).hexdigest()
    request = start_request(project, document, scripts)

    queued = service.start(project.id, request)
    job = wait(service, project.id, queued.id)

    assert job.status == "complete", job.error
    assert job.clip and job.report["sourceKind"] == "media"
    assert job.report["sourceAssetId"] == "asset-context"
    assert job.report["contextAudioSha256"] == reference_hash
    assert job.report["contextReferenceText"] == payload_draft.selected_context.text == "sau"
    assert job.audio_url.startswith("/api/projects/") and "/voice-patch/context/jobs/" in job.audio_url
    payload = engine.payloads[-1]
    assert payload["ref_text"] == "sau"
    assert payload["text"] == "New target words"
    assert payload["lora_adapter"] is None and payload["model"] == "k2-fsa/OmniVoice"
    assert len(speaker.generator.voices.list(project.id)) == 2  # temporary clone was never published
    assert len(outputs.list(project.id)) == len(before_outputs)
    assert hashlib.sha256(source_audio.read_bytes()).hexdigest() == source_hash
    with pytest.raises(KeyError):
        outputs.get(project.id, "asset-context")

    applied = service.apply(project.id, VoicePatchApplyRequest(expectedDraftRevision=document.revision,
        jobId=job.id, expectedKey=job.key))
    candidate = applied["output"]
    assert candidate.engine == "mixed-source-omnivoice"
    assert candidate.generator_id == "voice-patch-context"
    assert candidate.parameters["sourceKind"] == "media"
    assert candidate.parameters["sourceAssetId"] == "asset-context"
    assert candidate.parameters["voicePatch"]["contextAudioSha256"] == reference_hash
    assert candidate.parameters["voicePatch"]["sourceTranscriptText"] == "trước target lời sau"
    assert [word["text"] for word in candidate.parameters["voicePatch"]["sourceTranscriptWords"]] == [
        "trước", "target", "lời", "sau",
    ]
    assert [word["text"] for word in candidate.words if word.get("sourceKind") == "media"] == [
        "trước", "sau",
    ]
    assert candidate.duration == pytest.approx(7.85, abs=0.01)
    assert source_audio.read_bytes() == source_bytes
    assert lease.holder() is None
    assert len(outputs.list(project.id)) == len(before_outputs) + 1


def test_context_patch_cannot_generate_before_explicit_target_review(tmp_path):
    project, _outputs, _lease, _speaker, scripts, _store, document, service, engine, _source_audio = setup_processor(tmp_path)
    assert service.plan(project.id)["processingAvailable"] is False
    assert any("Review and confirm" in item for item in service.plan(project.id)["blockers"])
    with pytest.raises(ValueError, match="Review and confirm"):
        service.start(project.id, start_request(project, document, scripts))
    assert engine.payloads == []


def test_context_patch_storage_and_reopen_are_separate_from_trained_patch_namespace(tmp_path):
    project, _outputs, _lease, _speaker, scripts, store, document, service, _engine, _source_audio = setup_processor(tmp_path)
    document = review_target(store, project, document)
    request = start_request(project, document, scripts)
    job = wait(service, project.id, service.start(project.id, request).id)
    assert service.job_path(project.id, job.id).is_relative_to(Path(project.project_path) / "jobs" / "context-patch")
    assert not (Path(project.project_path) / "jobs" / "voice-patch" / f"{job.id}.json").exists()
    assert service.latest_job(project.id).id == job.id

    app = FastAPI()
    app.include_router(make_voice_patch_job_router(service, prefix="/api/projects/{project_id}/voice-patch/context"))
    with TestClient(app) as client:
        plan = client.get(f"/api/projects/{project.id}/voice-patch/context/process")
        assert plan.status_code == 200 and plan.json()["processingAvailable"] is True
        audio = client.get(f"/api/projects/{project.id}/voice-patch/context/jobs/{job.id}/audio?kind=replacement")
        assert audio.status_code == 200 and audio.content[:4] == b"RIFF"
    service.close()


def test_context_patch_reference_tampering_invalidates_job_and_never_applies(tmp_path):
    project, outputs, _lease, _speaker, scripts, store, document, service, _engine, _source_audio = setup_processor(tmp_path)
    document = review_target(store, project, document)
    job = wait(service, project.id, service.start(project.id, start_request(project, document, scripts)).id)
    reference = Path(project.project_path) / document.draft.selected_context.artifact_path
    data = bytearray(reference.read_bytes())
    data[-2] ^= 1
    reference.write_bytes(data)

    stale = service.get_job(project.id, job.id)
    assert stale.status == "stale"
    with pytest.raises(Exception, match="current Voice Patch job|selected context|stale|changed"):
        service.apply(project.id, VoicePatchApplyRequest(expectedDraftRevision=document.revision,
            jobId=job.id, expectedKey=job.key))
    assert len(outputs.list(project.id)) == 1


def test_context_processor_rejects_published_voice_and_missing_selected_context(tmp_path):
    project, _outputs, _lease, _speaker, scripts, store, document, service, _engine, _source_audio = setup_processor(tmp_path)
    document = review_target(store, project, document)
    with pytest.raises(ValueError, match="temporary context clone"):
        service.start(project.id, start_request(project, document, scripts).model_copy(update={"voice_id": "voice-an"}))

    # Any explicit context selection is revisioned; a fresh draft with its
    # selection removed cannot silently pick a random candidate.
    saved = store.get(project.id)
    saved.draft.selected_context = None
    store._save(project.id, saved)
    plan = service.plan(project.id)
    assert plan["processingAvailable"] is False
    assert any("Select one" in item for item in plan["blockers"])


def test_context_job_router_uses_context_prefix_and_keeps_original_media_latest_read_only(tmp_path):
    project, _outputs, _lease, _speaker, scripts, store, document, service, _engine, _source_audio = setup_processor(tmp_path)
    app = FastAPI()
    app.include_router(make_voice_patch_job_router(service, prefix="/api/projects/{project_id}/voice-patch/context"))
    with TestClient(app) as client:
        response = client.get(f"/api/projects/{project.id}/voice-patch/context/applied")
    assert response.status_code == 404
    assert store.get(project.id).draft == document.draft


def test_retry_after_failed_audio_quality_generates_a_fresh_immutable_clip(tmp_path):
    class ClippedOnce(RecordingEngine):
        def request(self, payload):
            result = super().request(payload)
            if len(self.payloads) == 1:
                path = Path(payload["output"])
                with wave.open(str(path), "wb") as audio:
                    audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
                    audio.writeframes(struct.pack("<h", 32767) * 24000)
            return result
    engine = ClippedOnce()
    project, outputs, lease, _speaker, scripts, _store, document, service, _engine, source = setup_processor(tmp_path, engine)
    document = review_target(_store, project, document)
    original = source.read_bytes()
    body = start_request(project, document, scripts)
    first = wait(service, project.id, service.start(project.id, body).id)
    assert first.status == "failed" and "clipped" in first.error
    second = wait(service, project.id, service.start(project.id, body).id)
    assert second.status == "complete", second.error
    assert len(engine.payloads) == 2 and second.clip.startswith(first.clip_key + "-")
    assert source.read_bytes() == original and len(outputs.list(project.id)) == 1
    assert lease.holder() is None


def test_context_source_duration_policy_is_applied_by_shared_processor_build(tmp_path):
    project, _outputs, _lease, _speaker, scripts, source, document, service, _engine, _audio = setup_processor(tmp_path)
    document = review_target(source, project, document)
    req = start_request(project, document, scripts, "New target words")
    source_req = req.model_copy(update={"duration_policy": "source"})
    natural = service._build(project.id, req)
    exact = service._build(project.id, source_req)
    assert exact["step"].duration == (document.draft.end_frame - document.draft.start_frame) / RATE
    assert exact["clipKey"] != natural["clipKey"]
    assert service._request_from_snapshot(exact).duration_policy == "source"
