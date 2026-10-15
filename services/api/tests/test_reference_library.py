import shutil
import pytest
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_media_library import FileMediaLibrary
from app.domain.models import MediaAssetCreate, MediaAudioTrackChoice, ProjectCreate


def test_reference_role_is_atomic_independent_and_portable(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="References", location=str(tmp_path / "projects")))
    store = FileMediaLibrary(projects)
    assets = [store.create(project.id, MediaAssetCreate(name=f"take-{i}.wav", source_extension=".wav", media_kind="audio",
        source_path=f"assets/take-{i}.wav", origin="import", training_selected=True, transcription_selected=False,
        text="Xin chào", words=[{"text": "Xin", "start": 0, "end": 1}])) for i in range(2)]
    with pytest.raises(KeyError):
        store.set_reference_selected_many(project.id, [assets[0].id, "missing"], True)
    assert not store.get(project.id, assets[0].id).reference_selected
    store.set_reference_selected_many(project.id, [asset.id for asset in assets], True)
    moved = tmp_path / "moved"
    shutil.move(project.project_path, moved)
    projects.open(moved)
    reopened = FileMediaLibrary(projects)
    for asset in assets:
        current = reopened.get(project.id, asset.id)
        assert current.reference_selected and current.training_selected and not current.transcription_selected
        assert current.words == asset.words and current.source_path == asset.source_path
    reopened.set_reference_selected_many(project.id, [assets[0].id], False)
    assert not reopened.get(project.id, assets[0].id).reference_selected
    assert reopened.get(project.id, assets[1].id).reference_selected


def test_mixed_container_requires_a_track_not_an_implicit_mix(tmp_path):
    projects = FileProjectRepository(tmp_path)
    project = projects.create(ProjectCreate(name="Tracks"))
    store = FileMediaLibrary(projects)
    parent = store.create(project.id, MediaAssetCreate(name="scene.mkv", source_extension=".mkv", media_kind="video",
        source_path="assets/scene.mkv", origin="import", available_audio_tracks=[MediaAudioTrackChoice(stream_index=0, title="Mic", imported=True)]))
    with pytest.raises(ValueError, match="audio track"):
        store.set_reference_selected_many(project.id, [parent.id], True)
