"""Project-owned grouping of immutable Voice Outputs into editable versions."""
from __future__ import annotations

import json
import hashlib
import shutil
import threading
import wave
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.domain.voice_edits import VoiceEditDocument


class FileVoiceOutputSessions:
    _lock = threading.RLock()

    def __init__(self, outputs):
        self.outputs = outputs

    def _path(self, project_id: str) -> Path:
        return Path(self.outputs.projects.get(project_id).project_path) / "scripts" / "voice-output-sessions.json"

    def _write(self, project_id: str, book: dict) -> dict:
        book["revision"] += 1
        FileProjectRepository._atomic_write(self._path(project_id), json.dumps(book, ensure_ascii=False, indent=2))
        return book

    @staticmethod
    def _version(output_id: str | None, index: int, parent: str | None = None, accepts_next_output: bool = False) -> dict:
        return {"id": uuid4().hex, "name": f"Version {index}", "outputId": output_id,
                "parentVersionId": parent, "acceptsNextOutput": accepts_next_output, "createdAt": datetime.now(timezone.utc).isoformat()}

    def _sync(self, project_id: str) -> dict:
        path = self._path(project_id)
        first_adoption = not path.is_file()
        book = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {
            "revision": 0, "activeSessionId": None, "activeVersionId": None, "sessions": []}
        outputs = self.outputs.list(project_id)
        available = {output.id for output in outputs}
        changed = False
        for session in book["sessions"]:
            for version in session["versions"]:
                if version["outputId"] and version["outputId"] not in available:
                    version["outputId"] = None
                    version["acceptsNextOutput"] = False
                    changed = True
        assigned = {v["outputId"] for s in book["sessions"] for v in s["versions"] if v["outputId"]}
        for output in reversed(outputs):
            if output.id in assigned:
                continue
            active = next((s for s in book["sessions"] if s["id"] == book["activeSessionId"]), None)
            blank = next((v for v in active["versions"] if v["id"] == book["activeVersionId"] and v["outputId"] is None and v.get("acceptsNextOutput")), None) if active else None
            if blank:
                blank["outputId"] = output.id
                blank["acceptsNextOutput"] = False
            else:
                version = self._version(output.id, 1)
                session = {"id": uuid4().hex, "name": f"Session {len(book['sessions']) + 1}", "versions": [version]}
                book["sessions"].append(session)
                if first_adoption or not book["activeSessionId"]:
                    book["activeSessionId"], book["activeVersionId"] = session["id"], version["id"]
            changed = True
        if changed:
            self._write(project_id, book)
        return book

    def get(self, project_id: str) -> dict:
        with self._lock:
            return self._sync(project_id)

    def _current(self, project_id: str, revision: int) -> dict:
        book = self._sync(project_id)
        if revision != book["revision"]:
            raise ScriptRevisionConflict("Danh sách Session/Version đã đổi; tải lại.")
        return book

    def create_session(self, project_id: str, revision: int) -> dict:
        with self._lock:
            book = self._current(project_id, revision)
            version = self._version(None, 1, accepts_next_output=True)
            session = {"id": uuid4().hex, "name": f"Session {len(book['sessions']) + 1}", "versions": [version]}
            book["sessions"].append(session)
            book["activeSessionId"], book["activeVersionId"] = session["id"], version["id"]
            return self._write(project_id, book)

    def select(self, project_id: str, revision: int, version_id: str) -> dict:
        with self._lock:
            book = self._current(project_id, revision)
            session = next((s for s in book["sessions"] if any(v["id"] == version_id for v in s["versions"])), None)
            if session is None:
                raise KeyError(version_id)
            book["activeSessionId"], book["activeVersionId"] = session["id"], version_id
            return self._write(project_id, book)

    def create_version(self, project_id: str, revision: int, source_output_id: str) -> tuple[dict, object]:
        with self._lock:
            book = self._current(project_id, revision)
            session = next((s for s in book["sessions"] if any(v["outputId"] == source_output_id for v in s["versions"])), None)
            if session is None:
                raise KeyError(source_output_id)
            source_version = next(v for v in session["versions"] if v["outputId"] == source_output_id)
            source = self.outputs.get(project_id, source_output_id)
            original = self.outputs.audio_path(project_id, source_output_id)
            if not original.is_file() or original.stat().st_size == 0:
                raise FileNotFoundError(original)
            try:
                with wave.open(str(original), "rb") as pcm:
                    if (pcm.getnchannels(), pcm.getsampwidth(), pcm.getframerate()) != (1, 2, 24000) or pcm.getnframes() == 0:
                        raise ValueError("Voice Output nguồn cần WAV PCM16 mono 24 kHz hợp lệ.")
            except (wave.Error, EOFError) as exc:
                raise ValueError("Voice Output nguồn không phải WAV hợp lệ.") from exc
            new_id, audio = self.outputs.reserve(project_id)
            try:
                shutil.copy2(original, audio)
                source_edits = original.parent / "edits.json"
                if source_edits.is_file():
                    document = VoiceEditDocument.model_validate_json(source_edits.read_text(encoding="utf-8"))
                    if document.output_id != source_output_id or document.source_sha256 != hashlib.sha256(original.read_bytes()).hexdigest():
                        raise ValueError("Lịch sử chỉnh sửa không khớp Voice Output nguồn.")
                    cloned = document.model_copy(update={"output_id": new_id, "revision": 0})
                    FileProjectRepository._atomic_write(audio.parent / "edits.json", cloned.model_dump_json(by_alias=True, indent=2))
                copied = source.model_copy(update={"id": new_id, "name": f"{source.name} · bản sao", "parameters": {**source.parameters, "voiceOutputVersion": {"sourceOutputId": source_output_id}}, "audio_path": f"assets/voice-output/{new_id}/audio.wav", "created_at": datetime.now(timezone.utc)})
                self.outputs.save(project_id, copied)
                version = self._version(new_id, len(session["versions"]) + 1, source_version["id"])
                session["versions"].append(version)
                book["activeSessionId"], book["activeVersionId"] = session["id"], version["id"]
                return self._write(project_id, book), copied
            except Exception:
                self.outputs.discard(project_id, new_id)
                raise
