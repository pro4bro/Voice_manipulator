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
