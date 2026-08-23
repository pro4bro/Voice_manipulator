from __future__ import annotations

import shutil
from pathlib import Path

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.domain.models import EnvironmentNoiseProfile, ProjectCreate, SpeakerProfile, TrainingCatalog


def test_training_catalog_defaults_checkpoint_interval_and_persists_profiles(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Training Catalog"))
    repository = FileTrainingCatalog(projects)
    initial = repository.get(project.id)

    assert initial.settings.checkpoint_every == 1000

    speaker = SpeakerProfile(name="Anh Vu", language="Tiếng Việt", region="Miền Nam")
    noise = EnvironmentNoiseProfile(name="Phòng làm việc", asset_ids=["asset-1", "asset-2"])
    saved = repository.save(
        project.id,
        TrainingCatalog(
            speakers=[speaker],
            environment_profiles=[noise],
            settings=initial.settings.model_copy(
                update={
                    "target_speaker_ids": [speaker.id],
                    "environment_profile_id": noise.id,
                    "learn_environment_noise": True,
                }
            ),
        ),
    )

    assert repository.get(project.id) == saved
    catalog_path = Path(project.project_path) / "assets" / "training" / "catalog.json"
    assert str(tmp_path) not in catalog_path.read_text(encoding="utf-8")


def test_training_catalog_survives_moving_the_whole_project(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Portable Training", location=str(tmp_path / "before")))
    repository = FileTrainingCatalog(projects)
    speaker = SpeakerProfile(name="Portable Speaker")
    repository.save(project.id, TrainingCatalog(speakers=[speaker]))

    original = Path(project.project_path)
    moved = tmp_path / "after" / original.name
    moved.parent.mkdir(parents=True)
    shutil.move(str(original), str(moved))
    projects.open(moved)

    assert repository.get(project.id).speakers[0].id == speaker.id
