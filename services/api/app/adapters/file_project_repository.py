from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.domain.models import ProjectCreate, ProjectRecord, WorkspacePage
from app.adapters.project_activity_log import ProjectActivityLog


class FileProjectRepository:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.registry_root = self.root / ".registry"
        self.activity = ProjectActivityLog()
        self.root.mkdir(parents=True, exist_ok=True)
        self.registry_root.mkdir(parents=True, exist_ok=True)

    def list(self) -> list[ProjectRecord]:
        projects: list[ProjectRecord] = []
        metadata_paths = [
            *self.registry_root.glob("*.json"),
            *self.root.glob("*/project.json"),
        ]
        seen: set[str] = set()
        for metadata_path in metadata_paths:
            try:
                project = self._read(metadata_path)
            except (OSError, ValueError):
                continue
            if project.id not in seen:
                projects.append(project)
                seen.add(project.id)
        return sorted(projects, key=lambda project: project.updated_at, reverse=True)

    def get(self, project_id: str) -> ProjectRecord:
        metadata_path = self.registry_root / f"{project_id}.json"
        if metadata_path.is_file():
            try:
                return self._read(metadata_path)
            except (OSError, ValueError, KeyError):
                pass
        local_metadata = self._project_path(project_id) / "project.json"
        if local_metadata.is_file():
            return self._read(local_metadata)
        raise KeyError(project_id)

    def create(self, payload: ProjectCreate) -> ProjectRecord:
        project_id = self._new_id(payload.name)
        project_path = self._allocate_project_path(project_id, payload)
        for child in ("assets", "exports", "cache", "jobs"):
            (project_path / child).mkdir(parents=True, exist_ok=True)
        project = ProjectRecord.create(project_id, payload, project_path).model_copy(
            update={"location": str(project_path.parent.resolve())}
        )
        self._write(project)
        self.activity.ensure_handoff(project_path)
        self.activity.append(project_path, "PROJECT_CREATED", "Project được tạo", {"projectId": project.id})
        return project

    def open(self, path: str | Path) -> ProjectRecord:
        selected = Path(path).expanduser().resolve()
        metadata_path = selected if selected.name.casefold() == "project.json" else selected / "project.json"
        if not metadata_path.is_file():
            raise ValueError("Thư mục đã chọn không chứa project.json.")
        project = self._read_project(metadata_path)
        for child in ("assets", "exports", "cache", "jobs", "notes", "activity"):
            (Path(project.project_path) / child).mkdir(parents=True, exist_ok=True)
        self._write(project)
        self.activity.ensure_handoff(project.project_path)
        self.activity.append(project.project_path, "PROJECT_OPENED", "Project được liên kết lại với Project Hub")
        return project

    def set_last_page(self, project_id: str, page: WorkspacePage) -> ProjectRecord:
        project = self.get(project_id).model_copy(
            update={"last_page": page, "updated_at": datetime.now(timezone.utc)}
        )
        self._write(project)
        self.activity.append(project.project_path, "WORKSPACE_CHANGED", f"Mở page {page}", {"page": page})
        return project

    def _write(self, project: ProjectRecord) -> None:
        project_path = Path(project.project_path).resolve()
        portable = project.model_copy(update={"project_path": ".", "location": "."})
        self._atomic_write(
            project_path / "project.json",
            portable.model_dump_json(by_alias=True, indent=2),
        )
        locator = self._portable_locator(project_path)
        registry = {
            "version": 1,
            "projectId": project.id,
            "projectPath": locator,
        }
        self._atomic_write(
            self.registry_root / f"{project.id}.json",
            json.dumps(registry, ensure_ascii=False, indent=2),
        )

    def _project_path(self, project_id: str) -> Path:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,80}", project_id):
            raise KeyError(project_id)
        path = (self.root / project_id).resolve()
        if self.root not in path.parents:
            raise KeyError(project_id)
        return path

    def _new_id(self, name: str) -> str:
        slug = self._slug(name)[:50]
        slug = slug or "voice-project"
        return f"{slug}-{uuid4().hex[:8]}"

    def _read(self, metadata_path: Path) -> ProjectRecord:
        if metadata_path.parent.resolve() != self.registry_root:
            project = self._read_project(metadata_path)
            if self._manifest_needs_migration(metadata_path):
                self._write(project)
                self.activity.ensure_handoff(project.project_path)
                self.activity.append(project.project_path, "PROJECT_MIGRATED", "Manifest được chuyển sang đường dẫn tương đối")
            return project

        raw = json.loads(metadata_path.read_text(encoding="utf-8"))
        if raw.get("version") == 1 and raw.get("projectId"):
            project_path = self._resolve_locator(str(raw.get("projectPath", "")))
            project = self._read_project(project_path / "project.json")
            if project.id != raw["projectId"]:
                raise ValueError("Project registry ID does not match project.json.")
            return project

        legacy = ProjectRecord.model_validate(raw)
        project_path = Path(legacy.project_path).expanduser().resolve()
        project = self._read_project(project_path / "project.json") if (project_path / "project.json").is_file() else legacy
        if not project.project_path or project.project_path == ".":
            project = project.model_copy(update={"project_path": str(project_path)})
        self._write(project)
        self.activity.ensure_handoff(project.project_path)
        self.activity.append(project.project_path, "PROJECT_MIGRATED", "Registry cũ được chuyển sang locator tương đối")
        return project

    def _read_project(self, metadata_path: Path) -> ProjectRecord:
        project = ProjectRecord.model_validate_json(metadata_path.read_text(encoding="utf-8"))
        project_path = metadata_path.parent.resolve()
        return project.model_copy(
            update={"project_path": str(project_path), "location": str(project_path.parent)}
        )

    def _allocate_project_path(self, project_id: str, payload: ProjectCreate) -> Path:
        if not payload.location:
            return self._project_path(project_id)

        parent = Path(payload.location).expanduser().resolve()
        parent.mkdir(parents=True, exist_ok=True)
        base_name = self._slug(payload.name) or "voice-project"
        candidate = parent / base_name
        suffix = 2
        while candidate.exists():
            candidate = parent / f"{base_name}-{suffix}"
            suffix += 1
        candidate.mkdir(parents=True)
        return candidate

    def _portable_locator(self, project_path: Path) -> str:
        try:
            return Path(os.path.relpath(project_path, self.registry_root)).as_posix()
        except ValueError:
            # Different Windows volumes cannot share a relative path. The project
            # manifest remains portable and can always be re-opened from Project Hub.
            return str(project_path)

    def _resolve_locator(self, value: str) -> Path:
        locator = Path(value)
        return locator.resolve() if locator.is_absolute() else (self.registry_root / locator).resolve()

    @staticmethod
    def _manifest_needs_migration(metadata_path: Path) -> bool:
        try:
            raw = json.loads(metadata_path.read_text(encoding="utf-8"))
            return raw.get("projectPath") != "." or raw.get("location") != "."
        except (OSError, ValueError, TypeError):
            return False

    @staticmethod
    def _atomic_write(path: Path, text: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_suffix(path.suffix + ".tmp")
        temporary_path.write_text(text, encoding="utf-8")
        temporary_path.replace(path)

    @staticmethod
    def _slug(value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value.casefold())
        ascii_value = "".join(character for character in normalized if not unicodedata.combining(character))
        return re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")
