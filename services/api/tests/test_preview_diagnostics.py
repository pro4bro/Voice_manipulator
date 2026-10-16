import json
import wave

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.voice_edit_routes import make_voice_edit_router
from test_voice_edits import setup_store


def test_preview_reports_current_cache_hit_and_timings_without_persisting_request_metrics(tmp_path, monkeypatch):
    _, project, oid, store = setup_store(tmp_path)
    def render(source, destination, operations):
        destination.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(destination), 'wb') as audio:
            audio.setparams((1, 2, 24000, 0, 'NONE', 'none'))
            audio.writeframes(b'\0\0' * 264000)
        return {'actualFrames': 264000, 'processingSeconds': 99, 'clippedSamples': 0}
    monkeypatch.setattr('app.adapters.voice_edit_preview.render_stretch', render)
    app = FastAPI(); app.include_router(make_voice_edit_router(store))
    body = {'revision': 0, 'scriptRevision': 1, 'operation': {'startFrame': 48000, 'endFrame': 96000, 'targetFrames': 72000}}
    with TestClient(app) as client:
        first = client.post(f'/api/projects/{project.id}/voice-outputs/{oid}/edit/preview', json=body)
        second = client.post(f'/api/projects/{project.id}/voice-outputs/{oid}/edit/preview', json=body)
    assert first.status_code == second.status_code == 200
    cold, cached = first.json()['previewDiagnostics'], second.json()['previewDiagnostics']
    assert cold['cacheHit'] is False and cached['cacheHit'] is True
    assert cached['renderMs'] == 0
    assert all(value >= 0 for key, value in cold.items() if key.endswith('Ms'))
    assert 'preview;dur=' in second.headers['server-timing']
    # The old render's99s cannot be presented as this cache request's latency.
    assert cached['totalPacketMs'] < 99000
    report_path = next((store.outputs.audio_path(project.id, oid).parent / 'previews').glob('*.json'))
    assert 'previewDiagnostics' not in json.loads(report_path.read_text(encoding='utf-8'))
    assert store.get(project.id, oid).revision == 0
