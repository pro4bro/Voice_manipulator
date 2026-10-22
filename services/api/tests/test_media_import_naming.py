import asyncio
import hashlib
from pathlib import Path
import shutil
import wave
from io import BytesIO
from dataclasses import replace

from fastapi import UploadFile
from fastapi.testclient import TestClient
import pytest

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry
from app.adapters.media_import_processor import MediaImportProcessor
from app.domain.models import ProjectCreate
from app.main import create_app
from app.settings import Settings
from app.adapters.media_asset_paths import create_media_asset_directory, media_asset_directory, media_asset_file, safe_media_stem


def test_new_native_imports_keep_readable_unique_names_and_portable_words(tmp_path):
    source = tmp_path / "Phỏng vấn, buổi 1.wav"
    with wave.open(str(source), "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(b"\x00\x01" * 2400)
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Named imports"))
    library = FileMediaLibrary(projects)
    importer = MediaImportProcessor("http://unused", library, shutil.which("ffmpeg"),
                                    LocalMediaSourceRegistry(tmp_path / "machine"))
    first = asyncio.run(importer.process_local_path(project, str(source), cache_local=True)).asset
    second = asyncio.run(importer.process_local_path(project, str(source), cache_local=False)).asset
    root = Path(project.project_path)
    for asset in (first, second):
        cached = root / asset.source_path
        assert cached.parent.name.startswith(source.stem + "--asset-")
        assert cached.name == source.stem + "--source.wav"
        assert Path(asset.analysis_path).name == source.stem + "--analysis.wav"
    assert first.source_path != second.source_path
    assert (root / first.source_path).read_bytes() == source.read_bytes()
    assert not (root / second.source_path).exists()
    asyncio.run(importer.set_local_file_cache(project, second, True))
    assert (root / second.source_path).read_bytes() == source.read_bytes()
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    # Word sidecars must follow the named folder without creating an ID folder.
    assert not (root / "assets" / "media" / first.id).exists()
    assert (root / first.source_path).parent.joinpath("words.json").is_file()
    library.update_script(project.id, first.id, "Xin", "user", [{"text": "Xin", "start": 0, "end": .1}])
    client = TestClient(create_app(project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "api-data")))
    waveform = client.get(f"/api/projects/{project.id}/media/{first.id}/waveform")
    assert waveform.status_code == 200, waveform.text
    assert (root / "cache" / "waveforms" / f"{source.stem}--{first.id}.json").is_file()
    moved = tmp_path / "moved" / "Project tiếng Việt"
    moved.parent.mkdir()
    shutil.move(root, moved)
    projects.open(moved)
    reopened = FileMediaLibrary(projects)
    assert reopened.resolve_audio_path(project.id, first.id).is_file()
    assert reopened.get(project.id, first.id).source_path == first.source_path
    assert reopened.get(project.id, first.id).words[0]["text"] == "Xin"


@pytest.mark.parametrize("filename, expected", [
    ("C:\\private\\Take 01.MKV", "Take 01"), ("../../voice.mp3", "voice"),
    ("CON.wav", "_CON"), ("nul.test.mkv", "_nul.test"),
    ('clip<>:"|?*.mp3', "clip_______"), (".wav", "wav"),
    ("...", "footage"), ("A" * 100 + ".mkv", "A" * 64),
])
def test_import_labels_are_portable_components(filename, expected):
    assert safe_media_stem(filename) == expected


def test_directory_lookup_preserves_legacy_and_rejects_traversal(tmp_path):
    legacy = tmp_path / "assets/media/asset-old"
    legacy.mkdir(parents=True)
    old = legacy / "source.wav"
    old.write_bytes(b"unchanged")
    named = create_media_asset_directory(tmp_path, "asset-new", "Meeting.wav")
    assert media_asset_directory(tmp_path, "asset-old") == legacy
    assert media_asset_file(legacy, "source.wav") == old
    assert old.read_bytes() == b"unchanged"
    assert media_asset_directory(tmp_path, "asset-new") == named
    assert media_asset_file(named, "source.wav").name == "Meeting--source.wav"
    with pytest.raises(ValueError):
        media_asset_directory(tmp_path, "../outside")


def test_browser_upload_names_source_and_analysis_after_footage(tmp_path):
    payload = BytesIO()
    with wave.open(payload, "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(b"\0\0" * 2400)
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Browser naming"))
    importer = MediaImportProcessor("http://unused", FileMediaLibrary(projects), shutil.which("ffmpeg"))
    upload = UploadFile(BytesIO(payload.getvalue()), filename="Interview take 2.wav")
    asset = asyncio.run(importer.process(project, upload, "import", transcribe=False)).asset
    assert Path(asset.source_path).name == "Interview take 2--source.wav"
    assert Path(asset.analysis_path).name == "Interview take 2--analysis.wav"
