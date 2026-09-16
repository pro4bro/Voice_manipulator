"""Whatever the app lets a person make, it lets them remove."""

from __future__ import annotations

import json
import os
import time
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_asr_adapters import FileAsrAdapters
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_reading_packs import FileReadingPacks, ReadingPackError
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.gpu_lease import GpuLease
from app.adapters.project_dataset_compiler import ProjectDatasetCompiler
from app.adapters.safe_delete import child_folder
from app.adapters.training_runner import RunHasOutputs, TrainingRunner
from app.domain.models import (
    DatasetSegment,
    ProjectAsrAdapter,
    ProjectCreate,
    ReadingPassageDraft,
    TrainingRuntimeReport,
)
from app.main import create_app
from app.settings import Settings


class ReadyRuntime:
    python = Path("python.exe")

    def report(self):
        return TrainingRuntimeReport(root="runtime", ready=True)


def copy_slice(source: Path, target: Path, _start: float, _end: float) -> None:
    target.write_bytes(b"RIFF-test")


@pytest.fixture
def world(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Delete"))
    root = Path(project.project_path)
    (root / "assets" / "media").mkdir(parents=True, exist_ok=True)
    (root / "assets" / "media" / "a.wav").write_bytes(b"RIFF")
    catalogs = FileTrainingCatalog(projects)
    runs = FileTrainingRuns(projects)
    voices = FileProjectVoices(projects, copy_slice)
    adapters = FileAsrAdapters(projects)
    compiler = ProjectDatasetCompiler(projects, FileMediaLibrary(projects), catalogs)
    runner = TrainingRunner(
        projects, compiler, catalogs, runs, ReadyRuntime(),  # type: ignore[arg-type]
        GpuLease(tmp_path / "gpu.json"), tmp_path / "engine", voices=voices, asr_adapters=adapters,
    )
    return type("World", (), dict(projects=projects, project=project, root=root, runs=runs, voices=voices,
                                  adapters=adapters, runner=runner, compiler=compiler))


def segment() -> DatasetSegment:
    return DatasetSegment(id="s1", asset_id="a", audio_path="assets/media/a.wav", start=0, end=4, text="xin chào các bạn")


def publish(world, run_id=None, adapter_dir=None):
    return world.voices.publish(
        world.project.id, name="Anh Vũ · LoRA", speaker_profile_id="speaker-1", kind="lora",
        reference=segment(), language="vi", adapter_dir=adapter_dir, source_run_id=run_id,
    )


def finished_run(world, manifest_id="dataset-1"):
    run = world.runs.create(world.project.id, manifest_id)
    run = world.runs.update(world.project.id, run.model_copy(update={"status": "complete"}))
    checkpoint = world.runs.run_dir(world.project.id, run.id) / "checkpoints" / "checkpoint-300"
    checkpoint.mkdir(parents=True)
    (checkpoint / "adapter_model.safetensors").write_bytes(b"x" * 2048)
    return run, checkpoint


def test_a_voice_is_deleted_with_its_folder(world):
    voice = publish(world)
    folder = world.voices.root(world.project.id) / voice.id

    freed = world.voices.delete(world.project.id, voice.id)

    assert freed > 0
    assert not folder.exists()
    assert world.voices.list(world.project.id) == []
    with pytest.raises(KeyError):
        world.voices.delete(world.project.id, voice.id)


@pytest.mark.parametrize("bad", ["..", "../registry", "a/b", "C:\\Windows", ""])
def test_an_id_that_is_not_one_folder_name_never_reaches_the_disk(world, bad):
    with pytest.raises(ValueError):
        child_folder(world.voices.root(world.project.id), bad)


def test_a_run_that_made_a_voice_is_not_deleted_behind_its_back(world):
    run, checkpoint = finished_run(world)
    voice = publish(world, run_id=run.id, adapter_dir=checkpoint)

    with pytest.raises(RunHasOutputs, match="Anh Vũ · LoRA"):
        world.runner.delete_run(world.project.id, run.id)

    assert world.runs.run_dir(world.project.id, run.id).is_dir()
    assert [item.id for item in world.voices.list(world.project.id)] == [voice.id]


def test_deleting_a_run_with_its_outputs_removes_voices_adapters_and_checkpoints(world):
    run, checkpoint = finished_run(world)
    publish(world, run_id=run.id, adapter_dir=checkpoint)
    adapter = world.adapters.publish(world.project.id, ProjectAsrAdapter(
        name="Anh Vũ · VibeVoice-ASR LoRA", base_model="VibeVoice-ASR",
        adapter_path=checkpoint.relative_to(world.root).as_posix(),
    ))

    footprint = world.runner.footprint(world.project.id, run.id)
    assert footprint.bytes >= 2048
    assert [item.id for item in footprint.asr_adapters] == [adapter.id]

    world.runner.delete_run(world.project.id, run.id, with_outputs=True)

    assert not world.runs.run_dir(world.project.id, run.id).exists()
    assert world.voices.list(world.project.id) == []
    assert world.adapters.list(world.project.id) == []


def test_a_running_run_is_refused(world):
    run = world.runs.create(world.project.id, "dataset-1")
    world.runs.update(world.project.id, run.model_copy(update={"status": "running", "process_id": os.getpid()}))

    with pytest.raises(ValueError, match="Huỷ run trước"):
        world.runner.delete_run(world.project.id, run.id)


def test_old_manifests_no_run_uses_are_pruned_and_the_newest_stays(world):
    datasets = world.root / "assets" / "training" / "datasets"
    datasets.mkdir(parents=True)
    for index, manifest_id in enumerate(["dataset-old", "dataset-used", "dataset-new"]):
        path = datasets / f"{manifest_id}.json"
        path.write_text("{}", encoding="utf-8")
        os.utime(path, (time.time() + index, time.time() + index))
    world.runs.create(world.project.id, "dataset-used")

    removed = world.runner.prune_manifests(world.project.id)

    assert removed == ["dataset-old"]
    assert sorted(path.stem for path in datasets.glob("*.json")) == ["dataset-new", "dataset-used"]


def draft(title="Bài tự soạn"):
    return ReadingPassageDraft.model_validate({
        "language": "vi", "languageName": "Tiếng Việt", "kind": "emotion", "emotion": "angry",
        "title": title, "direction": "Đọc dứt khoát.", "regions": [], "genders": [], "ageRanges": [],
        "cards": [{"text": "Một hai ba bốn năm sáu bảy tám.", "tags": []}],
    })


def test_an_authored_passage_is_deleted_and_an_emptied_library_file_goes_with_it(tmp_path):
    packs = FileReadingPacks(Settings.from_env().reading_packs_root, tmp_path / "authored")
    first = packs.add_passage(draft("Một")).passages[-1]
    second = packs.add_passage(draft("Hai")).passages[-1]

    packs.delete_passage(first.id)
    assert [passage.id for passage in packs.get("vi-authored").passages] == [second.id]

    packs.delete_passage(second.id)
    assert not (tmp_path / "authored" / "vi-authored.json").exists()
    with pytest.raises(KeyError):
        packs.delete_passage(second.id)


def test_a_passage_shipped_with_the_app_is_not_deleted(tmp_path):
    packs = FileReadingPacks(Settings.from_env().reading_packs_root, tmp_path / "authored")
    shipped = packs.get("vi-core-v1").passages[0]

    with pytest.raises(ReadingPackError):
        packs.delete_passage(shipped.id)


def test_the_api_deletes_voices_and_explains_a_run_it_will_not_delete(world, tmp_path):
    run, checkpoint = finished_run(world)
    voice = publish(world, run_id=run.id, adapter_dir=checkpoint)
    run_dir = world.runs.run_dir(world.project.id, run.id)
    (run_dir / "process.log").write_text("Training: 10/300\nRuntimeError: boom\n", encoding="utf-8")
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")

    with TestClient(create_app(project_repository=world.projects, settings=settings)) as client:
        base = f"/api/projects/{world.project.id}"
        log = client.get(f"{base}/training-runs/{run.id}/log").json()
        assert "RuntimeError: boom" in log["processLog"]

        refused = client.delete(f"{base}/training-runs/{run.id}")
        assert refused.status_code == 409
        assert voice.name in refused.json()["detail"]

        assert client.delete(f"{base}/voices/{voice.id}").status_code == 204
        assert client.delete(f"{base}/voices/{voice.id}").status_code == 404

        deleted = client.delete(f"{base}/training-runs/{run.id}")
        assert deleted.status_code == 200
        assert deleted.json()["bytes"] > 0
        assert not run_dir.exists()
