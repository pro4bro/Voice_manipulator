import json
from pathlib import Path
import wave

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.voice_edit_routes import make_voice_edit_router
from app.adapters.file_project_repository import FileProjectRepository
import app.adapters.file_project_repository as file_project_repository
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
    for key in ('artifactHashMs', 'artifactReportWriteMs', 'finalVerificationMs',
                'atomicCreateMs', 'atomicWriteFlushMs', 'atomicFsyncMs', 'atomicReplaceMs',
                'atomicCloseMs', 'atomicRetryWaitMs'):
        assert cold[key] >= 0 and cached[key] == 0
    assert cold['atomicRetryCount'] == cached['atomicRetryCount'] == 0
    assert all(value >= 0 for key, value in cold.items() if key.endswith('Ms'))
    assert 'preview;dur=' in second.headers['server-timing']
    # The old render's99s cannot be presented as this cache request's latency.
    assert cached['totalPacketMs'] < 99000
    report_path = next((store.outputs.audio_path(project.id, oid).parent / 'previews').glob('*.json'))
    persisted = json.loads(report_path.read_text(encoding='utf-8'))
    assert 'previewDiagnostics' not in persisted
    assert not any(key.endswith('Ms') or key.startswith('atomic') or key == 'retryCount'
        for key in persisted)
    assert store.get(project.id, oid).revision == 0


def test_atomic_write_optional_diagnostics_preserves_retry_and_cleanup_contract(tmp_path, monkeypatch):
    destination = tmp_path / 'receipt.json'
    destination.write_text('{"old": true}', encoding='utf-8')
    original_replace = Path.replace
    attempts = []
    waits = []

    def retry_once(source, target):
        attempts.append(source)
        if len(attempts) == 1:
            error = PermissionError('reader lock')
            error.winerror = 32
            raise error
        return original_replace(source, target)

    monkeypatch.setattr(Path, 'replace', retry_once)
    monkeypatch.setattr(file_project_repository.os, 'name', 'nt')
    monkeypatch.setattr(file_project_repository.time, 'sleep', waits.append)
    diagnostics = {}
    FileProjectRepository._atomic_write(destination, '{"new": true}', diagnostics=diagnostics)

    assert json.loads(destination.read_text(encoding='utf-8')) == {'new': True}
    assert len(attempts) == 2 and waits == [.01]
    assert diagnostics['retryCount'] == 1 and diagnostics['retryWaitMs'] >= 0
    assert all(diagnostics[key] >= 0 for key in ('createMs', 'writeFlushMs', 'fsyncMs', 'closeMs', 'replaceMs'))
    assert list(tmp_path.iterdir()) == [destination]


def test_atomic_write_reports_context_close_time(tmp_path, monkeypatch):
    original_fdopen = file_project_repository.os.fdopen

    class DelayedClose:
        def __init__(self, wrapped):
            self.wrapped = wrapped

        def __enter__(self):
            self.wrapped.__enter__()
            return self.wrapped

        def __exit__(self, exc_type, exc, traceback):
            result = self.wrapped.__exit__(exc_type, exc, traceback)
            file_project_repository.time.sleep(.02)
            return result

    monkeypatch.setattr(file_project_repository.os, 'fdopen',
        lambda *args, **kwargs: DelayedClose(original_fdopen(*args, **kwargs)))
    diagnostics = {}
    FileProjectRepository._atomic_write(tmp_path / 'closed.json', '{"ok": true}', diagnostics=diagnostics)
    assert diagnostics['closeMs'] >= 15
