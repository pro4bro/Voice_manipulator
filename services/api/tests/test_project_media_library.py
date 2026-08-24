from __future__ import annotations

import json
import shutil
from pathlib import Path

from app.adapters.file_media_library import FileMediaLibrary
from app.domain.models import MediaAssetCreate, ProjectCreate
from app.adapters.file_project_repository import FileProjectRepository


def test_media_library_keeps_assets_and_script_revisions_per_project(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    first = projects.create(ProjectCreate(name="First", location=str(tmp_path / "work")))
    second = projects.create(ProjectCreate(name="Second", location=str(tmp_path / "work")))
    library = FileMediaLibrary(projects)

    asset = library.create(
        first.id,
        MediaAssetCreate(
            name="interview.mov",
            source_extension=".mov",
            media_kind="video",
            source_path="assets/media/interview.mov",
            studio_item_id="studio/interview.wav",
            url="/media/studio/interview.wav",
            duration=12.5,
            sample_rate=24000,
            text="Bản nhận diện đầu tiên",
            origin="import",
        ),
    )
    updated = library.update_script(first.id, asset.id, "Người dùng đã sửa", "user")

    assert [item.id for item in library.list(first.id)] == [asset.id]
    assert library.list(second.id) == []
    assert updated.text == "Người dùng đã sửa"
    assert [revision.source for revision in updated.revisions] == ["stt", "user"]
    activity = Path(first.project_path) / "activity" / "events.jsonl"
    assert "MEDIA_ADDED" in activity.read_text(encoding="utf-8")
    assert "SCRIPT_REVISED" in activity.read_text(encoding="utf-8")


def test_media_library_persists_training_selection_per_asset(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Training Selection"))
    library = FileMediaLibrary(projects)
    asset = library.create(
        project.id,
        MediaAssetCreate(
            name="voice.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path="assets/media/voice.wav",
            duration=2,
            origin="import",
            transcription_status="skipped",
        ),
    )

    selected = library.set_training_selected(project.id, asset.id, True)
    reopened = FileMediaLibrary(projects).get(project.id, asset.id)

    assert selected.training_selected is True
    assert reopened.training_selected is True
    assert reopened.transcription_status == "skipped"
    activity = Path(project.project_path) / "activity" / "events.jsonl"
    assert "TRAINING_SELECTION_CHANGED" in activity.read_text(encoding="utf-8")


def test_media_library_persists_speaker_and_emotion_annotations(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Annotated Media"))
    library = FileMediaLibrary(projects)
    asset = library.create(
        project.id,
        MediaAssetCreate(
            name="dialogue.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path="assets/media/dialogue.wav",
            duration=2,
            origin="import",
        ),
    )

    library.update_annotations(project.id, asset.id, ["speaker-a", "speaker-b"], "mix")
    reopened = FileMediaLibrary(projects).get(project.id, asset.id)

    assert reopened.speaker_profile_ids == ["speaker-a", "speaker-b"]
    assert reopened.emotion == "mix"
    activity = Path(project.project_path) / "activity" / "events.jsonl"
    assert "MEDIA_ANNOTATIONS_CHANGED" in activity.read_text(encoding="utf-8")


def test_media_paths_and_history_survive_moving_the_project_folder(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    created = projects.create(ProjectCreate(name="Portable Media", location=str(tmp_path / "before")))
    project_path = Path(created.project_path)
    asset_dir = project_path / "assets" / "media" / "asset-portable"
    asset_dir.mkdir(parents=True)
    source = asset_dir / "source.wav"
    analysis = asset_dir / "analysis.wav"
    source.write_bytes(b"source")
    analysis.write_bytes(b"analysis")
    library = FileMediaLibrary(projects)
    library.create(
        created.id,
        MediaAssetCreate(
            name="portable.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path="assets/media/asset-portable/source.wav",
            analysis_path="assets/media/asset-portable/analysis.wav",
            duration=1,
            text="Xin chào",
            origin="import",
        ),
        "asset-portable",
    )

    index_path = project_path / "assets" / "media" / "index.json"
    assert str(tmp_path) not in index_path.read_text(encoding="utf-8")

    moved_path = tmp_path / "after" / project_path.name
    moved_path.parent.mkdir(parents=True)
    shutil.move(str(project_path), str(moved_path))
    projects.open(moved_path)
    reopened = library.list(created.id)[0]

    assert reopened.source_path == "assets/media/asset-portable/source.wav"
    assert reopened.analysis_path == "assets/media/asset-portable/analysis.wav"
    assert library.resolve_audio_path(created.id, reopened.id) == moved_path / reopened.analysis_path


def test_media_library_migrates_legacy_absolute_asset_paths(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    created = projects.create(ProjectCreate(name="Legacy Paths"))
    project_path = Path(created.project_path)
    media_dir = project_path / "assets" / "media"
    asset_dir = media_dir / "asset-legacy"
    asset_dir.mkdir(parents=True)
    source = asset_dir / "source.wav"
    analysis = asset_dir / "analysis.wav"
    source.write_bytes(b"source")
    analysis.write_bytes(b"analysis")
    record = {
        "id": "asset-legacy",
        "name": "legacy.wav",
        "sourceExtension": ".wav",
        "mediaKind": "audio",
        "sourcePath": str(source),
        "analysisPath": str(analysis),
        "duration": 1,
        "text": "",
        "words": [],
        "origin": "import",
        "status": "ready",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
        "revisions": [],
    }
    (media_dir / "index.json").write_text(json.dumps([record]), encoding="utf-8")

    migrated = FileMediaLibrary(projects).list(created.id)[0]
    persisted = (media_dir / "index.json").read_text(encoding="utf-8")

    assert migrated.source_path == "assets/media/asset-legacy/source.wav"
    assert migrated.analysis_path == "assets/media/asset-legacy/analysis.wav"
    assert str(tmp_path) not in persisted


def test_media_library_removes_only_the_selected_asset_folder_and_annotations(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Remove Media"))
    asset_dir = Path(project.project_path) / "assets" / "media" / "asset-remove"
    asset_dir.mkdir(parents=True)
    (asset_dir / "source.wav").write_bytes(b"source")
    library = FileMediaLibrary(projects)
    asset = library.create(
        project.id,
        MediaAssetCreate(
            name="remove.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path="assets/media/asset-remove/source.wav",
            duration=1,
            origin="import",
        ),
        "asset-remove",
    )

    updated = library.update_annotations(
        project.id, asset.id, ["speaker-a"], ["environment-room"], "normal"
    )
    library.remove(project.id, asset.id)

    assert updated.environment_profile_ids == ["environment-room"]
    assert not asset_dir.exists()
    assert library.list(project.id) == []
    activity = Path(project.project_path) / "activity" / "events.jsonl"
    assert "MEDIA_REMOVED" in activity.read_text(encoding="utf-8")
