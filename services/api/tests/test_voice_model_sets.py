from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_voice_model_sets import FileVoiceModelSets
from app.domain.models import (
    DatasetManifest,
    DatasetSegment,
    ProjectCreate,
    TrainingRun,
    TrainingRunConfig,
)
from app.main import create_app
from app.settings import Settings


def copy_slice(source: Path, target: Path, _start: float, _end: float) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())


def fixture(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Model sets", location=str(tmp_path / "projects")))
    audio = Path(project.project_path) / "assets" / "media" / "asset-1" / "analysis.wav"
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"RIFF-test")
    segment = DatasetSegment(
        id="segment-1",
        asset_id="asset-1",
        audio_path="assets/media/asset-1/analysis.wav",
        start=1,
        end=9,
        text="xin chào mọi người",
        speaker_profile_id="speaker-an",
        emotion="normal",
    )
    manifest = DatasetManifest(id="dataset-1", segments=[segment])
    run = TrainingRun(
        id="run-1",
        project_id=project.id,
        manifest_id=manifest.id,
        manifest_hash="sha256-manifest",
        engine_revision="omnivoice-revision",
        speaker_profile_id="speaker-an",
        config=TrainingRunConfig(
            model_id="omnivoice-lora",
            engine="omnivoice",
            mode="lora-finetune",
            base_model="k2-fsa/OmniVoice",
            parameters={"lora_r": 16, "num_step": 8},
        ),
    )
    return projects, project, segment, manifest, run


def test_pending_set_persists_portable_complete_lineage(tmp_path):
    projects, project, segment, manifest, run = fixture(tmp_path)
    sets = FileVoiceModelSets(projects)
    voice = FileProjectVoices(projects, copy_slice).publish(
        project.id,
        name="An · LoRA",
        speaker_profile_id="speaker-an",
        kind="lora",
        reference=segment,
        language="vi",
        adapter_dir=Path(project.project_path) / "jobs" / "training" / run.id / "checkpoints" / "checkpoint-100",
        source_run_id=run.id,
        model_set_id="set-an",
    )

    model_set = sets.create_pending(project.id, "set-an", "An · OmniVoice", voice, run, manifest)

    assert model_set.status == "pending-gate"
    assert model_set.voice_ids == [voice.id]
    assert model_set.anchor_voice_id == voice.id
    assert model_set.lineage.manifest_id == "dataset-1"
    assert model_set.lineage.manifest_hash == "sha256-manifest"
    assert model_set.lineage.engine_revision == "omnivoice-revision"
    assert model_set.lineage.config.model_id == "omnivoice-lora"
    assert model_set.lineage.segment_count == 1
    assert model_set.lineage.source_run_ids == ["run-1"]
    assert sets.get(project.id, model_set.id) == model_set

    record = sets.root(project.id) / model_set.id / "set.json"
    raw = record.read_text(encoding="utf-8")
    assert str(tmp_path) not in raw
    assert not record.with_suffix(".json.tmp").exists()


def test_set_refuses_a_voice_from_another_speaker(tmp_path):
    projects, project, segment, manifest, run = fixture(tmp_path)
    voice = FileProjectVoices(projects, copy_slice).publish(
        project.id,
        name="Bình · LoRA",
        speaker_profile_id="speaker-binh",
        kind="lora",
        reference=segment,
        language="vi",
        source_run_id=run.id,
        model_set_id="set-an",
    )

    with pytest.raises(ValueError, match="Speaker Profile"):
        FileVoiceModelSets(projects).create_pending(project.id, "set-an", "An", voice, run, manifest)


def test_model_set_api_lists_and_reads_persisted_sets(tmp_path):
    projects, project, segment, manifest, run = fixture(tmp_path)
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
    saved = FileVoiceModelSets(projects).create_pending(project.id, "set-an", "An · OmniVoice", voice, run, manifest)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")

    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        base = f"/api/projects/{project.id}/voice-model-sets"
        listed = client.get(base)
        fetched = client.get(f"{base}/{saved.id}")
        missing = client.get(f"{base}/missing")

    assert listed.status_code == 200 and listed.json()[0]["id"] == saved.id
    assert fetched.status_code == 200
    assert fetched.json()["lineage"]["manifestHash"] == "sha256-manifest"
    assert missing.status_code == 404


def test_deleting_the_only_voice_through_api_removes_its_pending_set(tmp_path):
    projects, project, segment, manifest, run = fixture(tmp_path)
    sets = FileVoiceModelSets(projects)
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
    sets.create_pending(project.id, "set-an", "An · OmniVoice", voice, run, manifest)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")

    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        response = client.delete(f"/api/projects/{project.id}/voices/{voice.id}")

    assert response.status_code == 204
    assert sets.list(project.id) == []
    assert voices.list(project.id) == []
