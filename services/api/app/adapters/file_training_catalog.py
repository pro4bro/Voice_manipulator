from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.adapters.project_activity_log import ProjectActivityLog
from app.domain.models import TrainingCatalog
from app.domain.ports import ProjectRepository


class FileTrainingCatalog:
    def __init__(self, projects: ProjectRepository) -> None:
        self.projects = projects
        self.activity = ProjectActivityLog()

    def get(self, project_id: str) -> TrainingCatalog:
        path = self._path(project_id)
        if not path.is_file():
            return TrainingCatalog()
        try:
            return TrainingCatalog.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return TrainingCatalog()

    def save(self, project_id: str, catalog: TrainingCatalog) -> TrainingCatalog:
        speaker_ids = {speaker.id for speaker in catalog.speakers}
        noise_ids = {profile.id for profile in catalog.environment_profiles}
        settings = catalog.settings
        if any(speaker_id not in speaker_ids for speaker_id in settings.target_speaker_ids):
            raise ValueError("Training settings reference an unknown speaker profile.")
        if settings.environment_profile_id and settings.environment_profile_id not in noise_ids:
            raise ValueError("Training settings reference an unknown environment profile.")

        updated = catalog.model_copy(update={"updated_at": datetime.now(timezone.utc)})
        path = self._path(project_id)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(updated.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(path)
        project = self.projects.get(project_id)
        self.activity.append(
            project.project_path,
            "TRAINING_CATALOG_UPDATED",
            "Speaker profiles, environment profiles, or training settings changed",
            {
                "speakerCount": len(updated.speakers),
                "environmentProfileCount": len(updated.environment_profiles),
                "checkpointEvery": updated.settings.checkpoint_every,
            },
        )
        return updated

    def _path(self, project_id: str) -> Path:
        project = self.projects.get(project_id)
        path = Path(project.project_path) / "assets" / "training" / "catalog.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
