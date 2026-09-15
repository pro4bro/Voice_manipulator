from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.gpu_lease import GpuLease
from app.adapters.training_runner import TrainingRunner
from app.domain.models import (
    DatasetManifest,
    DatasetSegment,
    ProjectCreate,
    SpeakerProfile,
    TrainingCatalog,
    TrainingRuntimeReport,
    TrainingRunConfig,
)


class ReadyRuntime:
    python = Path("python.exe")

    def report(self):
        return TrainingRuntimeReport(root="runtime", ready=True)


class StoredManifest:
    def __init__(self, manifest: DatasetManifest):
        self.manifest = manifest

    def load(self, _project_id: str, _manifest_id: str):
        return self.manifest


def test_start_creates_a_persistent_run_and_dispatches_it_in_background(tmp_path, monkeypatch):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Training"))
    manifest = DatasetManifest(id="dataset-1")
    manifest_path = Path(project.project_path) / "assets" / "training" / "datasets" / "dataset-1.json"
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_text(manifest.model_dump_json(), encoding="utf-8")

    runner = TrainingRunner(
        projects,
        StoredManifest(manifest),  # type: ignore[arg-type]
        FileTrainingCatalog(projects),
        FileTrainingRuns(projects),
        ReadyRuntime(),  # type: ignore[arg-type]
        GpuLease(tmp_path / "gpu.json"),
        tmp_path / "engine",
    )
    started = threading.Event()
    monkeypatch.setattr(
        runner,
        "_execute",
        lambda run: started.set(),
    )

    run = runner.start(project.id, manifest.id, TrainingRunConfig(steps=12))

    assert started.wait(timeout=2)
    saved = FileTrainingRuns(projects).get(project.id, run.id)
    assert saved.manifest_id == "dataset-1"
    assert saved.config.steps == 12
    assert saved.manifest_hash


def test_descriptor_values_reach_the_omnivoice_config_under_their_own_names(tmp_path):
    engine = tmp_path / "engine"
    template = engine / "examples" / "config" / "train_config_finetune_lora.json"
    template.parent.mkdir(parents=True)
    template.write_text(
        json.dumps({"lora_dropout": 0.05, "warmup_ratio": 0.01, "steps": 5000, "use_lora": True}),
        encoding="utf-8",
    )
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Training"))
    runs = FileTrainingRuns(projects)
    runner = TrainingRunner(
        projects,
        StoredManifest(DatasetManifest(id="dataset-1")),  # type: ignore[arg-type]
        FileTrainingCatalog(projects),
        runs,
        ReadyRuntime(),  # type: ignore[arg-type]
        GpuLease(tmp_path / "gpu.json"),
        engine,
    )
    config = TrainingRunConfig(
        model_id="omnivoice-lora",
        steps=1200,
        parameters={"steps": 1200, "lora_dropout": 0.1, "lr_scheduler_type": "constant"},
    )
    run = runs.create(project.id, "dataset-1", config=config)
    run_dir = runs.run_dir(project.id, run.id)
    (run_dir / "data").mkdir(parents=True, exist_ok=True)

    written = json.loads(runner._write_train_config(run, run_dir).read_text(encoding="utf-8"))

    assert written["steps"] == 1200
    assert written["lora_dropout"] == 0.1
    assert written["lr_scheduler_type"] == "constant"
    assert written["warmup_ratio"] == 0.01


def batch_fixture(tmp_path, monkeypatch, segments_by_speaker):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Batch"))
    catalogs = FileTrainingCatalog(projects)
    speakers = [SpeakerProfile(id=speaker_id, name=name) for speaker_id, name in [("speaker-an", "An"), ("speaker-binh", "Bình")]]
    catalogs.save(project.id, TrainingCatalog(speakers=speakers))
    segments = []
    for speaker_id, splits in segments_by_speaker.items():
        for index, split in enumerate(splits):
            segments.append(
                DatasetSegment(
                    id=f"{speaker_id}-{index}", asset_id="asset", audio_path="a.wav",
                    start=0, end=3, text="xin chào", speaker_profile_id=speaker_id, split=split,
                )
            )
    manifest = DatasetManifest(id="dataset-1", segments=segments)
    manifest_path = Path(project.project_path) / "assets" / "training" / "datasets" / "dataset-1.json"
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_text(manifest.model_dump_json(), encoding="utf-8")
    runs = FileTrainingRuns(projects)
    runner = TrainingRunner(
        projects,
        StoredManifest(manifest),  # type: ignore[arg-type]
        catalogs,
        runs,
        ReadyRuntime(),  # type: ignore[arg-type]
        GpuLease(tmp_path / "gpu.json"),
        tmp_path / "engine",
    )
    return project, runs, runner


def test_each_voice_target_becomes_its_own_run_trained_in_order(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(
        tmp_path, monkeypatch, {"speaker-an": ["train", "dev"], "speaker-binh": ["train", "train", "dev"]}
    )
    executed: list[str | None] = []
    finished = threading.Event()

    def fake_execute(run):
        executed.append(run.speaker_profile_id)
        runs.update(project.id, run.model_copy(update={"status": "complete", "process_id": None}))
        if len(executed) == 2:
            finished.set()

    monkeypatch.setattr(runner, "_execute", fake_execute)

    first = runner.start(project.id, "dataset-1", TrainingRunConfig(), speaker_profile_ids=["speaker-an", "speaker-binh"])

    assert finished.wait(timeout=2)
    assert executed == ["speaker-an", "speaker-binh"]
    batch = sorted(
        (run for run in runs.list(project.id) if run.batch_id == first.batch_id), key=lambda run: run.batch_index
    )
    assert [(run.speaker_profile_id, run.batch_index, run.batch_size) for run in batch] == [
        ("speaker-an", 0, 2),
        ("speaker-binh", 1, 2),
    ]


def test_a_voice_target_without_train_and_dev_refuses_the_whole_batch(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(
        tmp_path, monkeypatch, {"speaker-an": ["train", "dev"], "speaker-binh": ["train"]}
    )

    with pytest.raises(ValueError, match="Bình chỉ có 1 đoạn"):
        runner.start(project.id, "dataset-1", TrainingRunConfig(), speaker_profile_ids=["speaker-an", "speaker-binh"])
    with pytest.raises(ValueError, match="không tồn tại"):
        runner.start(project.id, "dataset-1", TrainingRunConfig(), speaker_profile_ids=["speaker-ghost"])
    assert runs.list(project.id) == []


def test_cancelling_the_running_voice_cancels_the_ones_queued_behind_it(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(
        tmp_path, monkeypatch, {"speaker-an": ["train", "dev"], "speaker-binh": ["train", "dev"]}
    )
    monkeypatch.setattr(runner, "_execute_batch", lambda queued: None)

    first = runner.start(project.id, "dataset-1", TrainingRunConfig(), speaker_profile_ids=["speaker-an", "speaker-binh"])
    runner.cancel(project.id, first.id)

    assert {run.status for run in runs.list(project.id)} == {"cancelled"}


def test_commands_in_the_log_carry_no_machine_paths(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(tmp_path, monkeypatch, {"speaker-an": ["train", "dev"]})
    run = runs.create(project.id, "dataset-1")
    run_dir = runs.run_dir(project.id, run.id)

    runner._append_command(
        run,
        "tokenize",
        ["python.exe", "-m", "omnivoice.scripts.extract_audio_tokens", "--input_jsonl", str(run_dir / "data" / "train.jsonl"),
         "--tokenizer_path", str(tmp_path / "engine" / "tok dir")],
    )

    message = runs.progress(project.id, run.id)[-1].message
    assert message.startswith("$ python -m omnivoice.scripts.extract_audio_tokens")
    assert "<run>/data/train.jsonl" in message
    assert '"<omnivoice>/tok dir"' in message
    assert str(tmp_path) not in message


def test_a_redrawn_training_bar_moves_the_run_without_filling_the_journal(tmp_path, monkeypatch):
    """Two redraws a step for thousands of steps would push the loss lines out of the page's window."""
    from app.adapters import training_runner as module
    from app.domain.models import TrainingProgressLine

    project, runs, runner = batch_fixture(tmp_path, monkeypatch, {"speaker-an": ["train", "dev"]})
    run = runs.create(project.id, "dataset-1", config=TrainingRunConfig(steps=5000))
    clock = [100.0]
    monkeypatch.setattr(module.time, "monotonic", lambda: clock[0])

    def bar(step):
        return TrainingProgressLine(step_id="train", global_step=step, done=step, total=5000, steps_per_second=2.5)

    runner._on_progress(run, bar(1))
    for step in range(2, 40):
        clock[0] += 0.4
        runner._on_progress(run, bar(step))
    runner._on_progress(run, TrainingProgressLine(step_id="train", message="Step 50 | train/loss: 3.1", global_step=50, loss=3.1))
    clock[0] += 31
    runner._on_progress(run, bar(51))

    journal = runs.progress(project.id, run.id)
    assert [line.global_step for line in journal] == [1, 50, 51]
    assert runs.get(project.id, run.id).global_step == 51
