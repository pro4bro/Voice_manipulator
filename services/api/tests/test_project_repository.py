from __future__ import annotations

import json
import shutil
from pathlib import Path

from app.adapters.file_project_repository import FileProjectRepository
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
