import shutil
import pytest
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.domain.models import ProjectCreate
from app.domain.voice_script_document import VoiceScriptDocument


def test_script_intent_survives_reopen_move_and_rejects_stale_save(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Script", location=str(tmp_path / "projects")))
    store = FileVoiceScript(projects)
    document = VoiceScriptDocument.model_validate({"segments": [{"id": "seg-1", "settings": {"emotion": "happy"}}],
        "rows": [{"id": "sentence-1", "segmentId": "seg-1", "text": "你好。", "originIds": ["old"], "tags": ["review"], "settings": {"duration": 2}}]})
    saved = store.save(project.id, document)
    assert saved.revision == 1
    with pytest.raises(ScriptRevisionConflict):
        store.save(project.id, document)
    moved = tmp_path / "moved"
    shutil.move(project.project_path, moved)
    projects.open(moved)
    assert FileVoiceScript(projects).get(project.id) == saved


def test_script_rejects_dangling_or_duplicate_sentence_identity():
    with pytest.raises(ValueError):
        VoiceScriptDocument.model_validate({"rows": [{"id": "r", "segmentId": "missing"}]})
