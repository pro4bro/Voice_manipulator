from __future__ import annotations

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
