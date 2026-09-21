from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_voice_model_sets import FileVoiceModelSets
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.speaker_similarity_gate import SpeakerSimilarityGate
from app.domain.models import (
    DatasetManifest,
    DatasetSegment,
    ProjectCreate,
    SpeakerEmbedderInfo,
    TrainingRun,
    TrainingRunConfig,
    VoiceModelSetGateRequest,
    VoiceOutput,
)
from app.main import create_app
from app.settings import Settings


def copy_slice(source: Path, target: Path, _start: float, _end: float) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())


class FixedEmbedder:
    def __init__(self, score: float, *, calibrated: bool = True) -> None:
        self.score = score
        self.info = SpeakerEmbedderInfo(
            id="test-embedder",
            label="Test embedder",
            model_id="test/model",
            revision="revision-1",
            threshold=0.7,
            calibrated=calibrated,
            available=True,
            status="ready",
        )

    def compare(self, _reference: Path, candidates: dict[str, Path]) -> dict[str, float]:
        return {voice_id: self.score for voice_id in candidates}


def gate_fixture(tmp_path: Path, embedder: FixedEmbedder):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Gate", location=str(tmp_path / "projects")))
    source = Path(project.project_path) / "assets" / "media" / "asset-1" / "analysis.wav"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"RIFF-reference")
    segment = DatasetSegment(
        id="segment-1",
        asset_id="asset-1",
        audio_path="assets/media/asset-1/analysis.wav",
        start=0,
        end=8,
        text="đây là câu kiểm tra danh tính người nói",
        speaker_profile_id="speaker-an",
    )
    manifest = DatasetManifest(id="dataset-1", segments=[segment])
    run = TrainingRun(
        id="run-1",
        project_id=project.id,
        manifest_id=manifest.id,
        manifest_hash="manifest-hash",
        engine_revision="engine-revision",
        speaker_profile_id="speaker-an",
        config=TrainingRunConfig(model_id="omnivoice-lora"),
    )
    voices = FileProjectVoices(projects, copy_slice)
    voice = voices.publish(
        project.id,
        name="An · LoRA",
        speaker_profile_id="speaker-an",
        kind="lora",
        reference=segment,
        language="vi",
        source_run_id=run.id,
        model_set_id="set-an",
    )
    sets = FileVoiceModelSets(projects)
    sets.create_pending(project.id, "set-an", "An", voice, run, manifest)
    outputs = FileVoiceOutputs(projects)
    output_id, audio_path = outputs.reserve(project.id)
    audio_path.write_bytes(b"RIFF-generated")
    outputs.save(project.id, VoiceOutput(
        id=output_id,
        name="Gate probe",
        text="đây là câu kiểm tra danh tính người nói",
        voice_id=voice.id,
        voice_name=voice.name,
        speaker_profile_id=voice.speaker_profile_id,
        engine=voice.engine,
        generator_id="omnivoice-generate",
        duration=8,
        audio_path=audio_path.relative_to(project.project_path).as_posix(),
    ))
    gate = SpeakerSimilarityGate(projects, voices, outputs, sets, {embedder.info.id: embedder})
    request = VoiceModelSetGateRequest(
        embedder_id=embedder.info.id,
        output_ids_by_voice_id={voice.id: output_id},
    )
    return projects, project, voice, output_id, sets, gate, request


def test_calibrated_embedder_publishes_only_when_every_member_passes(tmp_path):
    _, project, voice, output_id, sets, gate, request = gate_fixture(tmp_path, FixedEmbedder(0.82))

    published = gate.evaluate(project.id, "set-an", request)

    assert published.status == "published"
    assert published.gate is not None
    assert published.gate.protocol_version == 1
    assert published.gate.metric == "cosine-similarity"
    assert published.gate.threshold == 0.7
    assert published.gate.scores_by_voice_id == {voice.id: 0.82}
    assert published.gate.candidate_output_ids_by_voice_id == {voice.id: output_id}
    assert published.gate.score_passed is True
    assert published.gate.passed is True
    assert published.published_at is not None
    assert sets.get(project.id, "set-an") == published


def test_below_threshold_rejects_and_persists_evidence(tmp_path):
    _, project, _, _, sets, gate, request = gate_fixture(tmp_path, FixedEmbedder(0.41))

    rejected = gate.evaluate(project.id, "set-an", request)

    assert rejected.status == "rejected"
    assert rejected.gate is not None and rejected.gate.decision_reason == "below-threshold"
    assert sets.get(project.id, "set-an").status == "rejected"


def test_provisional_unmeasured_threshold_can_score_but_cannot_publish(tmp_path):
    _, project, _, _, sets, gate, request = gate_fixture(tmp_path, FixedEmbedder(0.99, calibrated=False))

    pending = gate.evaluate(project.id, "set-an", request)

    assert pending.status == "pending-gate"
    assert pending.gate is not None
    assert pending.gate.score_passed is True
    assert pending.gate.passed is False
    assert pending.gate.decision_reason == "threshold-unmeasured"
    assert sets.get(project.id, "set-an").status == "pending-gate"


def test_gate_refuses_output_generated_by_another_voice(tmp_path):
    _, project, _, output_id, _, gate, request = gate_fixture(tmp_path, FixedEmbedder(0.9))
    request = request.model_copy(update={"output_ids_by_voice_id": {"voice-other": output_id}})

    with pytest.raises(ValueError, match="exactly one output"):
        gate.evaluate(project.id, "set-an", request)


def test_gate_api_lists_backends_and_evaluates_with_injected_embedder(tmp_path):
    embedder = FixedEmbedder(0.88)
    projects, project, voice, output_id, _, _, _ = gate_fixture(tmp_path, embedder)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")

    with TestClient(create_app(
        project_repository=projects,
        settings=settings,
        speaker_embedders={embedder.info.id: embedder},
    )) as client:
        backends = client.get("/api/speaker-embedders")
        response = client.post(
            f"/api/projects/{project.id}/voice-model-sets/set-an/gate",
            json={"embedderId": embedder.info.id, "outputIdsByVoiceId": {voice.id: output_id}},
        )

    assert backends.status_code == 200
    assert backends.json() == [embedder.info.model_dump(by_alias=True, mode="json")]
    assert response.status_code == 200
    assert response.json()["status"] == "published"
