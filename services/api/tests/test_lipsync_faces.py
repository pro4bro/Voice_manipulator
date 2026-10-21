import json
from types import SimpleNamespace
from uuid import uuid4
import pytest
from test_lipsync_document import setup
from app.adapters.file_lipsync_faces import FileLipSyncFaces, analysis_inputs
from app.domain.lipsync_faces import FaceReview, FaceIdentityBinding, schedule_faces
from app.domain.lipsync import LipSyncRange
from app.adapters.file_voice_script import ScriptRevisionConflict


def test_face_review_preserves_observations_validates_speakers_revision_and_stale_scope(tmp_path):
    _, project, _, _, store, doc = setup(tmp_path)
    doc = store.save(project.id, doc)
    faces = FileLipSyncFaces(store, SimpleNamespace(get=lambda _: SimpleNamespace(speakers=[SimpleNamespace(id="speaker")])) )
    identifier = str(uuid4())
    directory = faces.directory(project.id, identifier)
    directory.mkdir(parents=True)
    (directory / "status.json").write_text(json.dumps({"kind": "analysis", "status": "completed"}))
    (directory / "request.json").write_text(json.dumps(analysis_inputs(store, project.id, doc)))
    (directory / "result.json").write_text(json.dumps({"observations": [{"id": "o1", "faceId": "face-1"}, {"id": "o2", "faceId": "face-1"}]}))
    _, review = faces.get(project.id, identifier)
    assert not review.observations[0].reviewed
    review.observations[1].face_id = "corrected-face"
    review.observations[1].reviewed = True
    review.bindings = [FaceIdentityBinding(face_id="corrected-face", speaker_profile_id="speaker")]
    saved = faces.save(project.id, review)
    assert saved.revision == 1
    with pytest.raises(ScriptRevisionConflict): faces.save(project.id, review)
    saved.bindings[0].speaker_profile_id = "missing"
    with pytest.raises(ValueError): faces.save(project.id, saved)
    saved.bindings[0].speaker_profile_id = "speaker"
    doc.detection_scope.range = LipSyncRange(start=3, end=4)
    store.save(project.id, doc)
    with pytest.raises(ScriptRevisionConflict): faces.save(project.id, saved)
    with pytest.raises(KeyError): faces.directory(project.id, "../outside")


def test_schedule_requires_review_and_never_uses_wrong_speaker():
    review = FaceReview(analysis_id="analysis", observations=[{"id": "o", "faceId": "f", "reviewed": True}], bindings=[{"faceId": "f", "speakerProfileId": "s"}])
    tasks = [{"speakerProfileId": "other", "sourceStart": 0}, {"speakerProfileId": "s", "sourceStart": 1}]
    assert schedule_faces(tasks, {"observations": [{"id": "o"}]}, review) == [{**tasks[1], "faceId": "f", "status": "verify-face-per-frame"}]
    review.observations[0].reviewed = False
    assert schedule_faces(tasks, {"observations": [{"id": "o"}]}, review) == []
