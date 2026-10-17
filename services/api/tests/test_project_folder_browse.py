from dataclasses import replace
from pathlib import Path
import subprocess
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import create_app
from app.settings import Settings
from app.adapters.file_project_repository import FileProjectRepository


def test_project_browse_error_cancel_retry_and_create(tmp_path):
    app = create_app(project_repository=FileProjectRepository(tmp_path/'registry'),
                     settings=replace(Settings.from_env(), data_root=tmp_path/'data'))
    selected = tmp_path/'thư mục dự án'
    selected.mkdir()
    results = [subprocess.TimeoutExpired('powershell.exe', 300),
               subprocess.CompletedProcess([], 0, '', ''),
               subprocess.CompletedProcess([], 0, str(selected), '')]
    with TestClient(app) as client, patch('app.adapters.native_folder_picker.subprocess.run', side_effect=results):
        failed = client.post('/api/system/pick-folder', json={'initialPath':str(tmp_path)})
        assert failed.status_code == 503
        assert 'hết thời gian' in failed.json()['detail']
        cancelled = client.post('/api/system/pick-folder', json={'initialPath':str(tmp_path)})
        assert cancelled.status_code == 200
        assert cancelled.json() == {'path':None}
        picked = client.post('/api/system/pick-folder', json={'initialPath':str(tmp_path)})
        assert picked.status_code == 200
        assert picked.json() == {'path':str(selected.resolve())}
        created = client.post('/api/projects', json={'name':'Kiểm tra Browse', 'location':picked.json()['path']})
        assert created.status_code == 201
        project = created.json()
        assert Path(project['projectPath']).parent == selected
        assert (Path(project['projectPath'])/'project.json').is_file()
        assert client.get('/api/projects/'+project['id']).status_code == 200
