import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.voice_patch_reviews import VoicePatchReviews, VoicePatchReviewRequest
from app.adapters.voice_patch_comparison_report import make_voice_patch_comparison_report_router
from test_voice_patch_audition import applied_raw


def setup_report(tmp_path):
    project, outputs, source, variant, history, media, audition = applied_raw(tmp_path)
    reviews = VoicePatchReviews(history)
    app = FastAPI()
    app.include_router(make_voice_patch_comparison_report_router(history, reviews))
    return project, outputs, variant, reviews, app


def test_comparison_report_exports_unreviewed_without_writing_assessments(tmp_path):
    project, outputs, variant, reviews, app = setup_report(tmp_path)
    before = outputs.audio_path(project.id, variant.id).read_bytes()
    with TestClient(app) as client:
        response = client.get(f'/api/projects/{project.id}/voice-patch/history/{variant.id}/comparison-report')
    assert response.status_code == 200
    assert 'attachment;' in response.headers['content-disposition']
    packet = response.json()
    assert packet['version'] == 1 and packet['checkpointAcceptance'] == 'not-inferred'
    assert len(packet['variants']) == 1
    entry = packet['variants'][0]
    assert entry['outputId'] == variant.id and entry['assessment']['status'] == 'unreviewed'
    assert set(entry['assessment']['ratings'].values()) == {'unassessed'}
    assert entry['audioSha256'] and entry['metadataSha256'] and packet['snapshotKey']
    assert str(tmp_path) not in response.text
    assert not reviews._path(project.id).exists()
    assert outputs.audio_path(project.id, variant.id).read_bytes() == before


def test_report_preserves_user_ratings_notes_and_rejects_corrupt_review_store(tmp_path):
    project, outputs, variant, reviews, app = setup_report(tmp_path)
    plan = reviews.get(project.id, variant.id)
    reviews.save(project.id, variant.id, VoicePatchReviewRequest(expectedRevision=plan['revision'],
        expectedKey=plan['expectedKey'], listened=True, ratings={'identity': 'needs-work'}, notes='Biên nối hơi gắt.'))
    with TestClient(app) as client:
        url = f'/api/projects/{project.id}/voice-patch/history/{variant.id}/comparison-report'
        packet = client.get(url).json()
        entry = packet['variants'][0]
        assert entry['assessment']['status'] == 'current'
        assert entry['assessment']['notes'] == 'Biên nối hơi gắt.'
        assert entry['assessment']['ratings']['identity'] == 'needs-work'
        assert packet['checkpointAcceptance'] == 'not-inferred'
        path = reviews._path(project.id)
        path.write_text('{broken', encoding='utf-8')
        assert client.get(url).status_code == 409
        assert path.read_text(encoding='utf-8') == '{broken'
        assert client.get(url.replace(variant.id, 'output-missing')).status_code == 404


def test_report_snapshot_changes_when_user_assessment_changes(tmp_path):
    project, _outputs, variant, reviews, app = setup_report(tmp_path)
    with TestClient(app) as client:
        url = f'/api/projects/{project.id}/voice-patch/history/{variant.id}/comparison-report'
        first = client.get(url).json()
        plan = reviews.get(project.id, variant.id)
        reviews.save(project.id, variant.id, VoicePatchReviewRequest(expectedRevision=plan['revision'],
            expectedKey=plan['expectedKey'], listened=True, notes='Đã nghe fixture tổng hợp.'))
        second = client.get(url).json()
        assert first['snapshotKey'] != second['snapshotKey']
        assert first['comparisonKey'] == second['comparisonKey']
