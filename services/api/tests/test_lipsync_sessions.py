import json
import shutil
from uuid import uuid4
from fastapi import FastAPI
from fastapi.testclient import TestClient
from test_lipsync_document import setup
from app.adapters.file_lipsync_sessions import FileLipSyncSessions
from app.adapters.lipsync_routes import lipsync_router
from app.domain.lipsync_sessions import LipSyncVersionState


def test_versions_clone_edits_but_keep_history_and_sources_independent_after_move(tmp_path):
    projects, project, _, _, store, doc = setup(tmp_path)
    saved = store.save(project.id, doc)
    original = (store.root(project.id) / 'scripts/lipsync-composition.json').read_bytes()
    sessions = FileLipSyncSessions(store)
    book = sessions.get(project.id)
    assert book.active_version_id == 'legacy'
    old = sessions.scoped(project.id, 'legacy')
    draft = saved.model_copy(deep=True)
    draft.clips[0].start = 2
    draft = old.save_state(project.id, LipSyncVersionState(document=draft, past=[saved.model_dump()]))
    book = sessions.create_version(project.id, book.revision, 'legacy', draft.document.revision)
    clone = sessions.scoped(project.id, book.active_version_id)
    assert clone.get(project.id).clips[0].start == 2
    assert clone.get_state(project.id).past == []
    state = clone.get_state(project.id)
    state.past = [state.document.model_copy(deep=True)]
    state.document.clips[0].start = 5
    clone.save_state(project.id, state)
    assert old.get(project.id).clips[0].start == 2
    assert old.get_state(project.id).past[0].clips[0].start == 1
    assert clone.jobs_root(project.id) != old.jobs_root(project.id)
    book = sessions.create_session(project.id, book.revision, 'Second product')
    assert sessions.scoped(project.id, book.active_version_id).get(project.id).clips == []
    assert (store.root(project.id) / 'scripts/lipsync-composition.json').read_bytes() == original
    moved = tmp_path / 'moved'
    shutil.move(store.root(project.id), moved)
    projects.open(moved)
    assert sessions.get(project.id).sessions[-1].name == 'Second product'
    assert clone.get_state(project.id).past[0].clips[0].start == 2
    assert str(tmp_path) not in clone.state_path(project.id).read_text(encoding='utf-8')


def test_session_api_fences_revisions_and_job_face_access_by_version(tmp_path):
    projects, project, media, _, store, doc = setup(tmp_path)
    store.save(project.id, doc)
    app = FastAPI()
    app.include_router(lipsync_router(store.catalog, projects, media, store.outputs, runtime_root=tmp_path))
    client = TestClient(app)
    base = f'/api/projects/{project.id}/lipsync'
    book = client.get(base + '/sessions').json()
    clone = client.post(base + '/versions', json={'revision': book['revision'], 'sourceId': 'legacy', 'sourceRevision': 1}).json()
    version = clone['activeVersionId']
    state = client.get(base + '/state', params={'versionId': version}).json()
    assert state['document']['clips'][0]['start'] == 1 and state['past'] == []
    state['past'] = [json.loads(json.dumps(state['document']))]
    state['document']['clips'][0]['start'] = 3
    response = client.put(base + '/state', params={'versionId': version}, json=state)
    assert response.status_code == 200
    assert client.put(base + '/state', params={'versionId': version}, json=state).status_code == 409
    assert client.post(base + '/sessions', json={'revision': 0}).status_code == 409
    assert client.get(base + '/state', params={'versionId': '../outside'}).status_code == 404
    assert client.get(base, params={'versionId': 'legacy'}).json()['clips'][0]['start'] == 1
    identifier = str(uuid4())
    directory = store.jobs_root(project.id) / identifier
    directory.mkdir(parents=True)
    (directory / 'status.json').write_text(json.dumps({'id': identifier, 'kind': 'analysis', 'status': 'completed', 'createdAt': 'test'}))
    assert len(client.get(base + '/jobs', params={'versionId': 'legacy'}).json()) == 1
    assert client.get(base + '/jobs', params={'versionId': version}).json() == []
    assert client.get(base + f'/faces/{identifier}', params={'versionId': version}).status_code == 404


def test_cloned_face_review_and_thumbnails_are_independent_and_portable(tmp_path):
    from types import SimpleNamespace
    from app.adapters.file_lipsync_faces import FileLipSyncFaces, analysis_inputs
    from app.domain.lipsync_faces import FaceIdentityBinding
    _, project, _, _, store, doc = setup(tmp_path)
    saved = store.save(project.id, doc)
    catalog = SimpleNamespace(get=lambda _: SimpleNamespace(speakers=[SimpleNamespace(id='speaker')]))
    faces = FileLipSyncFaces(store, catalog)
    identifier = str(uuid4())
    directory = faces.directory(project.id, identifier)
    (directory / 'faces').mkdir(parents=True)
    thumbnail = directory / 'faces/o.jpg'
    thumbnail.write_bytes(b'thumbnail-fixture')
    (directory / 'status.json').write_text(json.dumps({'id': identifier, 'kind': 'analysis', 'status': 'completed', 'createdAt': 'test'}))
    (directory / 'request.json').write_text(json.dumps(analysis_inputs(store, project.id, saved)))
    (directory / 'result.json').write_text(json.dumps({'observations': [{'id': 'o', 'faceId': 'face', 'thumbnail': thumbnail.relative_to(store.root(project.id)).as_posix()}]}))
    _, review = faces.get(project.id, identifier)
    review.observations[0].reviewed = True
    review.bindings = [FaceIdentityBinding(face_id='face', speaker_profile_id='speaker')]
    faces.save(project.id, review)
    sessions = FileLipSyncSessions(store)
    from app.domain.lipsync_sessions import LipSyncHistoryDocument
    legacy = sessions.scoped(project.id, 'legacy')
    current_review = faces.get(project.id, identifier)[1]
    snapshot = LipSyncHistoryDocument(**saved.model_dump(), face_reviews={identifier: review})
    persisted = legacy.save_state(project.id, LipSyncVersionState(document=saved, face_reviews={identifier: current_review}, past=[snapshot]))
    assert legacy.get_state(project.id).past[0].face_reviews[identifier].bindings[0].speaker_profile_id == 'speaker'
    book = sessions.create_version(project.id, 0, 'legacy', persisted.document.revision)
    clone = sessions.scoped(project.id, book.active_version_id)
    assert clone.get_state(project.id).face_reviews[identifier].observations[0].reviewed
    assert clone.get_state(project.id).past == []
    clone_faces = FileLipSyncFaces(clone, catalog)
    _, copied = clone_faces.get(project.id, identifier)
    assert copied.observations[0].reviewed and copied.bindings[0].speaker_profile_id == 'speaker'
    assert clone_faces.thumbnail(project.id, identifier, 'o').read_bytes() == b'thumbnail-fixture'
    assert clone_faces.thumbnail(project.id, identifier, 'o') != faces.thumbnail(project.id, identifier, 'o')
    copied.observations[0].face_id = 'corrected'
    copied.bindings = []
    clone_faces.save(project.id, copied)
    assert faces.get(project.id, identifier)[1].observations[0].face_id == 'face'
