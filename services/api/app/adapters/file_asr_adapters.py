from __future__ import annotations

from pathlib import Path

from app.domain.models import ProjectAsrAdapter
from app.domain.ports import ProjectRepository


class FileAsrAdapters:
    """Speech-recognition adapters a project trained, one record each.

    ```
    <project>/assets/asr-adapters/<adapter-id>/adapter.json
    ```

    The adapter weights stay in the run folder that produced them; the record
    points there with a project-relative path, so Speech to Text can offer the
    adapter as a choice and the run remains the single copy.
    """

    def __init__(self, projects: ProjectRepository) -> None:
        self.projects = projects

    def root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "assets" / "asr-adapters"

    def publish(self, project_id: str, adapter: ProjectAsrAdapter) -> ProjectAsrAdapter:
        folder = self.root(project_id) / adapter.id
        folder.mkdir(parents=True, exist_ok=True)
        temporary = folder / "adapter.json.tmp"
        temporary.write_text(adapter.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(folder / "adapter.json")
        return adapter

    def list(self, project_id: str) -> list[ProjectAsrAdapter]:
        root = self.root(project_id)
        if not root.is_dir():
            return []
        adapters: list[ProjectAsrAdapter] = []
        for record in root.glob("*/adapter.json"):
            try:
                adapters.append(ProjectAsrAdapter.model_validate_json(record.read_text(encoding="utf-8")))
            except ValueError:
                continue
        return sorted(adapters, key=lambda adapter: adapter.created_at, reverse=True)

    def get(self, project_id: str, adapter_id: str) -> ProjectAsrAdapter:
        record = self.root(project_id) / adapter_id / "adapter.json"
        if not record.is_file():
            raise KeyError(adapter_id)
        return ProjectAsrAdapter.model_validate_json(record.read_text(encoding="utf-8"))

    def weights(self, project_id: str, adapter_id: str) -> Path:
        adapter = self.get(project_id, adapter_id)
        return Path(self.projects.get(project_id).project_path) / adapter.adapter_path
