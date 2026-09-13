from __future__ import annotations

import json
import threading
from pathlib import Path

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.gpu_lease import GpuLease
from app.adapters.training_runner import TrainingRunner
from app.domain.models import (
    DatasetManifest,
    ProjectCreate,
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
