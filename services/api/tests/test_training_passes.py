from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from app.adapters import training_runner as runner_module
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.gpu_lease import GpuLease
from app.adapters.training_runner import TrainingRunner
from app.domain.models import ProjectCreate, TrainingRunConfig, TrainingRuntimeReport
from app.domain.training_passes import plan_steps


class PythonRuntime:
    python = Path(sys.executable)

    def report(self):
        return TrainingRuntimeReport(root="runtime", ready=True)


def test_steps_that_read_the_data_too_often_are_capped_to_the_allowed_passes():
    plan = plan_steps(5000, 5.0, 100)

    assert plan.capped
    assert plan.steps == 500
    assert plan.requested_epochs == pytest.approx(1000)
    assert plan.epochs == pytest.approx(100)


def test_steps_within_the_limit_are_left_alone():
    plan = plan_steps(600, 12.0, 100)

    assert not plan.capped
    assert plan.steps == 600
    assert plan.epochs == pytest.approx(50)


@pytest.mark.parametrize("limit", [0, None])
def test_no_limit_means_the_requested_steps(limit):
    assert plan_steps(5000, 5.0, limit).steps == 5000


def test_a_cap_never_goes_below_one_pass():
    assert plan_steps(5000, 40.0, 1).steps == 40


@pytest.fixture
def setup(tmp_path, monkeypatch):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Passes"))
    runs = FileTrainingRuns(projects)
    runner = TrainingRunner(
        projects, None, FileTrainingCatalog(projects), runs, PythonRuntime(),  # type: ignore[arg-type]
        GpuLease(tmp_path / "gpu.json"), tmp_path / "engine",
    )
    worker = tmp_path / "epoch_size.py"
    worker.write_text(
        "import json\n"
        "print('loading tokenizer...')\n"
        "print('@@PRO4BRO@@' + json.dumps({'batchesPerEpoch': [6, 4], 'gradientAccumulation': 1, 'stepsPerEpoch': 5.0, 'seconds': 1.2}))\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(runner_module, "EPOCH_SIZE_WORKER", worker)

    def make(max_epochs, steps=5000, eval_steps=500):
        run = runs.create(project.id, "dataset-1", config=TrainingRunConfig(
            steps=steps, parameters={"steps": steps, "eval_steps": eval_steps, "max_epochs": max_epochs},
        ))
        data = runs.run_dir(project.id, run.id) / "data"
        data.mkdir(parents=True, exist_ok=True)
        config = data / "train_config.json"
        config.write_text(json.dumps({"steps": steps, "eval_steps": eval_steps, "save_steps": 1000}), encoding="utf-8")
        return run, config

    return type("Setup", (), dict(project=project, runs=runs, runner=runner, make=staticmethod(make)))


def messages(setup, run):
    return [(line.level, line.message) for line in setup.runs.progress(setup.project.id, run.id)]


def test_the_runner_measures_a_pass_caps_the_steps_and_says_so(setup):
    run, config = setup.make(max_epochs=100)

    updated = setup.runner._plan_passes(run, config, config, train_samples=11)

    written = json.loads(config.read_text(encoding="utf-8"))
    assert written["steps"] == 500
    assert written["eval_steps"] == 500
    assert updated.config.steps == 500
    assert updated.config.parameters["steps"] == 500
    lines = messages(setup, run)
    assert any("1 vòng dữ liệu = 5.0 step" in text for _, text in lines)
    warning = next(text for level, text in lines if level == "warning")
    assert "5000" in warning and "1000 lần" in warning and "Train 500 step" in warning


def test_evaluation_is_moved_to_the_last_step_when_the_cap_makes_it_unreachable(setup):
    run, config = setup.make(max_epochs=50)

    setup.runner._plan_passes(run, config, config, train_samples=11)

    written = json.loads(config.read_text(encoding="utf-8"))
    assert (written["steps"], written["eval_steps"]) == (250, 250)
    assert any("đánh giá ở step 250" in text for _, text in messages(setup, run))


def test_a_failed_measurement_trains_as_asked_and_warns(setup, tmp_path, monkeypatch):
    broken = tmp_path / "broken.py"
    broken.write_text("raise RuntimeError('no tokenizer here')\n", encoding="utf-8")
    monkeypatch.setattr(runner_module, "EPOCH_SIZE_WORKER", broken)
    run, config = setup.make(max_epochs=100)

    updated = setup.runner._plan_passes(run, config, config, train_samples=11)

    assert json.loads(config.read_text(encoding="utf-8"))["steps"] == 5000
    assert updated.config.steps == 5000
    levels = messages(setup, run)
    assert ("error", "RuntimeError: no tokenizer here") in levels
    assert any(level == "warning" and "Không đo được" in text for level, text in levels)


def test_an_unexpected_error_ends_the_run_as_failed_with_its_reason_in_the_log(setup, monkeypatch):
    run, _config = setup.make(max_epochs=100)

    def broken(_run):
        raise TypeError("unsupported operand")

    monkeypatch.setattr(setup.runner, "_execute_omnivoice", broken)
    setup.runner._execute(run)

    saved = setup.runs.get(setup.project.id, run.id)
    assert saved.status == "failed"
    assert "TypeError: unsupported operand" in saved.error
    lines = messages(setup, run)
    assert lines[0][1].startswith(f"Bắt đầu run {run.id}")
    assert any(level == "error" and "Thất bại" in text for level, text in lines)
    process_log = (setup.runs.run_dir(setup.project.id, run.id) / "process.log").read_text(encoding="utf-8")
    assert "[PRO4BRO] [ERROR]" in process_log and "TypeError: unsupported operand" in process_log
