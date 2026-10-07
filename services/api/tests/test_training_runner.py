from __future__ import annotations

import json
import threading
import sys
import time
from pathlib import Path

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.gpu_lease import GpuLease
from app.adapters.training_runner import TrainingBusyError, TrainingRunner
from app.adapters.processing_cancellation import ProcessingStopError
from app.domain.models import (
    DatasetManifest,
    DatasetSegment,
    ProjectCreate,
    SpeakerProfile,
    TrainingCatalog,
    TrainingCheckpoint,
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


def test_queue_stop_cancels_pending_runs_but_leaves_the_active_run_running(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(
        tmp_path, monkeypatch, {"speaker-an": ["train", "dev"], "speaker-binh": ["train", "dev"]}
    )
    monkeypatch.setattr(runner, "_execute_batch", lambda queued: None)
    finished = runs.create(project.id, "dataset-1")
    finished = runs.update(project.id, finished.model_copy(update={
        "status": "complete", "checkpoints": [TrainingCheckpoint(step=10, path="assets/checkpoint", bytes=42)],
    }))
    first = runner.start(project.id, "dataset-1", TrainingRunConfig(), speaker_profile_ids=["speaker-an", "speaker-binh"])
    all_runs = sorted(
        (run for run in runs.list(project.id) if run.batch_id == first.batch_id),
        key=lambda run: run.batch_index,
    )
    runs.update(project.id, all_runs[0].model_copy(update={"status": "running"}))

    stopped = runner.stop(project.id)
    runner.stop(project.id)

    assert {run.id: run.status for run in stopped} == {
        finished.id: "complete", first.id: "running", all_runs[1].id: "cancelled",
    }
    assert runs.get(project.id, first.id).status == "running"
    assert runs.get(project.id, finished.id).status == "complete"
    assert runs.get(project.id, finished.id).checkpoints[0].bytes == 42


def test_all_stop_kills_owned_training_subprocess_and_is_idempotent(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(tmp_path, monkeypatch, {"speaker-an": ["train", "dev"]})
    run = runs.create(project.id, "dataset-1")
    run = runs.update(project.id, run.model_copy(update={"status": "running"}))
    process = runner._process_for(run)
    thread = threading.Thread(
        target=lambda: process.run([sys.executable, "-c", "import time; print('ready', flush=True); time.sleep(30)"], lambda _line: None),
        daemon=True,
    )
    thread.start()
    deadline = time.monotonic() + 5
    while process.pid is None and time.monotonic() < deadline:
        time.sleep(0.01)
    assert process.pid is not None

    runner.stop(project.id, include_active=True)
    runner.stop(project.id, include_active=True)
    thread.join(timeout=5)

    assert not thread.is_alive()
    assert process.cancelled
    assert runs.get(project.id, run.id).status == "cancelled"


def test_cancelled_run_cannot_publish_after_stop(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(tmp_path, monkeypatch, {"speaker-an": ["train", "dev"]})
    run = runs.create(project.id, "dataset-1")
    runs.update(project.id, run.model_copy(update={"status": "running"}))
    runner.stop(project.id, include_active=True)
    published = False

    def publish():
        nonlocal published
        published = True

    result = runner._publish_final(run, publish)

    assert result is None and not published
    assert runs.get(project.id, run.id).status == "cancelled"


def test_stopped_training_run_resumes_only_after_old_executor_exits(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(tmp_path, monkeypatch, {"speaker-an": ["train", "dev"]})
    first_started = threading.Event()
    first_process_returned = threading.Event()
    release_old_executor = threading.Event()
    resumed = threading.Event()
    attempt = 0

    def execute(run):
        nonlocal attempt
        attempt += 1
        process = runner._process_for(run, "train")
        try:
            if attempt == 1:
                code = process.run(
                    [sys.executable, "-c", "import time; print('started', flush=True); time.sleep(30)"],
                    lambda _line: first_started.set(),
                )
                assert process.cancelled and code != 0
                first_process_returned.set()
                release_old_executor.wait(timeout=5)
                return
            code = process.run(
                [sys.executable, "-c", "print('resumed', flush=True)"],
                lambda _line: None,
            )
            assert code == 0 and not process.cancelled
            current = runs.get(project.id, run.id)
            runs.update(project.id, current.model_copy(update={
                "status": "complete", "process_id": None,
                "checkpoints": [TrainingCheckpoint(step=12, path="assets/checkpoint-resumed", bytes=99)],
            }))
            resumed.set()
        finally:
            with runner._lock:
                runner._active.pop(run.id, None)

    monkeypatch.setattr(runner, "_execute_omnivoice", execute)
    initial = runner.start(project.id, "dataset-1", TrainingRunConfig())
    assert first_started.wait(timeout=3)

    runner.stop(project.id, include_active=True)
    assert first_process_returned.wait(timeout=3)
    with pytest.raises(TrainingBusyError, match="Run cũ vẫn đang dừng"):
        runner.start(project.id, "dataset-1", resume_run_id=initial.id)

    release_old_executor.set()
    deadline = time.monotonic() + 3
    while initial.id in runner._execution_owners and time.monotonic() < deadline:
        time.sleep(0.01)
    assert initial.id not in runner._execution_owners

    retried = runner.start(project.id, "dataset-1", resume_run_id=initial.id)
    assert retried.status == "running"
    assert resumed.wait(timeout=3)
    final = runs.get(project.id, initial.id)
    assert final.status == "complete"
    assert [(item.step, item.path, item.bytes) for item in final.checkpoints] == [
        (12, "assets/checkpoint-resumed", 99),
    ]
    assert attempt == 2


def test_stop_reports_process_ack_failure_after_attempting_every_active_run(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(tmp_path, monkeypatch, {"speaker-an": ["train", "dev"]})
    active = []
    for _ in range(2):
        run = runs.create(project.id, "dataset-1")
        run = runs.update(project.id, run.model_copy(update={"status": "running", "process_id": 456}))
        active.append(run)
    pending = runs.create(project.id, "dataset-1")

    class Stopper:
        pid = 456
        alive = True

        def __init__(self, should_fail):
            self.should_fail = should_fail
            self.called = False

        def cancel(self):
            self.called = True
            if self.should_fail:
                raise ProcessingStopError("process tree still alive")
            self.alive = False
            return True

    failed_process, stopped_process = Stopper(True), Stopper(False)
    runner._active.update({active[0].id: failed_process, active[1].id: stopped_process})

    with pytest.raises(ProcessingStopError, match="process tree still alive"):
        runner.stop(project.id, include_active=True)

    assert failed_process.called and stopped_process.called
    assert runs.get(project.id, active[0].id).status == "failed"
    assert runs.get(project.id, active[0].id).error == "process tree still alive"
    assert runs.get(project.id, active[0].id).process_id == 456
    assert runs.get(project.id, active[1].id).status == "cancelled"
    assert runs.get(project.id, pending.id).status == "cancelled"
    with pytest.raises(TrainingBusyError, match="Khởi động lại runtime"):
        runner.start(project.id, "dataset-1", resume_run_id=active[0].id)
    published = False

    def late_publish():
        nonlocal published
        published = True

    assert runner._publish_final(active[0], late_publish) is None
    assert not published


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


def test_cancelled_clone_exits_without_publishing_or_reporting_a_voice(tmp_path, monkeypatch):
    project, runs, runner = batch_fixture(tmp_path, monkeypatch, {"speaker-an": ["train", "dev"]})
    run = runs.create(project.id, "dataset-1", config=TrainingRunConfig(mode="zero-shot-clone"))
    runner.stop(project.id, include_active=True)
    publish = lambda *_args, **_kwargs: pytest.fail("Cancelled clone must not publish")
    monkeypatch.setattr(runner, "_publish_voice", publish)
    runner._build_clone_voice(run)
    assert runs.get(project.id, run.id).status == "cancelled"
    assert not any("Đã tạo voice" in line.message for line in runs.progress(project.id, run.id))


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
