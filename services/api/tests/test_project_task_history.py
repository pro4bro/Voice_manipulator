import json
from datetime import timedelta
from pathlib import Path

from app.adapters.project_task_history import ProjectTaskHistory
from app.adapters.file_project_repository import FileProjectRepository
from app.domain.models import ActivityTask, ProjectCreate


def test_task_history_retains_done_attempts_and_recovers_dead_owner(tmp_path):
    projects = FileProjectRepository(tmp_path)
    project = projects.create(ProjectCreate(name="Queue"))
    history = ProjectTaskHistory(projects)
    first = ActivityTask(id="stt:track", kind="stt", label="take.wav", project_id=project.id,
                         asset_id="track", footage_id="parent", status="complete", fraction=1)
    history.record(first, force=True)
    later = first.model_copy(update={"status": "running", "fraction": .4,
                                    "started_at": first.started_at + timedelta(seconds=1)})
    history.record(later, force=True)
    path = Path(project.project_path) / "jobs/task-queue/tasks.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    document["tasks"][later.id]["ownerPid"] = 999999999
    path.write_text(json.dumps(document), encoding="utf-8")
    reopened = ProjectTaskHistory(projects).tasks(project.id)
    assert len(reopened) == 2
    assert [task.status for task in reopened] == ["complete", "interrupted"]
    assert reopened[1].fraction == .4
    assert reopened[1].footage_id == "parent"


def test_projects_are_isolated_and_progress_is_reloaded(tmp_path):
    projects = FileProjectRepository(tmp_path)
    a = projects.create(ProjectCreate(name="A"))
    b = projects.create(ProjectCreate(name="B"))
    history = ProjectTaskHistory(projects)
    history.record(ActivityTask(id="one", kind="alignment", label="a.wav", project_id=a.id, fraction=.5), force=True)
    assert history.tasks(b.id) == []
    assert ProjectTaskHistory(projects).tasks(a.id)[0].fraction == .5


def test_queued_promotion_keeps_one_attempt_and_terminal_updates_are_ignored(tmp_path):
    from app.adapters.activity_center import ActivityCenter
    projects = FileProjectRepository(tmp_path)
    project = projects.create(ProjectCreate(name="Attempts"))
    center = ActivityCenter()
    center.configure_history(projects)
    task_id = center.queue_task("import", "take.wav", task_id="import-1", project_id=project.id)
    assert center.project_tasks(project.id)[0].status == "queued"
    assert center.claim_queued_task(task_id, "another-project", "import") is None
    assert center.claim_queued_task(task_id, project.id, "import") == task_id
    assert center.claim_queued_task(task_id, project.id, "import") is None
    center.update_task(task_id, fraction=.7)
    center.update_task(task_id, fraction=None)
    assert center.project_tasks(project.id)[0].fraction is None
    center.finish_task(task_id, status="failed", error="probe failed")
    center.finish_task(task_id)
    center.update_task(task_id, fraction=1)
    tasks = ProjectTaskHistory(projects).tasks(project.id)
    assert len(tasks) == 1 and tasks[0].status == "failed" and tasks[0].fraction is None


def test_atomic_history_retains_parallel_tasks_and_moves_with_project(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    import shutil
    from types import SimpleNamespace
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Portable Queue", location=str(tmp_path / "original")))
    history = ProjectTaskHistory(projects)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda i: history.record(ActivityTask(id=f"export-{i}", kind="export", label=f"take-{i}.wav",
            project_id=project.id, status="complete", fraction=1), force=True), range(20)))
    moved = tmp_path / "moved Việt"
    shutil.move(project.project_path, moved)
    reopened = ProjectTaskHistory(SimpleNamespace(get=lambda _: SimpleNamespace(project_path=str(moved))))
    assert len(reopened.tasks(project.id)) == 20
    assert str(tmp_path) not in (moved / "jobs/task-queue/tasks.json").read_text(encoding="utf-8")


def test_partial_reservation_failure_rolls_back_memory_and_durable_prefix(tmp_path, monkeypatch):
    import pytest
    from app.adapters.activity_center import ActivityCenter
    projects = FileProjectRepository(tmp_path)
    project = projects.create(ProjectCreate(name="Atomic batch"))
    center = ActivityCenter()
    center.configure_history(projects)
    original = center._history._write
    monkeypatch.setattr(center._history, "_write", lambda _: (_ for _ in ()).throw(OSError("disk full")))
    with pytest.raises(OSError, match="disk full"):
        center.queue_batch("import", [{"id": "import-a", "label": "a.wav"}, {"id": "import-b", "label": "b.wav"}], project.id)
    assert center.tasks() == [] and center.project_tasks(project.id) == []
    assert ProjectTaskHistory(projects).tasks(project.id) == []
    monkeypatch.setattr(center._history, "_write", original)
    assert len(center.queue_batch("import", [{"id": "import-retry", "label": "a.wav"}], project.id)) == 1


def test_reused_live_pid_does_not_recover_an_old_api_instance_as_running(tmp_path):
    import os
    projects = FileProjectRepository(tmp_path)
    project = projects.create(ProjectCreate(name="PID identity"))
    history = ProjectTaskHistory(projects)
    history.record(ActivityTask(id="active", kind="stt", label="a.wav", project_id=project.id), force=True)
    path = Path(project.project_path) / "jobs/task-queue/tasks.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    record = document["tasks"]["active"]
    assert record["ownerPid"] == os.getpid()
    record.update(ownerInstance="previous-process", ownerStartedAt="different-creation-time")
    path.write_text(json.dumps(document), encoding="utf-8")
    assert ProjectTaskHistory(projects).tasks(project.id)[0].status == "interrupted"
