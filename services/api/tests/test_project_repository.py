from __future__ import annotations

import json
import os
import shutil
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from threading import Barrier, Event, get_ident
from pathlib import Path

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters import file_project_repository
from app.domain.models import ProjectCreate


def test_project_repository_creates_and_reopens_project(tmp_path):
    repository = FileProjectRepository(tmp_path)

    created = repository.create(
        ProjectCreate(
            name="Southern Voice Launch",
            language="vi",
            accent="vi-South",
            sample_rate=24000,
            purpose="voice-over",
        )
    )

    reopened = repository.get(created.id)
    listed = repository.list()

    assert reopened == created
    assert listed == [created]
    assert (tmp_path / created.id / "assets").is_dir()
    assert (tmp_path / created.id / "exports").is_dir()
    assert (tmp_path / created.id / "project.json").is_file()
    assert (tmp_path / created.id / "notes" / "PROJECT_HANDOFF.md").is_file()
    assert "PROJECT_CREATED" in (tmp_path / created.id / "notes" / "ACTIVITY.md").read_text(encoding="utf-8")


def test_project_repository_persists_last_page(tmp_path):
    repository = FileProjectRepository(tmp_path)
    created = repository.create(ProjectCreate(name="Dub Project"))

    updated = repository.set_last_page(created.id, "voice-manipulator")
    restarted_repository = FileProjectRepository(tmp_path)

    assert updated.last_page == "voice-manipulator"
    assert restarted_repository.get(created.id).last_page == "voice-manipulator"
    lip_sync = restarted_repository.set_last_page(created.id, "lip-sync")
    assert lip_sync.last_page == "lip-sync"
    assert FileProjectRepository(tmp_path).get(created.id).last_page == "lip-sync"


def test_project_repository_creates_assets_at_a_chosen_location(tmp_path):
    registry_root = tmp_path / "registry"
    chosen_parent = tmp_path / "voice-work"
    repository = FileProjectRepository(registry_root)

    created = repository.create(
        ProjectCreate(name="Giọng miền Nam", location=str(chosen_parent))
    )

    project_path = Path(created.project_path)
    assert project_path.parent == chosen_parent.resolve()
    assert project_path.name == "giong-mien-nam"
    assert (project_path / "assets").is_dir()
    assert (project_path / "project.json").is_file()
    assert repository.get(created.id).project_path == str(project_path)


def test_project_manifest_and_registry_use_portable_paths(tmp_path):
    repository = FileProjectRepository(tmp_path / "app-data")
    created = repository.create(
        ProjectCreate(name="Portable Project", location=str(tmp_path / "workspace"))
    )

    project_path = Path(created.project_path)
    manifest = json.loads((project_path / "project.json").read_text(encoding="utf-8"))
    registry = json.loads(
        (tmp_path / "app-data" / ".registry" / f"{created.id}.json").read_text(encoding="utf-8")
    )

    assert manifest["projectPath"] == "."
    assert manifest["location"] == "."
    assert not Path(registry["projectPath"]).is_absolute()
    assert str(tmp_path) not in json.dumps(manifest)
    assert str(tmp_path) not in json.dumps(registry)


def test_repository_reopens_a_project_after_its_folder_moves(tmp_path):
    repository = FileProjectRepository(tmp_path / "app-data")
    created = repository.create(
        ProjectCreate(name="Move Me", location=str(tmp_path / "workspace-a"))
    )
    old_path = Path(created.project_path)
    moved_path = tmp_path / "workspace-b" / old_path.name
    moved_path.parent.mkdir(parents=True)
    shutil.move(str(old_path), str(moved_path))

    reopened = repository.open(moved_path)

    assert reopened.id == created.id
    assert Path(reopened.project_path) == moved_path.resolve()
    assert Path(repository.get(created.id).project_path) == moved_path.resolve()


def test_project_folder_copied_without_its_registry_entry_still_opens(tmp_path):
    """A copied project folder must open, not just appear in the list.

    Folders are named after the project slug while the registry keys on the id,
    so `list` could see a copied project that `get` then refused to resolve. On
    this machine that affected seven of eight projects: they showed up in Project
    Hub and failed the moment they were opened.
    """
    origin = FileProjectRepository(tmp_path / "origin" / "projects")
    # Choosing a storage location is the normal path through Project Hub, and it
    # is what makes the folder name a slug rather than the project id.
    created = origin.create(
        ProjectCreate(name="Portable Project", location=str(tmp_path / "origin" / "projects"))
    )
    assert Path(created.project_path).name != created.id

    destination_root = tmp_path / "laptop" / "projects"
    destination_root.mkdir(parents=True)
    shutil.copytree(created.project_path, destination_root / Path(created.project_path).name)

    laptop = FileProjectRepository(destination_root)
    assert [project.id for project in laptop.list()] == [created.id]

    reopened = laptop.get(created.id)
    assert reopened.id == created.id
    assert Path(reopened.project_path) == destination_root / Path(created.project_path).name
    # Adoption is written back, so the next lookup does not rescan the folder.
    assert (destination_root / ".registry" / f"{created.id}.json").is_file()


def test_removing_a_project_forgets_it_but_leaves_the_folder(tmp_path):
    repo = FileProjectRepository(tmp_path / "registry")
    project = repo.create(ProjectCreate(name="Keep files", location=str(tmp_path / "work")))
    folder = Path(project.project_path)

    repo.forget(project.id)

    # Projects are discovered by scanning the folder as well as by the registry,
    # so a removal has to be recorded - deleting the registry entry alone left
    # the scan finding it again and the project never left the list.
    assert [item.id for item in repo.list()] == []
    # The point of Remove: everything is still on disk to be opened again.
    assert (folder / "project.json").is_file()
    assert repo.open(folder).id == project.id
    assert [item.id for item in repo.list()] == [project.id]


def test_deleting_a_project_erases_its_folder(tmp_path):
    repo = FileProjectRepository(tmp_path / "registry")
    project = repo.create(ProjectCreate(name="Erase me", location=str(tmp_path / "work")))
    folder = Path(project.project_path)

    repo.destroy(project.id)

    assert not folder.exists()
    assert [item.id for item in repo.list()] == []


def test_deleting_refuses_a_folder_that_is_not_a_project(tmp_path):
    repo = FileProjectRepository(tmp_path / "registry")
    project = repo.create(ProjectCreate(name="Guarded", location=str(tmp_path / "work")))
    folder = Path(project.project_path)
    # Whatever the record says, without our own marker file this is somebody
    # else's directory and a recursive delete would be unforgivable.
    (folder / "project.json").unlink()

    # Either way it refuses; what matters is that the directory is still there.
    with pytest.raises((KeyError, ValueError)):
        repo.destroy(project.id)
    assert folder.exists()


def test_a_removal_stops_mattering_once_the_folder_is_gone(tmp_path):
    repo = FileProjectRepository(tmp_path / "registry")
    project = repo.create(ProjectCreate(name="Gone anyway", location=str(tmp_path / "work")))
    repo.forget(project.id)
    shutil.rmtree(project.project_path)

    # Nothing to hide any more, so the record of the removal must not linger and
    # shadow a later project that happens to be given the same id.
    assert repo._forgotten() == set()


def test_atomic_writers_do_not_share_temporary_files(tmp_path, monkeypatch):
    destination = tmp_path / "manifest.json"
    first_ready = Event()
    both_ready = Barrier(2)
    expected = {}
    replace = Path.replace

    def overlap_replace(source, target):
        if target == destination:
            first_ready.set()
            both_ready.wait(timeout=5)
            assert json.loads(source.read_text(encoding="utf-8"))["value"] == expected[get_ident()]
        return replace(source, target)

    def write(value):
        expected[get_ident()] = value
        FileProjectRepository._atomic_write(destination, json.dumps({"value": value}))

    monkeypatch.setattr(Path, "replace", overlap_replace)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(write, 1)
        assert first_ready.wait(5)
        second = pool.submit(write, 2)
        first.result(timeout=10)
        second.result(timeout=10)
    assert json.loads(destination.read_text(encoding="utf-8"))["value"] in (1, 2)
    assert list(tmp_path.iterdir()) == [destination]


def test_reopen_cannot_overwrite_a_concurrent_page_update(tmp_path, monkeypatch):
    repo = FileProjectRepository(tmp_path)
    other_instance = FileProjectRepository(tmp_path)
    project = repo.create(ProjectCreate(name="Keep metadata", language="vi", purpose="course"))
    snapshot_read = Event()
    allow_open = Event()
    page_started = Event()
    read = repo._read_project

    def pause_open_snapshot(path):
        snapshot = read(path)
        snapshot_read.set()
        assert allow_open.wait(5)
        return snapshot

    monkeypatch.setattr(repo, "_read_project", pause_open_snapshot)

    def update_page():
        page_started.set()
        return other_instance.set_last_page(project.id, "voice-manipulator")

    with ThreadPoolExecutor(max_workers=2) as pool:
        reopened = pool.submit(repo.open, project.project_path)
        assert snapshot_read.wait(5)
        updated = pool.submit(update_page)
        assert page_started.wait(5)
        try:
            # Old code lets this update commit before the stale open overwrites it.
            updated.result(timeout=.2)
        except TimeoutError:
            pass
        finally:
            allow_open.set()
        reopened.result(timeout=10)
        updated.result(timeout=10)
    persisted = FileProjectRepository(tmp_path).get(project.id)
    assert persisted.last_page == "voice-manipulator"
    assert persisted.language == "vi"
    assert persisted.purpose == "course"


def test_failed_atomic_replace_keeps_previous_json_and_cleans_temp(tmp_path, monkeypatch):
    destination = tmp_path / "manifest.json"
    destination.write_text('{"previous": true}', encoding="utf-8")

    def fail_replace(source, target):
        raise OSError("injected replace failure")

    monkeypatch.setattr(Path, "replace", fail_replace)
    with pytest.raises(OSError, match="injected replace failure"):
        FileProjectRepository._atomic_write(destination, '{"next": true}')
    assert json.loads(destination.read_text(encoding="utf-8")) == {"previous": True}
    assert list(tmp_path.iterdir()) == [destination]


@pytest.mark.skipif(os.name != "nt", reason="Windows denies replacement while this reader is open")
def test_atomic_replace_retries_a_real_windows_reader(tmp_path, monkeypatch):
    destination = tmp_path / "manifest.json"
    destination.write_text('{"previous": true}', encoding="utf-8")
    reader = destination.open("rb")
    waits = []

    def release_reader(delay):
        waits.append(delay)
        reader.close()

    monkeypatch.setattr(file_project_repository.time, "sleep", release_reader)
    try:
        FileProjectRepository._atomic_write(destination, '{"next": true}')
    finally:
        reader.close()
    assert waits == [.01]
    assert json.loads(destination.read_text(encoding="utf-8")) == {"next": True}


@pytest.mark.skipif(os.name != "nt", reason="Windows sharing-error retry policy")
def test_persistent_windows_denial_is_bounded_and_preserves_original(tmp_path, monkeypatch):
    destination = tmp_path / "manifest.json"
    destination.write_text('{"previous": true}', encoding="utf-8")
    attempts = []
    waits = []

    def denied_replace(source, target):
        attempts.append(source)
        error = PermissionError("persistent Windows access denial")
        error.winerror = 5
        raise error

    monkeypatch.setattr(Path, "replace", denied_replace)
    monkeypatch.setattr(file_project_repository.time, "sleep", waits.append)
    with pytest.raises(PermissionError, match="persistent Windows access denial"):
        FileProjectRepository._atomic_write(destination, '{"next": true}')
    assert len(attempts) == 6
    assert sum(waits) == pytest.approx(.31)
    assert json.loads(destination.read_text(encoding="utf-8")) == {"previous": True}
    assert list(tmp_path.iterdir()) == [destination]


def test_concurrent_repository_instances_keep_portable_manifest_and_registry(tmp_path):
    repo = FileProjectRepository(tmp_path / "registry")
    project = repo.create(ProjectCreate(name="Concurrent course", location=str(tmp_path / "work"), language="vi"))
    repositories = [FileProjectRepository(repo.root) for _ in range(6)]
    barrier = Barrier(len(repositories))

    def exercise(index):
        repository = repositories[index]
        barrier.wait(timeout=5)
        for n in range(12):
            repository.set_last_page(project.id, "voice-training" if n % 2 else "speech-to-text")
            repository.open(project.project_path)
            assert repository.get(project.id).language == "vi"
            assert repository.list()[0].id == project.id

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(exercise, range(6)))
    repo.set_last_page(project.id, "voice-manipulator")
    persisted = FileProjectRepository(repo.root).get(project.id)
    assert persisted.last_page == "voice-manipulator"
    assert persisted.language == "vi"
    manifest = json.loads((Path(project.project_path) / "project.json").read_text(encoding="utf-8"))
    registry = json.loads((repo.registry_root / f"{project.id}.json").read_text(encoding="utf-8"))
    assert manifest["projectPath"] == manifest["location"] == "."
    assert not Path(registry["projectPath"]).is_absolute()
    assert not list(Path(project.project_path).glob("*.tmp"))
    assert not list(repo.registry_root.glob("*.tmp"))

