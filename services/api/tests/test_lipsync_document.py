import shutil
from pathlib import Path
import pytest
from app.adapters.file_lipsync import FileLipSync
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.training_model_catalog import FileTrainingModelCatalog
from app.domain.models import MediaAssetCreate, ProjectCreate
from app.domain.lipsync import LipSyncDocument


def setup(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="LipSync", location=str(tmp_path / "projects")))
    media = FileMediaLibrary(projects)
    path = Path(project.project_path) / "assets/fixture.mp4"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"fixture-not-a-decodable-video")
    asset = media.create(project.id, MediaAssetCreate(name="fixture.mp4", media_kind="video", source_extension=".mp4", source_path=str(path), duration=10, origin="import"))
    catalog = FileTrainingModelCatalog(Path(__file__).resolve().parents[1] / "app/resources/provider-catalog", {})
    store = FileLipSync(projects, media, FileVoiceOutputs(projects), catalog)
    doc = LipSyncDocument.model_validate({"layers": [{"id": "layer", "name": "Video 1"}], "clips": [{"id": "clip", "layerId": "layer", "assetId": asset.id, "start": 1, "inPoint": 2, "outPoint": 8}], "engineId": "latentsync-lipsync", "engineSettings": {"latentsync-lipsync": {"seed": 42}}})
    return projects, project, media, asset, store, doc


def test_portable_document_roundtrip_conflict_and_moved_project(tmp_path):
    projects, project, _, _, store, doc = setup(tmp_path)
    saved = store.save(project.id, doc)
    assert saved.revision == 1 and saved.engine_settings["latentsync-lipsync"]["seed"] == 42
    with pytest.raises(ScriptRevisionConflict): store.save(project.id, doc)
    moved = tmp_path / "moved"
    shutil.move(project.project_path, moved)
    projects.open(moved)
    assert store.get(project.id) == saved
    assert str(tmp_path) not in (moved / "scripts/lipsync-composition.json").read_text(encoding="utf-8")
    store.validate_sources(project.id, saved)


def test_invalid_source_or_foreign_engine_settings_do_not_write(tmp_path):
    _, project, _, _, store, doc = setup(tmp_path)
    doc.clips[0].out_point = 11
    with pytest.raises(ValueError): store.save(project.id, doc)
    assert store.get(project.id).revision == 0
    doc.clips[0].out_point = 8
    doc.engine_settings["latentsync-lipsync"]["bbox_shift"] = 4
    with pytest.raises(ValueError): store.save(project.id, doc)
    assert store.get(project.id).revision == 0
    del doc.engine_settings["latentsync-lipsync"]["bbox_shift"]
    store.media.resolve_video_path(project.id, doc.clips[0].asset_id).write_bytes(b"")
    with pytest.raises(ValueError, match="Thiếu video"):
        store.save(project.id, doc)
    assert store.get(project.id).revision == 0
