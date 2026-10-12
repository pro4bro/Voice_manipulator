import asyncio
from dataclasses import replace
import hashlib
from pathlib import Path
import shutil
import subprocess
import wave

from fastapi.testclient import TestClient
import pytest

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry
from app.adapters.media_import_processor import MediaImportProcessor
from app.domain.models import ProjectCreate
from app.main import create_app
from app.settings import Settings


@pytest.fixture
def source(tmp_path):
    bundled = Path(__file__).resolve().parents[3] / ".tools/ffmpeg/ffmpeg.exe"
    ffmpeg = str(bundled) if bundled.is_file() else shutil.which("ffmpeg")
    if not ffmpeg:
        pytest.skip("FFmpeg unavailable")
    target = tmp_path / "two.mkv"
    subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "lavfi", "-i",
        "sine=frequency=440:duration=0.5", "-f", "lavfi", "-i",
        "sine=frequency=880:duration=0.5", "-map", "0:a", "-map", "1:a",
        "-c:a", "flac", str(target)], check=True, capture_output=True)
    return target, ffmpeg


def prepare(tmp_path, source, cache=True):
    path, ffmpeg = source
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Track addition"))
    library = FileMediaLibrary(projects)
    processor = MediaImportProcessor("http://unused", library, ffmpeg,
                                    LocalMediaSourceRegistry(tmp_path / "machine"))
    parent = asyncio.run(processor.process_local_path(project, str(path),
        cache_local=cache, stream_indexes=[0])).asset
    return projects, project, library, processor, parent


@pytest.mark.parametrize("cache", [False, True])
def test_concurrent_addition_publishes_one_child_and_survives_project_move(tmp_path, source, cache):
    projects, project, library, processor, parent = prepare(tmp_path, source, cache)
    before = hashlib.sha256(source[0].read_bytes()).hexdigest()

    async def add():
        return await asyncio.gather(*(processor.materialize_audio_track(project, parent.id, 1)
                                      for _ in range(4)))
    children = asyncio.run(add())
    assert len({child.id for child in children}) == 1
    child = children[0]
    with wave.open(str(Path(project.project_path) / child.analysis_path), "rb") as audio:
        assert (audio.getnchannels(), audio.getframerate(), audio.getsampwidth()) == (1, 24000, 2)
        assert audio.getnframes() / 24000 == pytest.approx(0.5, abs=0.025)
    assert hashlib.sha256(source[0].read_bytes()).hexdigest() == before
    moved = tmp_path / "moved" / Path(project.project_path).name
    moved.parent.mkdir()
    shutil.move(project.project_path, moved)
    projects.open(moved)
    reopened = FileMediaLibrary(projects)
    assert reopened.resolve_audio_path(project.id, child.id).is_file()
    assert len([item for item in reopened.list(project.id)
                if item.source_archive_asset_id == parent.id]) == 2
    assert all(item.imported for item in reopened.get(project.id, parent.id).available_audio_tracks)


def test_failed_decode_and_index_publish_leave_retryable_omitted_selection(tmp_path, source, monkeypatch):
    _, project, library, processor, parent = prepare(tmp_path, source)
    extract = processor._extract_audio_streams
    def fail(*_args):
        raise ValueError("decode failed")
    monkeypatch.setattr(processor, "_extract_audio_streams", fail)
    with pytest.raises(ValueError, match="decode failed"):
        asyncio.run(processor.materialize_audio_track(project, parent.id, 1))
    assert not library.get(project.id, parent.id).available_audio_tracks[1].imported
    monkeypatch.setattr(processor, "_extract_audio_streams", extract)
    write = library._store.write_index
    monkeypatch.setattr(library._store, "write_index", fail)
    with pytest.raises(ValueError):
        asyncio.run(processor.materialize_audio_track(project, parent.id, 1))
    assert not FileMediaLibrary(library.projects).get(project.id, parent.id).available_audio_tracks[1].imported
    monkeypatch.setattr(library._store, "write_index", write)
    added = asyncio.run(processor.materialize_audio_track(project, parent.id, 1))
    assert library.get(project.id, added.id).analysis_path


def test_rejects_missing_stream_recycled_parent_and_active_follow(tmp_path, source):
    _, project, library, processor, parent = prepare(tmp_path, source)
    with pytest.raises(ValueError, match="không thuộc"):
        asyncio.run(processor.materialize_audio_track(project, parent.id, 9))
    library.send_to_recycle_bin(project.id, parent.id)
    with pytest.raises(ValueError):
        asyncio.run(processor.materialize_audio_track(project, parent.id, 1))
    library.restore_from_recycle_bin(project.id, parent.id)
    library._update_asset(project.id, parent.id, {"growing_mkv_follow": True})
    with pytest.raises(ValueError, match="Finish"):
        asyncio.run(processor.materialize_audio_track(project, parent.id, 1))


def test_project_local_container_adds_track_through_api_idempotently(tmp_path, source):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Uploaded tracks"))
    library = FileMediaLibrary(projects)
    processor = MediaImportProcessor("http://unused", library, source[1])
    # A project-local source must work without a machine-local source registry.
    result = asyncio.run(processor.process_local_path(project, str(source[0]),
        cache_local=True, stream_indexes=[0]))
    library._update_asset(project.id, result.asset.id, {"has_external_source": False})
    settings = replace(Settings.from_env(), data_root=tmp_path / "data", ffmpeg_path=source[1])
    client = TestClient(create_app(project_repository=projects, settings=settings))
    url = f"/api/projects/{project.id}/media/{result.asset.id}/audio-tracks/1/import"
    added = client.post(url)
    assert added.status_code == 200, added.text
    assert client.post(url).json()["id"] == added.json()["id"]
    assert added.json()["sourceArchiveStreamIndex"] == 1
    assert added.json()["sourceArchiveAssetId"] == result.asset.id
    assert client.post(url.replace("/1/import", "/9/import")).status_code == 400


@pytest.mark.parametrize("cache_local", [False, True])
def test_native_import_reveals_original_and_only_cached_project_source(tmp_path, source, monkeypatch, cache_local):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Reveal sources"))
    settings = replace(Settings.from_env(), data_root=tmp_path / "data", ffmpeg_path=source[1])
    shown = []
    monkeypatch.setattr("app.main.reveal", lambda path: shown.append(path.resolve()))
    client = TestClient(create_app(project_repository=projects, settings=settings))
    imported = client.post(f"/api/projects/{project.id}/media/import-local", json={
        "sourcePath": str(source[0]), "cacheLocal": cache_local,
    })
    assert imported.status_code == 201, imported.text
    parent = imported.json()["asset"]
    project_source = Path(project.project_path) / parent["sourcePath"]
    assert not Path(parent["sourcePath"]).is_absolute()
    assert project_source.is_file() is cache_local
    reveal_url = f"/api/projects/{project.id}/media/{parent['id']}/reveal"
    assert client.post(reveal_url, params={"location": "original"}).status_code == 204
    assert shown[-1] == source[0].resolve()
    child_id = imported.json()["trackAssetIds"][0]
    assert client.post(f"/api/projects/{project.id}/media/{child_id}/reveal",
        params={"location": "original"}).status_code == 204
    assert shown[-1] == source[0].resolve()
    project_reveal = client.post(reveal_url, params={"location": "project"})
    assert project_reveal.status_code == (204 if cache_local else 404)
    if cache_local:
        assert shown[-1] == project_source.resolve()
        other_machine = TestClient(create_app(project_repository=projects,
            settings=replace(settings, data_root=tmp_path / "other-machine")))
        assert other_machine.post(reveal_url, params={"location": "original"}).status_code == 404
        assert other_machine.post(reveal_url, params={"location": "project"}).status_code == 204
        assert shown[-1] == project_source.resolve()
    else:
        assert "chưa được cache" in project_reveal.json()["detail"]
        enabled = client.patch(f"/api/projects/{project.id}/media/{parent['id']}/local-cache",
            json={"enabled": True})
        assert enabled.status_code == 200, enabled.text
        assert project_source.read_bytes() == source[0].read_bytes()
        assert client.post(reveal_url, params={"location": "project"}).status_code == 204
        assert shown[-1] == project_source.resolve()
