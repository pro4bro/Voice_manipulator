"""Reviewed identities are project data, separate from generated speaker IDs."""
from pydantic import Field, model_validator
from app.domain.lipsync import LipSyncModel, Id


class FaceObservationReview(LipSyncModel):
    id: Id
    face_id: Id
    reviewed: bool = False


class FaceIdentityBinding(LipSyncModel):
    face_id: Id
    speaker_profile_id: Id | None = None


class FaceReview(LipSyncModel):
    analysis_id: Id
    revision: int = Field(ge=0, default=0)
    observations: list[FaceObservationReview] = Field(default_factory=list, max_length=100000)
    bindings: list[FaceIdentityBinding] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def unique(self):
        if len({o.id for o in self.observations}) != len(self.observations) or len({b.face_id for b in self.bindings}) != len(self.bindings):
            raise ValueError("ID review bị trùng")
        return self


def schedule_faces(tasks, analysis, review):
    """Schedule only identities with explicit reviewed exemplars and binding.

    This is a candidate schedule, not a claim a face is on-screen. The worker
    re-detects and recognizes every frame, skips ambiguous or absent people.
    """
    known = {o["id"] for o in analysis["observations"]}
    reviewed = {o.face_id for o in review.observations if o.reviewed and o.id in known}
    bindings = {}
    for binding in review.bindings:
        if binding.face_id in reviewed and binding.speaker_profile_id:
            bindings.setdefault(binding.speaker_profile_id, []).append(binding.face_id)
    result = []
    for task in tasks:
        for face_id in bindings.get(task["speakerProfileId"], []):
            result.append({**task, "faceId": face_id, "status": "verify-face-per-frame"})
    return result
