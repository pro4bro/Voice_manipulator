from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import Field, model_validator
from app.domain.lipsync_faces import FaceReview
from app.domain.lipsync import LipSyncModel, LipSyncDocument, Id


class LipSyncHistoryDocument(LipSyncDocument):
    face_reviews: dict[Id, FaceReview] = Field(default_factory=dict, max_length=200)


class LipSyncVersionState(LipSyncModel):
    document: LipSyncDocument = Field(default_factory=LipSyncDocument)
    face_reviews: dict[Id, FaceReview] = Field(default_factory=dict, max_length=200)
    past: list[LipSyncHistoryDocument] = Field(default_factory=list, max_length=100)
    future: list[LipSyncHistoryDocument] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def bounded_history(self):
        if len(self.past) + len(self.future) > 100:
            raise ValueError("Lịch sử tối đa 100 thao tác cho mỗi version")
        return self


class LipSyncVersion(LipSyncModel):
    id: Id
    name: str = Field(min_length=1, max_length=120)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    parent_version_id: Id | None = None


class LipSyncSession(LipSyncModel):
    id: Id
    name: str = Field(min_length=1, max_length=120)
    versions: list[LipSyncVersion] = Field(default_factory=list, max_length=200)


class LipSyncRecycleEntry(LipSyncModel):
    id: Id
    kind: Literal["session", "version"]
    name: str
    deleted_at: str
    snapshot: dict[str, Any]
    index: int = 0
    parent_session_id: Id | None = None
    parent_session_name: str | None = None


class LipSyncSessions(LipSyncModel):
    version: int = Field(default=1, ge=1, le=1)
    revision: int = Field(default=0, ge=0)
    sessions: list[LipSyncSession] = Field(default_factory=list, max_length=200)
    recycle: list[LipSyncRecycleEntry] = Field(default_factory=list)
    active_session_id: Id | None = None
    active_version_id: Id | None = None

    @model_validator(mode="after")
    def linked(self):
        session_ids = [s.id for s in self.sessions]
        version_ids = [v.id for s in self.sessions for v in s.versions]
        if len(set(session_ids)) != len(session_ids) or len(set(version_ids)) != len(version_ids):
            raise ValueError("ID Session/Version bị trùng")
        if self.sessions and (self.active_session_id or self.active_version_id):
            selected = next((s for s in self.sessions if s.id == self.active_session_id), None)
            if not selected or self.active_version_id not in {v.id for v in selected.versions}:
                raise ValueError("Version không thuộc Session đang chọn")
        elif not self.sessions and (self.active_session_id or self.active_version_id):
            raise ValueError("Chưa có Session")
        return self
