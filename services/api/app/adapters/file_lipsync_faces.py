import hashlib
import json
from pathlib import Path
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.lipsync_preflight import digest_file
from app.domain.lipsync_coverage import coverage
from app.domain.lipsync_faces import FaceReview, FaceObservationReview


def analysis_inputs(store, project_id, document):
    assets = store.validate_sources(project_id, document)
    parts = coverage(document, assets, document.detection_scope)
    sources = {}
    for asset_id in sorted({part["assetId"] for part in parts}):
        path = store.media.resolve_video_path(project_id, asset_id)
        sources[asset_id] = {"path": path.relative_to(store.root(project_id)).as_posix(), **digest_file(path)}
    canonical = json.dumps({"coverage": parts, "sources": sources}, sort_keys=True, separators=(",", ":"))
    return {"key": hashlib.sha256(canonical.encode()).hexdigest(), "coverage": parts, "sources": sources}


class FileLipSyncFaces:
    def __init__(self, store, speakers):
        self.store, self.speakers = store, speakers

    def directory(self, project_id, analysis_id):
        # API parameters are not trusted paths.
        from uuid import UUID
        try:
            if str(UUID(analysis_id)) != analysis_id:
                raise ValueError()
        except (ValueError, AttributeError):
            raise KeyError("Invalid analysis ID")
        return self.store.jobs_root(project_id) / analysis_id

    def get(self, project_id, analysis_id):
        directory = self.directory(project_id, analysis_id)
        status = json.loads((directory / "status.json").read_text(encoding="utf-8"))
        if status["kind"] != "analysis" or status["status"] != "completed":
            raise ValueError("Phân tích chưa hoàn tất")
        analysis = json.loads((directory / "result.json").read_text(encoding="utf-8"))
        path = directory / "review.json"
        review = FaceReview.model_validate_json(path.read_text(encoding="utf-8")) if path.is_file() else FaceReview(
            analysis_id=analysis_id, observations=[FaceObservationReview(id=o["id"], face_id=o["faceId"]) for o in analysis["observations"]])
        return analysis, review

    def save(self, project_id, review):
        with self.store._lock:
            analysis, previous = self.get(project_id, review.analysis_id)
            if previous.revision != review.revision:
                raise ScriptRevisionConflict("Face review đã đổi; tải lại")
            if {o.id for o in review.observations} != {o["id"] for o in analysis["observations"]}:
                raise ValueError("Review phải giữ đủ observation từ phân tích")
            identities = {o.face_id for o in review.observations}
            speakers = {speaker.id for speaker in self.speakers.get(project_id).speakers}
            if any(b.face_id not in identities or b.speaker_profile_id and b.speaker_profile_id not in speakers for b in review.bindings):
                raise ValueError("Face ID hoặc Speaker Profile không tồn tại")
            request = json.loads((self.directory(project_id, review.analysis_id) / "request.json").read_text(encoding="utf-8"))
            if request["key"] != analysis_inputs(self.store, project_id, self.store.get(project_id))["key"]:
                raise ScriptRevisionConflict("Nguồn/phạm vi nhận diện đã đổi. Chạy phân tích lại")
            updated = review.model_copy(update={"revision": previous.revision + 1})
            FileProjectRepository._atomic_write(self.directory(project_id, review.analysis_id) / "review.json", updated.model_dump_json(by_alias=True, indent=2))
            return updated

    def thumbnail(self, project_id, analysis_id, observation_id):
        analysis, _ = self.get(project_id, analysis_id)
        item = next((o for o in analysis["observations"] if o["id"] == observation_id), None)
        if not item:
            raise KeyError("Unknown face observation")
        root = self.directory(project_id, analysis_id).resolve()
        path = (self.store.root(project_id) / item["thumbnail"]).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise KeyError("Missing face thumbnail")
        return path
