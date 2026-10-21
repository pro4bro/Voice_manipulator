import json
import shutil
from uuid import uuid4
from app.adapters.file_lipsync import FileLipSync
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.domain.lipsync_sessions import LipSyncSessions, LipSyncSession, LipSyncVersion, LipSyncVersionState


class FileLipSyncSessions:
    def __init__(self, store):
        self.store = store

    def get(self, project_id):
        with self.store._lock:
            path = self.store.root(project_id) / "scripts/lipsync/sessions.json"
            if path.is_file():
                return LipSyncSessions.model_validate_json(path.read_text(encoding="utf-8"))
            if (self.store.root(project_id) / "scripts/lipsync-composition.json").is_file():
                return LipSyncSessions(sessions=[LipSyncSession(id="session-legacy", name="Session 1", versions=[LipSyncVersion(id="legacy", name="Version 1")])], active_session_id="session-legacy", active_version_id="legacy")
            return LipSyncSessions()

    def scoped(self, project_id, version_id):
        book = self.get(project_id)
        if not any(v.id == version_id for session in book.sessions for v in session.versions):
            raise KeyError("Version không thuộc project")
        return FileLipSync(self.store.projects, self.store.media, self.store.outputs, self.store.catalog, version_id)

    def _write(self, project_id, book):
        book = LipSyncSessions.model_validate(book.model_dump())
        book.revision += 1
        FileProjectRepository._atomic_write(self.store.root(project_id) / "scripts/lipsync/sessions.json", book.model_dump_json(by_alias=True, indent=2))
        return book

    def _current(self, project_id, revision):
        book = self.get(project_id)
        if book.revision != revision:
            raise ScriptRevisionConflict("Danh sách Session/Version đã đổi; tải lại")
        return book

    def create_session(self, project_id, revision, name=None):
        with self.store._lock:
            book = self._current(project_id, revision)
            version = LipSyncVersion(id=uuid4().hex, name="Version 1")
            session = LipSyncSession(id=uuid4().hex, name=name or f"Session {len(book.sessions) + 1}", versions=[version])
            scoped = FileLipSync(self.store.projects, self.store.media, self.store.outputs, self.store.catalog, version.id)
            FileProjectRepository._atomic_write(scoped.state_path(project_id), LipSyncVersionState().model_dump_json(by_alias=True, indent=2))
            book.sessions.append(session)
            book.active_session_id, book.active_version_id = session.id, version.id
            return self._write(project_id, book)

    def select(self, project_id, revision, version_id):
        with self.store._lock:
            book = self._current(project_id, revision)
            selected = next((s for s in book.sessions if any(v.id == version_id for v in s.versions)), None)
            if not selected:
                raise KeyError("Không có version")
            book.active_session_id, book.active_version_id = selected.id, version_id
            return self._write(project_id, book)

    def create_version(self, project_id, revision, source_id, source_revision, name=None):
        with self.store._lock:
            book = self._current(project_id, revision)
            session = next((s for s in book.sessions if any(v.id == source_id for v in s.versions)), None)
            if not session:
                raise KeyError("Không có version nguồn")
            source = self.scoped(project_id, source_id)
            document = source.get(project_id)
            if document.revision != source_revision:
                raise ScriptRevisionConflict("Version nguồn đã đổi; lưu/tải lại trước khi tạo version")
            version = LipSyncVersion(id=uuid4().hex, name=name or f"Version {len(session.versions) + 1}", parent_version_id=source_id)
            destination = FileLipSync(self.store.projects, self.store.media, self.store.outputs, self.store.catalog, version.id)
            self.store.validate_sources(project_id, document)
            FileProjectRepository._atomic_write(destination.state_path(project_id), LipSyncVersionState(document=document.model_copy(update={"revision": 0}), face_reviews=source.get_state(project_id).face_reviews).model_dump_json(by_alias=True, indent=2))
            # Reviewed face examples are editing decisions too. Clone completed
            # analysis only; rendered outputs and in-flight jobs stay in source.
            for status in source.jobs_root(project_id).glob("*/status.json"):
                state = json.loads(status.read_text(encoding="utf-8"))
                if state["kind"] != "analysis" or state["status"] != "completed":
                    continue
                src, dst = status.parent, destination.jobs_root(project_id) / status.parent.name
                result = json.loads((src / "result.json").read_text(encoding="utf-8"))
                dst.mkdir(parents=True, exist_ok=True)
                for filename in ("request.json", "status.json", "review.json", "worker.log"):
                    if (src / filename).is_file():
                        shutil.copy2(src / filename, dst / filename)
                for item in result["observations"]:
                    original = (source.root(project_id) / item["thumbnail"]).resolve()
                    if not original.is_relative_to(src.resolve()) or not original.is_file():
                        raise ValueError("Thiếu thumbnail nguồn")
                    target = dst / "faces" / original.name
                    target.parent.mkdir(exist_ok=True)
                    shutil.copy2(original, target)
                    item["thumbnail"] = target.relative_to(source.root(project_id)).as_posix()
                FileProjectRepository._atomic_write(dst / "result.json", json.dumps(result, ensure_ascii=False, indent=2))
            session.versions.append(version)
            book.active_session_id, book.active_version_id = session.id, version.id
            return self._write(project_id, book)
