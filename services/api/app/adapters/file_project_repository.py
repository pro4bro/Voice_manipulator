from __future__ import annotations

import json
import os
import re
import shutil
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

    #: Ids the user removed from the library. The default project folder is also
    #: scanned directly, so deleting a registry entry does not hide anything -
    #: the scan simply finds the folder again. This is what a removal means.
    FORGOTTEN_FILE = "forgotten.json"

    def _forgotten(self) -> set[str]:
        try:
            data = json.loads((self.registry_root / self.FORGOTTEN_FILE).read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            return set()
        if not isinstance(data, list):
            return set()
        # An id whose folder is gone has nothing left to hide, and keeping it
        # would silently shadow any later project that took the same id.
        return {
            str(item) for item in data
            if (self.root / str(item) / "project.json").is_file()
        }

    def _write_forgotten(self, ids: set[str]) -> None:
        self._atomic_write(
            self.registry_root / self.FORGOTTEN_FILE,
            json.dumps(sorted(ids), ensure_ascii=False, indent=2),
        )

    def list(self) -> list[ProjectRecord]:
        projects: list[ProjectRecord] = []
        metadata_paths = [
            *(path for path in self.registry_root.glob("*.json") if path.name != self.FORGOTTEN_FILE),
            *self.root.glob("*/project.json"),
        ]
        seen: set[str] = self._forgotten()
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
        return self._adopt_unregistered(project_id)

    def _adopt_unregistered(self, project_id: str) -> ProjectRecord:
        """Find a project folder that `list` can see but the registry has not indexed.

        `list` discovers projects by scanning for `*/project.json`, while `get`
        only knew the registry and a folder named exactly after the project id.
        Folders are named after the project's slug, not its id, so a project
        folder copied to another machine without its registry entry appeared in
        Project Hub and then failed to open - seven of eight local projects did
        exactly that. Adopting it here writes the missing entry once.
        """
        for metadata_path in self.root.glob("*/project.json"):
            try:
                project = self._read_project(metadata_path)
            except (OSError, ValueError):
                continue
            if project.id != project_id:
                continue
            self._write(project)
            self.activity.ensure_handoff(project.project_path)
            self.activity.append(
                project.project_path,
                "PROJECT_ADOPTED",
                "Thư mục project được nhận lại vào registry của máy này",
            )
            return project
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
        """Pointing at a folder is also how a removed project rejoins the list."""
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

    def forget(self, project_id: str) -> ProjectRecord:
        """Drop a project from the library, leaving every file where it is.

        The registry is only a list of places to look, so removing an entry is
        the whole operation - the project can be opened again later by pointing
        at its folder.
        """
        project = self.get(project_id)
        (self.registry_root / f"{project.id}.json").unlink(missing_ok=True)
        self._write_forgotten(self._forgotten() | {project.id})
        return project

    def destroy(self, project_id: str) -> ProjectRecord:
        """Erase a project's folder as well as its registry entry.

        Refuses anything that is not a project folder we wrote, so a mistyped or
        tampered path cannot turn this into a recursive delete of somewhere else.
        """
        project = self.get(project_id)
        project_path = Path(project.project_path).resolve()
        if not (project_path / "project.json").is_file():
            raise ValueError("Thư mục này không phải project Pro4Bro; không xóa.")
        (self.registry_root / f"{project.id}.json").unlink(missing_ok=True)
        shutil.rmtree(project_path, ignore_errors=False)
        # Nothing left to hide, and keeping the id would shadow a later project
        # that happened to be given the same name.
        self._write_forgotten(self._forgotten() - {project.id})
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
        # Writing a project into the registry is how it joins the library, so it
        # is also how a removed one comes back: open its folder again.
        forgotten = self._forgotten()
        if project.id in forgotten:
            self._write_forgotten(forgotten - {project.id})

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
