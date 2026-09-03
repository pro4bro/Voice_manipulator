from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.training_runtime import TrainingRuntime
from app.domain.models import ProjectCreate, TrainingProgressLine, TrainingRunConfig


def runs_for(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Training"))
    return project, FileTrainingRuns(projects), projects


def test_a_new_run_lays_out_its_own_folder(tmp_path):
    project, runs, _ = runs_for(tmp_path)

    run = runs.create(project.id, "dataset-1", manifest_hash="abc123")
    directory = runs.run_dir(project.id, run.id)

    assert (directory / "run.json").is_file()
    assert (directory / "data").is_dir()
    assert (directory / "checkpoints").is_dir()
    assert run.status == "pending"
    assert run.step_id == "provision"


def test_the_run_record_survives_a_restart(tmp_path):
    project, runs, projects = runs_for(tmp_path)
    run = runs.create(project.id, "dataset-1", config=TrainingRunConfig(steps=1234, lora_r=8))

    reloaded = FileTrainingRuns(projects).get(project.id, run.id)

    assert reloaded.config.steps == 1234
    assert reloaded.config.lora_r == 8
    assert reloaded.manifest_id == "dataset-1"


def test_resume_reads_its_config_back_rather_than_rebuilding_it(tmp_path):
    """accelerate fails on a shape mismatch if the LoRA fields drift."""
    project, runs, _ = runs_for(tmp_path)
    run = runs.create(project.id, "dataset-1", config=TrainingRunConfig(lora_r=64, lora_alpha=128))

    reloaded = runs.get(project.id, run.id)

    assert (reloaded.config.lora_r, reloaded.config.lora_alpha) == (64, 128)
    assert reloaded.config.base_model == run.config.base_model


def test_a_run_left_running_reappears_as_interrupted_not_running(tmp_path):
    project, runs, _ = runs_for(tmp_path)
    live = runs.create(project.id, "dataset-1")
    runs.update(project.id, live.model_copy(update={"status": "running", "process_id": 4242}))
    done = runs.create(project.id, "dataset-2")
    runs.update(project.id, done.model_copy(update={"status": "complete"}))

    recovered = runs.mark_interrupted(project.id)

    assert [run.id for run in recovered] == [live.id]
    assert runs.get(project.id, live.id).status == "interrupted"
    assert runs.get(project.id, live.id).process_id is None
    assert runs.get(project.id, done.id).status == "complete"


def test_progress_is_append_only_and_keeps_its_order(tmp_path):
    project, runs, _ = runs_for(tmp_path)
    run = runs.create(project.id, "dataset-1")

    for step in range(3):
        runs.append_progress(
            project.id,
            run.id,
            TrainingProgressLine(step_id="train", global_step=step * 50, loss=1.0 - step * 0.1),
        )

    lines = runs.progress(project.id, run.id)
    assert [line.global_step for line in lines] == [0, 50, 100]
    assert lines[-1].loss == pytest.approx(0.8)


def test_a_half_written_last_line_does_not_lose_the_history(tmp_path):
    """A run killed mid-write is normal; losing every earlier line would not be."""
    project, runs, _ = runs_for(tmp_path)
    run = runs.create(project.id, "dataset-1")
    runs.append_progress(project.id, run.id, TrainingProgressLine(step_id="train", global_step=50))
    path = runs.run_dir(project.id, run.id) / "progress.jsonl"
    with path.open("a", encoding="utf-8") as handle:
        handle.write('{"stepId": "train", "globalStep": 10')

    lines = runs.progress(project.id, run.id)

    assert [line.global_step for line in lines] == [50]


def test_progress_can_be_tailed_without_reading_the_whole_run(tmp_path):
    project, runs, _ = runs_for(tmp_path)
    run = runs.create(project.id, "dataset-1")
    for step in range(20):
        runs.append_progress(project.id, run.id, TrainingProgressLine(step_id="train", global_step=step))

    assert [line.global_step for line in runs.progress(project.id, run.id, limit=3)] == [17, 18, 19]


def test_runs_survive_moving_the_whole_project(tmp_path):
    project, runs, projects = runs_for(tmp_path)
    run = runs.create(project.id, "dataset-1")
    runs.append_progress(project.id, run.id, TrainingProgressLine(step_id="tokenize", done=2, total=8))

    original = Path(project.project_path)
    moved = tmp_path / "after" / original.name
    moved.parent.mkdir(parents=True)
    shutil.move(str(original), str(moved))
    projects.open(moved)

    assert runs.get(project.id, run.id).manifest_id == "dataset-1"
    assert runs.progress(project.id, run.id)[0].total == 8


def test_listing_runs_ignores_a_corrupt_record_instead_of_hiding_the_rest(tmp_path):
    project, runs, _ = runs_for(tmp_path)
    good = runs.create(project.id, "dataset-1")
    broken = runs.run_dir(project.id, "run-broken")
    broken.mkdir(parents=True)
    (broken / "run.json").write_text("{ not json", encoding="utf-8")

    assert [run.id for run in runs.list(project.id)] == [good.id]


class TestTrainingRuntime:
    def test_it_reports_what_is_missing_before_installing_anything(self, tmp_path):
        runtime = TrainingRuntime(tmp_path / "train-venv", tmp_path / "wheels")

        report = runtime.report()

        assert report.exists is False
        assert report.ready is False
        assert "omnivoice" in report.missing
        assert "torch" in report.missing

    def test_a_cached_wheel_is_offered_instead_of_a_download(self, tmp_path):
        wheels = tmp_path / "wheels"
        wheels.mkdir()
        (wheels / "torch-2.8.0+cu128-cp311-cp311-win_amd64.whl").write_bytes(b"wheel")
        runtime = TrainingRuntime(tmp_path / "train-venv", wheels)

        torch = next(p for p in runtime.report().packages if p.name == "torch")

        assert torch.wheel_path is not None
        assert torch.wheel_path.endswith(".whl")

    def test_the_install_plan_puts_local_wheels_before_the_index(self, tmp_path):
        wheels = tmp_path / "wheels"
        wheels.mkdir()
        (wheels / "torch-2.8.0+cu128-cp311-cp311-win_amd64.whl").write_bytes(b"wheel")
        runtime = TrainingRuntime(tmp_path / "train-venv", wheels)

        plan = runtime.install_plan()

        assert plan[0][1:3] == ["-m", "venv"]
        assert any(arg.endswith(".whl") for arg in plan[1])
        assert "omnivoice" in plan[2]

    def test_the_plan_is_returned_rather_than_run(self, tmp_path):
        """Multi-gigabyte work never starts behind a spinner that says nothing."""
        root = tmp_path / "train-venv"
        TrainingRuntime(root, None).install_plan()

        assert not root.exists()
