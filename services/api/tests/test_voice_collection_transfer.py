from __future__ import annotations

from io import BytesIO
import json
import re
import stat
import zipfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.file_voice_collections import FileVoiceCollections
from app.adapters.file_voice_model_sets import FileVoiceModelSets
from app.adapters.voice_collection_transfer_routes import make_voice_collection_transfer_router
from app.domain.models import (
    ProjectCreate,
    SpeakerSimilarityGateEvidence,
    TrainingCheckpoint,
    TrainingRun,
    TrainingRunConfig,
    VoiceCollectionCreate,
    VoiceCollectionProperties,
    VoiceModelSet,
    VoiceModelSetLineage,
    VoiceModelSetMember,
)
from test_voice_collections import copy_slice, fixture


def _client(store: FileVoiceCollections) -> TestClient:
    app = FastAPI()
    app.include_router(make_voice_collection_transfer_router(store))
    return TestClient(app)


def _write_archive(parts: dict[str, bytes], *, symlink: str | None = None) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, content in parts.items():
            archive.writestr(name, content)
        if symlink:
            link = zipfile.ZipInfo(symlink)
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(link, "outside")
    return buffer.getvalue()


def _change_lineage_and_rehash(package: bytes, mutate) -> bytes:
    with zipfile.ZipFile(BytesIO(package)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    manifest = json.loads(parts["manifest.json"])
    lineage = json.loads(parts["lineage.json"])
    mutate(lineage)
    parts["lineage.json"] = json.dumps(lineage, ensure_ascii=False, sort_keys=True).encode("utf-8")
    record = next(item for item in manifest["inventory"] if item["path"] == "lineage.json")
    import hashlib

    record["sizeBytes"] = len(parts["lineage.json"])
    record["sha256"] = hashlib.sha256(parts["lineage.json"]).hexdigest()
    parts["manifest.json"] = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return _write_archive(parts)


def _publish_synthetic_gate(source_root: Path, source_id: str, speaker, voice, model_sets) -> None:
    gated_voice = voice.model_copy(update={"model_set_id": "set-passed"})
    (source_root / "assets/voices" / gated_voice.id / "voice.json").write_text(
        gated_voice.model_dump_json(by_alias=True), encoding="utf-8",
    )
    model_sets._write(source_id, VoiceModelSet(
        id="set-passed", name="Passed identity gate", speaker_profile_id=speaker.id,
        generation_family="omnivoice:test", anchor_voice_id=gated_voice.id, anchor_segment_id="segment-source",
        members=[VoiceModelSetMember(voice_id=gated_voice.id)],
        lineage=VoiceModelSetLineage(
            manifest_id="manifest", manifest_hash="hash", engine="omnivoice", engine_revision="revision",
            base_model="base", config=TrainingRunConfig(), segment_count=1, source_run_ids=["run-1"],
        ),
        status="published",
        gate=SpeakerSimilarityGateEvidence(
            embedder_id="synthetic-test-embedder", threshold=0.5, calibrated=True,
            scores_by_voice_id={gated_voice.id: 0.8}, candidate_output_ids_by_voice_id={gated_voice.id: "output-source"},
            score_passed=True, passed=True, decision_reason="passed",
        ),
    ))


def _artifact_shape_and_bytes(path: Path) -> tuple[tuple[str, ...], dict[str, bytes]]:
    if path.is_file():
        return (), {".": path.read_bytes()}
    directories = tuple(sorted(item.relative_to(path).as_posix() for item in path.rglob("*") if item.is_dir()))
    files = {
        item.relative_to(path).as_posix(): item.read_bytes()
        for item in path.rglob("*") if item.is_file()
    }
    return directories, files


@pytest.mark.parametrize("kind", ["full", "vc"])
def test_full_and_rvc_packages_preserve_artifact_shape_and_bytes_across_clean_project_transfer(
    tmp_path: Path, kind: str,
):
    projects, source, _, source_root, speaker, template_voice, catalogs, voices, model_sets, runs, source_store = fixture(tmp_path)
    run_id = f"run-transfer-{kind}"
    run_root = source_root / "jobs/training" / run_id
    if kind == "full":
        model_path = f"jobs/training/{run_id}/output/full-checkpoint"
        model_dir = source_root / model_path
        (model_dir / "shards").mkdir(parents=True)
        (model_dir / "config.json").write_bytes(b'{"architecture":"synthetic-full"}')
        (model_dir / "shards/model-00001.safetensors").write_bytes(b"full checkpoint shard one")
        (model_dir / "shards/model-00002.safetensors").write_bytes(b"full checkpoint shard two")
        adapter_path = None
        engine = "omnivoice"
        voice_kind = "full"
        checkpoint_path = model_path
    else:
        output = run_root / "output"
        output.mkdir(parents=True)
        model_path = f"jobs/training/{run_id}/output/voice.pth"
        adapter_path = f"jobs/training/{run_id}/output/voice.index"
        (source_root / model_path).write_bytes(b"RVC weight checkpoint bytes")
        (source_root / adapter_path).write_bytes(b"RVC retrieval index bytes")
        engine = "rvc"
        voice_kind = "vc"
        checkpoint_path = model_path

    voice_id = f"voice-transfer-{kind}"
    transfer_voice = template_voice.model_copy(update={
        "id": voice_id,
        "name": f"Transfer {kind}",
        "engine": engine,
        "kind": voice_kind,
        "model_path": model_path,
        "adapter_path": adapter_path,
        "source_run_id": run_id,
    })
    voice_folder = source_root / "assets/voices" / voice_id
    voice_folder.mkdir(parents=True)
    (voice_folder / "voice.json").write_text(transfer_voice.model_dump_json(by_alias=True), encoding="utf-8")
    checkpoint_file_or_tree = source_root / checkpoint_path
    checkpoint_bytes = (
        sum(item.stat().st_size for item in checkpoint_file_or_tree.rglob("*") if item.is_file())
        if checkpoint_file_or_tree.is_dir() else checkpoint_file_or_tree.stat().st_size
    )
    runs._write(source.id, TrainingRun(
        id=run_id,
        project_id=source.id,
        manifest_id=f"manifest-{kind}",
        speaker_profile_id=speaker.id,
        status="complete",
        checkpoints=[TrainingCheckpoint(step=100, path=checkpoint_path, bytes=checkpoint_bytes)],
    ))

    source_collection = source_store.create(VoiceCollectionCreate(name=f"{kind} source"))
    source_entry = source_store.add_entry(source_collection.id, source.id, voice_id)
    with _client(source_store) as client:
        exported = client.get(f"/api/voice-collections/{source_collection.id}/entries/{source_entry.id}/export")
    assert exported.status_code == 200, exported.text

    clean_projects = FileProjectRepository(tmp_path / "clean-registry")
    clean_target = clean_projects.create(ProjectCreate(name="Clean target", location=str(tmp_path / "clean-projects")))
    clean_catalogs = FileTrainingCatalog(clean_projects)
    clean_voices = FileProjectVoices(clean_projects, copy_slice)
    clean_model_sets = FileVoiceModelSets(clean_projects)
    clean_runs = FileTrainingRuns(clean_projects)
    clean_store = FileVoiceCollections(
        tmp_path / "clean-collection-data", clean_projects, clean_voices, clean_catalogs, clean_model_sets, clean_runs,
    )
    destination_collection = clean_store.create(VoiceCollectionCreate(name=f"{kind} destination"))
    with _client(clean_store) as client:
        package_import = client.post(
            f"/api/voice-collections/{destination_collection.id}/entries/import-package",
            files={"file": (f"{kind}.zip", exported.content, "application/zip")},
        )
    assert package_import.status_code == 200, package_import.text
    imported_entry = package_import.json()
    assert imported_entry["voice"]["kind"] == voice_kind
    assert imported_entry["voice"]["engine"] == engine
    assert imported_entry["voice"]["modelPath"] == model_path
    assert imported_entry["voice"]["adapterPath"] == adapter_path

    project_import = clean_store.import_entry(destination_collection.id, imported_entry["id"], clean_target.id)
    imported_voice = project_import.voice
    clean_target_root = Path(clean_target.project_path)
    assert imported_voice.kind == voice_kind
    assert imported_voice.engine == engine
    assert imported_voice.model_path
    assert _artifact_shape_and_bytes(source_root / model_path) == _artifact_shape_and_bytes(
        clean_target_root / imported_voice.model_path,
    )
    assert _artifact_shape_and_bytes(source_root / template_voice.reference_audio) == _artifact_shape_and_bytes(
        clean_target_root / imported_voice.reference_audio,
    )
    if adapter_path:
        assert imported_voice.adapter_path
        assert _artifact_shape_and_bytes(source_root / adapter_path) == _artifact_shape_and_bytes(
            clean_target_root / imported_voice.adapter_path,
        )
    else:
        assert imported_voice.adapter_path is None


def test_entry_package_round_trips_to_clean_store_and_project_without_machine_paths(tmp_path: Path):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, source_store = fixture(tmp_path)
    _publish_synthetic_gate(source_root, source.id, speaker, voice, model_sets)
    source_collection = source_store.create(VoiceCollectionCreate(
        name="Source vault",
        properties=VoiceCollectionProperties(language="Tiếng Việt", language_id="vi", region="Hà Nội", color="#112233"),
    ))
    source_entry = source_store.add_entry(source_collection.id, source.id, voice.id)
    unreferenced_base = source_store._entry_folder(source_collection.id, source_entry.id) / "payload" / "base-models"
    unreferenced_base.mkdir()
    (unreferenced_base / "shared-foundation.safetensors").write_bytes(b"shared base weights are not part of an entry")

    with _client(source_store) as client:
        exported = client.get(
            f"/api/voice-collections/{source_collection.id}/entries/{source_entry.id}/export",
        )

    assert exported.status_code == 200, exported.text
    assert exported.headers["content-type"].startswith("application/zip")
    with zipfile.ZipFile(BytesIO(exported.content)) as archive:
        names = archive.namelist()
        assert "manifest.json" in names
        assert not any("shared-foundation" in name for name in names)
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["schemaVersion"] == 1
        assert manifest["kind"] == "pro4bro-voice-collection-entry"
        assert manifest["sourceCollection"]["name"] == "Source vault"
        assert manifest["sourceCollection"]["properties"]["region"] == "Hà Nội"
        lineage = json.loads(archive.read("lineage.json"))
        gate_record = lineage["provenance"]["sourceModelSet"]["gate"]
        assert gate_record["passed"] is True
        inventory = {item["path"]: item for item in manifest["inventory"]}
        assert set(inventory) == set(names) - {"manifest.json"}
        for path, item in inventory.items():
            content = archive.read(path)
            assert item["sizeBytes"] == len(content)
            assert item["sha256"] == __import__("hashlib").sha256(content).hexdigest()
            assert not re.search(rb"(?i)(?:[A-Z]:[\\/]|\\\\)", content)
        assert not any("base-model" in name.lower() for name in names)

    clean_projects = FileProjectRepository(tmp_path / "clean-machine-projects")
    clean_target = clean_projects.create(ProjectCreate(name="Clean Target", location=str(tmp_path / "clean-machine")))
    clean_catalogs = FileTrainingCatalog(clean_projects)
    clean_voices = FileProjectVoices(clean_projects, copy_slice)
    clean_model_sets = FileVoiceModelSets(clean_projects)
    clean_runs = FileTrainingRuns(clean_projects)
    clean_store = FileVoiceCollections(
        tmp_path / "clean-machine-data", clean_projects, clean_voices, clean_catalogs, clean_model_sets, clean_runs,
    )
    destination_collection = clean_store.create(VoiceCollectionCreate(
        name="Destination vault",
        properties=VoiceCollectionProperties(language_id="vi", region="Miền Nam"),
    ))
    with _client(clean_store) as client:
        imported = client.post(
            f"/api/voice-collections/{destination_collection.id}/entries/import-package",
            files={"file": ("trained-voice.zip", exported.content, "application/zip")},
        )

    assert imported.status_code == 200, imported.text
    destination_entry = imported.json()
    assert destination_entry["id"] != source_entry.id
    assert destination_entry["sourceProjectId"] == source_entry.source_project_id
    assert destination_entry["voice"] == source_entry.voice.model_dump(mode="json", by_alias=True)
    assert destination_entry["voice"]["modelSetId"] == "set-passed"
    assert destination_entry["speaker"] == source_entry.speaker.model_dump(mode="json", by_alias=True)
    assert clean_store.get(destination_collection.id).entries[0].id == destination_entry["id"]

    project_import = clean_store.import_entry(destination_collection.id, destination_entry["id"], clean_target.id)
    imported_voice = project_import.voice
    assert (Path(clean_target.project_path) / imported_voice.reference_audio).read_bytes() == (
        source_root / voice.reference_audio
    ).read_bytes()
    assert imported_voice.adapter_path
    assert (Path(clean_target.project_path) / imported_voice.adapter_path / "adapter.bin").read_bytes() == (
        source_root / voice.adapter_path / "adapter.bin"
    ).read_bytes()
    assert project_import.speaker.voice_consent and project_import.speaker.voice_consent.evidence
    assert (Path(clean_target.project_path) / project_import.speaker.voice_consent.evidence.path).read_bytes() == (
        source_root / speaker.voice_consent.evidence.path
    ).read_bytes()
    assert imported_voice.model_set_id is None
    assert imported_voice.collection_source is not None
    assert imported_voice.model_set_id is None
    assert not list(clean_store.root.glob(".voice-collection-transfer-*.tmp"))


def test_corrupted_or_missing_inventory_file_is_rejected_without_publishing(tmp_path: Path):
    projects, source, _, _, _, voice, catalogs, voices, model_sets, runs, source_store = fixture(tmp_path)
    source_collection = source_store.create(VoiceCollectionCreate(name="Source"))
    source_entry = source_store.add_entry(source_collection.id, source.id, voice.id)
    with _client(source_store) as client:
        exported = client.get(f"/api/voice-collections/{source_collection.id}/entries/{source_entry.id}/export")
    assert exported.status_code == 200, exported.text

    with zipfile.ZipFile(BytesIO(exported.content)) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    payload_name = next(name for name in parts if name.startswith("payload/") and name.endswith("adapter.bin"))
    parts[payload_name] = b"evil synthetic adapter bytes"
    tampered = _write_archive(parts)

    clean_store = FileVoiceCollections(tmp_path / "empty-machine-data", projects, voices, catalogs, model_sets, runs)
    target_collection = clean_store.create(VoiceCollectionCreate(name="Destination"))
    with _client(clean_store) as client:
        rejected = client.post(
            f"/api/voice-collections/{target_collection.id}/entries/import-package",
            files={"file": ("tampered.zip", tampered, "application/zip")},
        )
    assert rejected.status_code == 400
    assert "hash" in rejected.json()["detail"].lower()
    assert clean_store.get(target_collection.id).entries == []

    parts.pop(payload_name)
    missing = _write_archive(parts)
    with _client(clean_store) as client:
        rejected = client.post(
            f"/api/voice-collections/{target_collection.id}/entries/import-package",
            files={"file": ("missing.zip", missing, "application/zip")},
        )
    assert rejected.status_code == 400
    assert clean_store.get(target_collection.id).entries == []


def test_atomic_publish_failure_rolls_back_staged_entry(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    projects, source, _, _, _, voice, catalogs, voices, model_sets, runs, source_store = fixture(tmp_path)
    source_collection = source_store.create(VoiceCollectionCreate(name="Source"))
    source_entry = source_store.add_entry(source_collection.id, source.id, voice.id)
    with _client(source_store) as client:
        exported = client.get(f"/api/voice-collections/{source_collection.id}/entries/{source_entry.id}/export")
    assert exported.status_code == 200, exported.text

    clean_store = FileVoiceCollections(tmp_path / "atomic-target-data", projects, voices, catalogs, model_sets, runs)
    target_collection = clean_store.create(VoiceCollectionCreate(name="Destination"))
    entries_root = clean_store._entry_folder(target_collection.id, "entry-placeholder").parent
    original_replace = Path.replace

    def fail_final_publish(path: Path, target: str | Path) -> Path:
        destination = Path(target)
        if (path.parent == entries_root and path.name.startswith(".entry-")
                and destination.parent == entries_root and destination.name.startswith("entry-")):
            raise OSError("simulated atomic publish failure")
        return original_replace(path, target)

    monkeypatch.setattr(Path, "replace", fail_final_publish)
    with _client(clean_store) as client:
        rejected = client.post(
            f"/api/voice-collections/{target_collection.id}/entries/import-package",
            files={"file": ("voice.zip", exported.content, "application/zip")},
        )
    assert rejected.status_code == 400
    assert clean_store.get(target_collection.id).entries == []
    assert not list(entries_root.glob(".entry-*.tmp"))


def test_extraction_io_failure_removes_partial_staging_tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    projects, source, _, _, _, voice, catalogs, voices, model_sets, runs, source_store = fixture(tmp_path)
    source_collection = source_store.create(VoiceCollectionCreate(name="Source"))
    source_entry = source_store.add_entry(source_collection.id, source.id, voice.id)
    with _client(source_store) as client:
        exported = client.get(f"/api/voice-collections/{source_collection.id}/entries/{source_entry.id}/export")
    assert exported.status_code == 200, exported.text

    clean_store = FileVoiceCollections(tmp_path / "io-failure-target-data", projects, voices, catalogs, model_sets, runs)
    target_collection = clean_store.create(VoiceCollectionCreate(name="Destination"))
    entries_root = clean_store._folder(target_collection.id) / "entries"
    original_mkdir = Path.mkdir

    def fail_after_creating_payload_directory(path: Path, *args, **kwargs):
        is_staged_payload_dir = path.name == "payload" and path.parent.name.startswith(".entry-")
        if is_staged_payload_dir:
            original_mkdir(path, *args, **kwargs)
            raise OSError("simulated disk-full while creating extracted payload")
        return original_mkdir(path, *args, **kwargs)

    monkeypatch.setattr(Path, "mkdir", fail_after_creating_payload_directory)
    with _client(clean_store) as client:
        rejected = client.post(
            f"/api/voice-collections/{target_collection.id}/entries/import-package",
            files={"file": ("voice.zip", exported.content, "application/zip")},
        )
    assert rejected.status_code == 400
    assert "safely extracted" in rejected.json()["detail"].lower()
    assert clean_store.get(target_collection.id).entries == []
    assert not list(entries_root.glob(".entry-*.tmp"))


def test_missing_collection_with_missing_storage_root_returns_404_for_external_routes(tmp_path: Path):
    projects, _, _, _, _, _, catalogs, voices, model_sets, runs, _ = fixture(tmp_path)
    store = FileVoiceCollections(tmp_path / "missing-root-data", projects, voices, catalogs, model_sets, runs)
    store.root.rmdir()

    with _client(store) as client:
        exported = client.get("/api/voice-collections/collection-missing/entries/entry-missing/export")
        imported = client.post(
            "/api/voice-collections/collection-missing/entries/import-package",
            files={"file": ("voice.zip", b"not a zip", "application/zip")},
        )

    assert exported.status_code == 404
    assert imported.status_code == 404
    assert "collection" in exported.json()["detail"].lower()
    assert "collection" in imported.json()["detail"].lower()


def test_package_import_cannot_bypass_published_model_set_gate(tmp_path: Path):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, source_store = fixture(tmp_path)
    _publish_synthetic_gate(source_root, source.id, speaker, voice, model_sets)
    source_collection = source_store.create(VoiceCollectionCreate(name="Gated source"))
    source_entry = source_store.add_entry(source_collection.id, source.id, voice.id)
    with _client(source_store) as client:
        exported = client.get(f"/api/voice-collections/{source_collection.id}/entries/{source_entry.id}/export")
    assert exported.status_code == 200, exported.text

    def remove_gate(lineage: dict) -> None:
        lineage["provenance"]["sourceModelSet"]["status"] = "pending-gate"

    forged = _change_lineage_and_rehash(exported.content, remove_gate)
    clean_store = FileVoiceCollections(tmp_path / "gate-target-data", projects, voices, catalogs, model_sets, runs)
    target_collection = clean_store.create(VoiceCollectionCreate(name="Destination"))
    with _client(clean_store) as client:
        rejected = client.post(
            f"/api/voice-collections/{target_collection.id}/entries/import-package",
            files={"file": ("pending-gate.zip", forged, "application/zip")},
        )
    assert rejected.status_code == 400
    assert "published voice model set gate" in rejected.json()["detail"].lower()
    assert clean_store.get(target_collection.id).entries == []


@pytest.mark.parametrize("unsafe_name", ["../outside", "payload/../../outside", "C:/outside"])
def test_unsafe_zip_paths_and_symlinks_are_rejected_without_publishing(tmp_path: Path, unsafe_name: str):
    projects, _, _, _, _, _, catalogs, voices, model_sets, runs, _ = fixture(tmp_path)
    clean_store = FileVoiceCollections(tmp_path / "empty-machine-data", projects, voices, catalogs, model_sets, runs)
    collection = clean_store.create(VoiceCollectionCreate(name="Destination"))
    unsafe = _write_archive({unsafe_name: b"outside"})
    with _client(clean_store) as client:
        rejected = client.post(
            f"/api/voice-collections/{collection.id}/entries/import-package",
            files={"file": ("unsafe.zip", unsafe, "application/zip")},
        )
    assert rejected.status_code == 400
    assert clean_store.get(collection.id).entries == []

    symlink = _write_archive({}, symlink="payload/link")
    with _client(clean_store) as client:
        rejected_link = client.post(
            f"/api/voice-collections/{collection.id}/entries/import-package",
            files={"file": ("symlink.zip", symlink, "application/zip")},
        )
    assert rejected_link.status_code == 400
    assert clean_store.get(collection.id).entries == []


def test_duplicate_paths_and_expanded_size_limit_are_rejected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app.adapters import voice_collection_transfer as transfer

    projects, _, _, _, _, _, catalogs, voices, model_sets, runs, _ = fixture(tmp_path)
    store = FileVoiceCollections(tmp_path / "empty-machine-data", projects, voices, catalogs, model_sets, runs)
    collection = store.create(VoiceCollectionCreate(name="Destination"))
    duplicate = BytesIO()
    with zipfile.ZipFile(duplicate, "w") as archive:
        archive.writestr("entry.json", b"one")
        archive.writestr("entry.json", b"two")
    with _client(store) as client:
        duplicate_response = client.post(
            f"/api/voice-collections/{collection.id}/entries/import-package",
            files={"file": ("duplicate.zip", duplicate.getvalue(), "application/zip")},
        )
    assert duplicate_response.status_code == 400
    assert store.get(collection.id).entries == []

    # A valid but expanded package is generated by an independent fixture below.
    projects, source, _, _, _, voice, catalogs, voices, model_sets, runs, source_store = fixture(tmp_path / "source")
    source_collection = source_store.create(VoiceCollectionCreate(name="Source"))
    source_entry = source_store.add_entry(source_collection.id, source.id, voice.id)
    with _client(source_store) as source_client:
        package = source_client.get(f"/api/voice-collections/{source_collection.id}/entries/{source_entry.id}/export")
    assert package.status_code == 200, package.text
    monkeypatch.setattr(transfer, "MAX_EXPANDED_BYTES", 1)
    with _client(store) as client:
        expanded_response = client.post(
            f"/api/voice-collections/{collection.id}/entries/import-package",
            files={"file": ("expanded.zip", package.content, "application/zip")},
        )
    assert expanded_response.status_code == 400
    assert store.get(collection.id).entries == []


def test_oversized_upload_is_rejected_before_staging(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    from app.adapters import voice_collection_transfer as transfer

    projects, _, _, _, _, _, catalogs, voices, model_sets, runs, _ = fixture(tmp_path)
    store = FileVoiceCollections(tmp_path / "empty-machine-data", projects, voices, catalogs, model_sets, runs)
    collection = store.create(VoiceCollectionCreate(name="Destination"))
    monkeypatch.setattr(transfer, "MAX_UPLOAD_BYTES", 32)
    with _client(store) as client:
        rejected = client.post(
            f"/api/voice-collections/{collection.id}/entries/import-package",
            files={"file": ("large.zip", b"x" * 33, "application/zip")},
        )
    assert rejected.status_code == 400
    assert store.get(collection.id).entries == []
    assert not list(store.root.glob(".voice-collection-upload-*.tmp"))
