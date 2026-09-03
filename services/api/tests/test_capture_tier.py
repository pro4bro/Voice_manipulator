from __future__ import annotations

import json
from pathlib import Path

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.domain.models import MediaAssetCreate, ProjectCreate, ProjectMediaAsset


def asset_payload(**overrides) -> MediaAssetCreate:
    base = {
        "name": "take.wav",
        "source_extension": ".wav",
        "media_kind": "audio",
        "source_path": "assets/media/asset-1/source.wav",
        "origin": "import",
    }
    return MediaAssetCreate(**{**base, **overrides})


def test_an_imported_asset_defaults_to_the_import_tier():
    assert asset_payload().capture_tier == "import"


def test_a_recorded_asset_derives_the_record_tier_from_its_origin():
    assert asset_payload(origin="record").capture_tier == "record"


def test_an_explicit_guided_tier_survives_a_record_origin():
    """A guided take is recorded, so origin alone cannot identify it."""
    payload = asset_payload(origin="record", capture_tier="guided")

    assert payload.capture_tier == "guided"


def test_an_index_written_before_the_field_existed_still_loads(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Legacy Index"))
    media = FileMediaLibrary(projects)
    media.create(project.id, asset_payload(origin="record"), "asset-legacy")

    index_path = Path(project.project_path) / "assets" / "media" / "index.json"
    raw = json.loads(index_path.read_text(encoding="utf-8"))
    entries = raw["assets"] if isinstance(raw, dict) else raw
    for entry in entries:
        entry.pop("captureTier", None)
        entry.pop("capture_tier", None)
    index_path.write_text(json.dumps(raw), encoding="utf-8")

    # A fresh library avoids the in-memory cache and forces a real re-read.
    reloaded = FileMediaLibrary(projects).get(project.id, "asset-legacy")

    assert reloaded.capture_tier == "record"


def test_the_tier_round_trips_through_the_project_index(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Guided Session"))
    media = FileMediaLibrary(projects)
    media.create(
        project.id, asset_payload(origin="record", capture_tier="guided"), "asset-guided"
    )

    reloaded: ProjectMediaAsset = FileMediaLibrary(projects).get(project.id, "asset-guided")

    assert reloaded.capture_tier == "guided"


def import_processor(tmp_path, monkeypatch):
    from app.adapters.media_import_processor import MediaImportProcessor

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Guided Import"))
    processor = MediaImportProcessor("http://studio", FileMediaLibrary(projects), "ffmpeg")
    processor.ffprobe_path = "ffprobe"
    monkeypatch.setattr(
        processor,
        "_probe",
        lambda _path: {
            "streams": [{"codec_type": "audio", "codec_name": "pcm_s16le", "sample_rate": "48000"}],
            "format": {"duration": "6.2"},
        },
    )
    monkeypatch.setattr(processor, "_extract_audio", lambda _source, destination: destination.write_bytes(b"wav"))
    return project, processor


def test_a_guided_take_is_imported_as_guided_even_though_it_was_recorded(tmp_path, monkeypatch):
    import asyncio
    from io import BytesIO

    from fastapi import UploadFile

    project, processor = import_processor(tmp_path, monkeypatch)
    upload = UploadFile(filename="vi-angry-01-c01.webm", file=BytesIO(b"audio"))

    result = asyncio.run(
        processor.process(project, upload, "record", transcribe=False, capture_tier="guided")
    )

    assert result.asset.capture_tier == "guided"
    assert result.asset.origin == "record"


def test_an_import_with_no_tier_falls_back_to_its_origin(tmp_path, monkeypatch):
    import asyncio
    from io import BytesIO

    from fastapi import UploadFile

    project, processor = import_processor(tmp_path, monkeypatch)
    upload = UploadFile(filename="footage.wav", file=BytesIO(b"audio"))

    result = asyncio.run(processor.process(project, upload, "record", transcribe=False))

    assert result.asset.capture_tier == "record"


def test_an_unknown_tier_is_refused_before_any_file_is_written(tmp_path, monkeypatch):
    import asyncio
    from io import BytesIO

    import pytest
    from fastapi import UploadFile

    project, processor = import_processor(tmp_path, monkeypatch)
    upload = UploadFile(filename="footage.wav", file=BytesIO(b"audio"))

    with pytest.raises(ValueError, match="Capture tier"):
        asyncio.run(processor.process(project, upload, "record", capture_tier="studio"))

    assert not list((Path(project.project_path) / "assets" / "media").glob("asset-*"))
