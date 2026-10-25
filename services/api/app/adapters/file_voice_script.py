from __future__ import annotations

import threading
import json
from pathlib import Path
from app.domain.ports import ProjectRepository
from app.domain.voice_script_document import (VoiceScriptDocument, apply_legacy_row_groups,
    legacy_row_groups, referenced_script_row_ids)
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

    def _active_migration_context(self, project_id: str) -> tuple[list[VoiceScriptDocument], set[str]]:
        project_root = Path(self.projects.get(project_id).project_path)
        book_path = project_root / "scripts" / "voice-output-sessions.json"
        book = json.loads(book_path.read_text(encoding="utf-8")) if book_path.is_file() else {}
        active_id = book.get("activeVersionId")
        version = next((version for session in book.get("sessions", [])
            for version in session.get("versions", []) if version.get("id") == active_id), None)
        state = (version or {}).get("state", {})
        related = []
        for key in ("script", "generatedScript", "fullGeneratedScript"):
            raw = state.get(key)
            if isinstance(raw, dict):
                related.append(VoiceScriptDocument.model_validate({**raw, "turnGroupingVersion": 1}))
        sidecars = list(state.get("sidecars", {}).values())
        for name in ("reference-bindings.json", "timing-plans.json"):
            path = project_root / "scripts" / name
            if path.is_file():
                sidecars.append(json.loads(path.read_text(encoding="utf-8")))
        return related, referenced_script_row_ids(*sidecars)

    def get(self, project_id: str) -> VoiceScriptDocument:
        with self._lock:
            path = self._path(project_id)
            if not path.is_file():
                return VoiceScriptDocument()
            raw = json.loads(path.read_text(encoding="utf-8"))
            if int(raw.get("turnGroupingVersion", 0)) < 1:
                backup = path.with_name(path.name + ".pre-turn-grouping")
                if not backup.exists():
                    FileProjectRepository._atomic_write(backup, json.dumps(raw, ensure_ascii=False, indent=2))
                raw["turnGroupingVersion"] = 1
                legacy = VoiceScriptDocument.model_validate(raw)
                related, protected = self._active_migration_context(project_id)
                groups = legacy_row_groups(legacy, related, protected)
                migrated = apply_legacy_row_groups(legacy, groups).model_copy(update={"revision": legacy.revision + 1})
                FileProjectRepository._atomic_write(path, migrated.model_dump_json(by_alias=True, indent=2))
                return migrated
            return VoiceScriptDocument.model_validate(raw)

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
