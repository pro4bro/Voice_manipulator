from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.domain.media_organization import (
    MediaPoolAssetPlacement,
    MediaPoolFolder,
    MediaPoolOrganization,
)
from app.domain.models import MediaAssetCreate, ProjectCreate
from app.main import create_app
from app.settings import Settings
from fastapi.testclient import TestClient


def test_media_pool_folder_order_is_portable_and_does_not_move_source_assets(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Organized Media"))
    library = FileMediaLibrary(projects)
    first = library.create(project.id, MediaAssetCreate(
        name="first.wav", source_extension=".wav", media_kind="audio",
        source_path="assets/media/first/source.wav", origin="import",
    ))
    second = library.create(project.id, MediaAssetCreate(
        name="second.wav", source_extension=".wav", media_kind="audio",
        source_path="assets/media/second/source.wav", origin="import",
    ))
    root = library.organization(project.id)
    nested = MediaPoolOrganization(
        folders=[
            MediaPoolFolder(id="audio", name="Audio", order=0),
            MediaPoolFolder(id="voices", name="Voices", parent_folder_id="audio", order=0),
        ],
        assets=[
            MediaPoolAssetPlacement(asset_id=first.id, folder_id="voices", order=0),
            MediaPoolAssetPlacement(asset_id=second.id, folder_id=None, order=0),
        ],
    )

    saved = library.update_organization(project.id, nested)
    reopened = FileMediaLibrary(projects).organization(project.id)
    organization_path = Path(project.project_path) / "assets" / "media" / "organization.json"
    assert reopened == saved
    assert json.loads(organization_path.read_text(encoding="utf-8"))["schemaVersion"] == 1
    assert library.get(project.id, first.id).source_path == "assets/media/first/source.wav"
    assert library.get(project.id, second.id).source_path == "assets/media/second/source.wav"
    assert root.schema_version == 1


def test_media_pool_organization_api_reads_and_writes_the_project_contract(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Media organization API"))
    library = FileMediaLibrary(projects)
    asset = library.create(project.id, MediaAssetCreate(
        name="clip.wav", source_extension=".wav", media_kind="audio",
        source_path="assets/media/clip/source.wav", origin="import",
    ))
    client = TestClient(create_app(
        project_repository=projects,
        settings=replace(Settings.from_env(), data_root=tmp_path / "data"),
    ))
    url = f"/api/projects/{project.id}/media/organization"
    initial = client.get(url)
    assert initial.status_code == 200
    assert initial.json()["assets"] == [{"assetId": asset.id, "folderId": None, "order": 0}]

    updated = client.patch(url, json={
        "schemaVersion": 1,
        "folders": [{"id": "folder", "name": "Audio", "parentFolderId": None, "order": 0}],
        "assets": [{"assetId": asset.id, "folderId": "folder", "order": 0}],
    })
    assert updated.status_code == 200
    assert client.get(url).json()["assets"][0]["folderId"] == "folder"
    invalid = client.patch(url, json={
        "schemaVersion": 1,
        "folders": [],
        "assets": [{"assetId": "missing", "folderId": None, "order": 0}],
    })
    assert invalid.status_code == 400


@pytest.mark.parametrize("organization, message", [
    (MediaPoolOrganization(
        folders=[
            MediaPoolFolder(id="a", name="A", parent_folder_id="b"),
            MediaPoolFolder(id="b", name="B", parent_folder_id="a"),
        ],
    ), "cycles"),
    (MediaPoolOrganization(
        folders=[MediaPoolFolder(id="a", name="A")],
        assets=[MediaPoolAssetPlacement(asset_id="unknown", folder_id="a")],
    ), "unknown asset"),
    (MediaPoolOrganization(
        folders=[MediaPoolFolder(id="a", name="A"), MediaPoolFolder(id="a", name="Again")],
    ), "unique"),
])
def test_media_pool_rejects_invalid_folder_graphs_and_asset_references(tmp_path, organization, message):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Invalid Organization"))
    library = FileMediaLibrary(projects)
    library.create(project.id, MediaAssetCreate(
        name="known.wav", source_extension=".wav", media_kind="audio",
        source_path="assets/media/known/source.wav", origin="import",
    ))
    with pytest.raises(ValueError, match=message):
        library.update_organization(project.id, organization)
