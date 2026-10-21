from pathlib import Path
from threading import RLock
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.domain.lipsync import LipSyncDocument
from app.domain.lipsync_settings import resolve_lipsync_settings
from app.domain.lipsync_sessions import LipSyncVersionState
import re


class FileLipSync:
    _lock = RLock()

    def __init__(self, projects, media, outputs, catalog, version_id=None):
        self.projects, self.media, self.outputs, self.catalog = projects, media, outputs, catalog
        if version_id is not None and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,119}", version_id):
            raise KeyError("Invalid version ID")
        self.version_id = version_id

    def root(self, project_id):
        return Path(self.projects.get(project_id).project_path)

    def get(self, project_id):
        return self.get_state(project_id).document

    def jobs_root(self, project_id):
        base = self.root(project_id) / "jobs/lipsync"
        return base / "versions" / self.version_id if self.version_id and self.version_id != "legacy" else base

    def state_path(self, project_id):
        return self.root(project_id) / "scripts/lipsync/versions" / f"{self.version_id}.json"

    def get_state(self, project_id):
        with self._lock:
            if self.version_id:
                path = self.state_path(project_id)
                if path.is_file():
                    return LipSyncVersionState.model_validate_json(path.read_text(encoding="utf-8"))
                if self.version_id != "legacy":
                    raise KeyError("Không có version")
            path = self.root(project_id) / "scripts/lipsync-composition.json"
            return LipSyncVersionState(document=LipSyncDocument.model_validate_json(path.read_text(encoding="utf-8"))) if path.is_file() else LipSyncVersionState()

    def validate_sources(self, project_id, document):
        assets = {asset.id: asset for asset in self.media.list_metadata(project_id)}
        for clip in document.clips:
            asset = assets.get(clip.asset_id)
            path = self.media.resolve_video_path(project_id, clip.asset_id) if asset else None
            if not path or not path.is_file() or not path.stat().st_size:
                raise ValueError("Thiếu video nguồn trong project.")
            if clip.out_point > asset.duration + 0.000001:
                raise ValueError("Clip vượt thời lượng video nguồn.")
        if document.audio:
            audio = self.outputs.get(project_id, document.audio.output_id)
            path = self.outputs.audio_path(project_id, audio.id)
            if not path.is_file() or not path.stat().st_size or document.audio.out_point > audio.duration + 0.000001:
                raise ValueError("Voice Output thiếu file hoặc vượt thời lượng nguồn.")
        for engine_id, values in document.engine_settings.items():
            resolve_lipsync_settings(self.catalog.get(engine_id), values)
        if document.engine_id:
            resolve_lipsync_settings(self.catalog.get(document.engine_id), document.engine_settings.get(document.engine_id, {}))
        return assets

    def save(self, project_id, document):
        return self.save_state(project_id, LipSyncVersionState(document=document)).document

    def save_state(self, project_id, state):
        with self._lock:
            document = state.document
            current = self.get(project_id)
            if current.revision != document.revision:
                raise ScriptRevisionConflict("LipSync đã đổi ở cửa sổ khác. Tải lại trước khi lưu.")
            self.validate_sources(project_id, document)
            saved = document.model_copy(update={"revision": current.revision + 1})
            updated = state.model_copy(update={"document": saved})
            if self.version_id:
                FileProjectRepository._atomic_write(self.state_path(project_id), updated.model_dump_json(by_alias=True, indent=2))
            else:
                FileProjectRepository._atomic_write(self.root(project_id) / "scripts/lipsync-composition.json", saved.model_dump_json(by_alias=True, indent=2))
            return updated
