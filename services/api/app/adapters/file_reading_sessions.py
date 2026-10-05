from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from uuid import UUID

from app.domain.models import ReadingSession
from app.domain.ports import ProjectRepository


class FileReadingSessions:
    """Portable, project-owned Reading Session snapshots."""

    def __init__(self, projects: ProjectRepository) -> None:
        self.projects = projects
        self._locks: dict[str, threading.RLock] = {}
        self._locks_guard = threading.Lock()

    def list(self, project_id: str, status: str | None = None) -> list[ReadingSession]:
        root = self._root(project_id)
        sessions: list[ReadingSession] = []
        for path in sorted(root.glob("*/session.json")):
            session = self._read(path)
            if status is None or session.status == status:
                sessions.append(session)
        return sorted(sessions, key=lambda item: (item.created_at, item.id), reverse=True)

    def get(self, project_id: str, session_id: str) -> ReadingSession:
        path = self._session_path(project_id, session_id)
        if not path.is_file():
            raise KeyError(session_id)
        return self._read(path)

    def create(self, project_id: str, session: ReadingSession) -> ReadingSession:
        path = self._session_path(project_id, session.id)
        with self._lock(project_id):
            if path.exists():
                raise FileExistsError(session.id)
            path.parent.mkdir(parents=True, exist_ok=True)
            self._write(path, session)
        return session

    def save(self, project_id: str, session: ReadingSession) -> ReadingSession:
        path = self._session_path(project_id, session.id)
        with self._lock(project_id):
            if not path.is_file():
                raise KeyError(session.id)
            previous = self._read(path)
            if session.revision < previous.revision:
                raise ValueError("Reading Session revision cannot move backwards.")
            self._write(path, session)
        return session

    def _read(self, path: Path) -> ReadingSession:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            # Reject formats from a future writer instead of silently rewriting
            # fields this version does not understand.
            version = raw.get("schemaVersion", raw.get("schema_version", 1))
            if version != 1:
                raise ValueError(f"Unsupported Reading Session schema version: {version}")
            return ReadingSession.model_validate(raw)
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"Could not read Reading Session at {path}.") from exc

    @staticmethod
    def _write(path: Path, session: ReadingSession) -> None:
        payload = session.model_dump_json(by_alias=True, indent=2) + "\n"
        temporary = path.with_name("session.json.tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)

    def _root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "assets" / "training" / "reading-sessions"

    def _session_path(self, project_id: str, session_id: str) -> Path:
        try:
            canonical = str(UUID(session_id))
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValueError("Reading Session ID must be a UUID.") from exc
        if canonical != session_id:
            raise ValueError("Reading Session ID must be a canonical UUID.")
        return self._root(project_id) / canonical / "session.json"

    def _lock(self, project_id: str) -> threading.RLock:
        with self._locks_guard:
            return self._locks.setdefault(project_id, threading.RLock())
