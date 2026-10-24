from __future__ import annotations

import threading
from pathlib import Path
from app.domain.ports import ProjectRepository
from app.domain.voice_script_document import VoiceScriptDocument
from app.adapters.file_project_repository import FileProjectRepository


class ScriptRevisionConflict(ValueError):
    pass


class FileVoiceScript:
    """Project-owned editable intent, independent of generated output revisions."""

    _lock = threading.RLock()

    def __init__(self, projects: ProjectRepository):
        self.projects = projects

    def _path(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path) / "scripts" / "voice-over.json"

    def get(self, project_id: str) -> VoiceScriptDocument:
        with self._lock:
            path = self._path(project_id)
            return VoiceScriptDocument.model_validate_json(path.read_text(encoding="utf-8")) if path.is_file() else VoiceScriptDocument()

    def save(self, project_id: str, document: VoiceScriptDocument) -> VoiceScriptDocument:
        with self._lock:
            current = self.get(project_id)
            if document.revision != current.revision:
                raise ScriptRevisionConflict("Script đã thay đổi ở cửa sổ khác. Tải lại trước khi lưu.")
            saved = document.model_copy(update={"revision": current.revision + 1})
            path = self._path(project_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            FileProjectRepository._atomic_write(path, saved.model_dump_json(by_alias=True, indent=2))
        after_save = getattr(self, "after_save", None)
        if after_save:
            after_save(project_id, saved)
        return saved
