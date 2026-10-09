from __future__ import annotations

from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor
import os
import json
from pathlib import Path
import shutil

import pytest
from fastapi.testclient import TestClient

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_voice_collections import FileVoiceCollections
from app.adapters.file_voice_model_sets import FileVoiceModelSets
from app.domain.models import (
    ConsentEvidence,
    DatasetManifest,
    DatasetSegment,
    ProjectCreate,
    ProjectVoice,
    SpeakerProfile,
    TrainingCatalog,
    TrainingRun,
    TrainingRunConfig,
    TrainingCheckpoint,
    VoiceCollectionCreate,
    VoiceCollectionProperties,
    VoiceConsent,
    SpeakerSimilarityGateEvidence,
    VoiceModelSet,
    VoiceModelSetLineage,
    VoiceModelSetMember,
)
from app.main import create_app
from app.settings import Settings


def copy_slice(source: Path, target: Path, _start: float, _end: float) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())


def test_legacy_voice_consent_defaults_to_local_upload_disallowed_without_evidence():
    consent = VoiceConsent(granted_by="An")
    assert consent.upload_allowed is False
    assert consent.evidence is None


def fixture(tmp_path: Path):
    projects = FileProjectRepository(tmp_path / "registry")
    source = projects.create(ProjectCreate(name="Source", location=str(tmp_path / "projects")))
    target = projects.create(ProjectCreate(name="Target", location=str(tmp_path / "projects")))
    source_root = Path(source.project_path)
    audio = source_root / "assets/media/source/analysis.wav"
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"RIFF-reference-audio")
    evidence = source_root / "assets/consent-evidence/evidence-source.txt"
    evidence.parent.mkdir(parents=True)
    evidence.write_bytes(b"I agree to local use of my voice.")
    catalogs = FileTrainingCatalog(projects)
    speaker = SpeakerProfile(
        id="speaker-source", name="An", language="vi", language_id="vi", region="Hà Nội",
        age="adult", gender="female", color="#aabbcc", attributes={"style": "warm"},
        voice_consent=VoiceConsent(
            granted_by="An", note="signed locally", upload_allowed=False,
            evidence={"path": "assets/consent-evidence/evidence-source.txt", "name": "agreement.txt"},
        ),
    )
    catalogs.save(source.id, TrainingCatalog(speakers=[speaker]))
    segment = DatasetSegment(
        id="segment-source", asset_id="asset-source", audio_path="assets/media/source/analysis.wav",
        start=0, end=3, text="xin chào", speaker_profile_id=speaker.id,
    )
    adapter = source_root / "jobs/training/run-1/adapter"
    adapter.mkdir(parents=True)
    (adapter / "adapter.bin").write_bytes(b"real synthetic adapter bytes")
    model = source_root / "jobs/training/run-1/model"
    model.mkdir(parents=True)
    (model / "weights.bin").write_bytes(b"real synthetic model bytes")
    voices = FileProjectVoices(projects, copy_slice)
    voice = voices.publish(
        source.id, name="An LoRA", speaker_profile_id=speaker.id, kind="lora", reference=segment,
        language="vi", adapter_dir=adapter, source_run_id="run-1",
    )
    runs = FileTrainingRuns(projects)
    runs._write(source.id, TrainingRun(
        id="run-1", project_id=source.id, manifest_id="manifest-source", speaker_profile_id=speaker.id,
        status="complete", checkpoints=[TrainingCheckpoint(
            step=10, path=voice.adapter_path, bytes=sum(path.stat().st_size for path in adapter.rglob("*") if path.is_file()),
        )],
    ))
    model_sets = FileVoiceModelSets(projects)
    store = FileVoiceCollections(tmp_path / "data", projects, voices, catalogs, model_sets, runs)
    return projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store


def test_collection_reopens_with_copied_bytes_and_import_is_retry_safe(tmp_path):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(
        name="Studio voices",
        properties=VoiceCollectionProperties(language="vi", language_id="vi", color="#112233", attributes={"use": "demo"}),
    ))
    original_adapter_bytes = (source_root / voice.adapter_path / "adapter.bin").read_bytes()
    with ThreadPoolExecutor(max_workers=6) as executor:
        entries = list(executor.map(lambda _: store.add_entry(collection.id, source.id, voice.id), range(6)))
    entry = entries[0]
    assert {item.id for item in entries} == {entry.id}
    assert (source_root / voice.adapter_path / "adapter.bin").read_bytes() == original_adapter_bytes
    archive = tmp_path / "data/voice-collections" / collection.id / "entries" / entry.id / "payload"

    (source_root / voice.adapter_path / "adapter.bin").write_bytes(b"changed at source later")
    reopened = FileVoiceCollections(tmp_path / "data", projects, voices, catalogs, model_sets, runs)
    loaded = reopened.get(collection.id)
    result = reopened.import_entry(collection.id, entry.id, target.id)
    retried = reopened.import_entry(collection.id, entry.id, target.id)
    catalogs.save(target.id, retried.catalog.model_copy(update={"speakers": []}))
    recovered = reopened.import_entry(collection.id, entry.id, target.id)

    assert loaded.entries[0].source_project_name == "Source"
    assert loaded.properties.color == "#112233"
    assert (archive / voice.adapter_path / "adapter.bin").read_bytes() == b"real synthetic adapter bytes"
    assert (archive / voice.reference_audio).read_bytes() == b"RIFF-reference-audio"
    assert (archive / speaker.voice_consent.evidence.path).read_bytes() == b"I agree to local use of my voice."
    assert result.voice.id == retried.voice.id
    assert len(recovered.catalog.speakers) == 1
    assert recovered.speaker.voice_consent.upload_allowed is False
    assert recovered.speaker.voice_consent.evidence.path.startswith("assets/consent-evidence/")
    target_root = Path(target.project_path)
    assert (target_root / "assets/voices" / result.voice.id / "consent-evidence" / "evidence-source.txt").read_bytes() == b"I agree to local use of my voice."
    assert (target_root / result.voice.reference_audio).read_bytes() == b"RIFF-reference-audio"
    assert (target_root / result.voice.adapter_path / "adapter.bin").read_bytes() == b"real synthetic adapter bytes"
    assert (target_root / recovered.speaker.voice_consent.evidence.path).read_bytes() == b"I agree to local use of my voice."
    shutil.rmtree(source_root)
    second_collection = reopened.create(VoiceCollectionCreate(name="Re-exported collection"))
    reexported = reopened.add_entry(second_collection.id, target.id, result.voice.id)
    assert reexported.source_project_name == "Target"
    assert reexported.voice.source_run_id is None
    assert (tmp_path / "data/voice-collections" / second_collection.id / "entries" / reexported.id
            / "payload" / reexported.voice.adapter_path / "adapter.bin").read_bytes() == b"real synthetic adapter bytes"
    (target_root / result.voice.adapter_path / "adapter.bin").write_bytes(b"tampered after import")
    third_collection = reopened.create(VoiceCollectionCreate(name="Tamper check"))
    with pytest.raises(ValueError, match="artifacts changed"):
        reopened.add_entry(third_collection.id, target.id, result.voice.id)


def _add_second_source_voice(projects, source, source_root, speaker, voice, runs):
    second_id = "voice-source-second"
    second_root = source_root / "jobs/training/run-1/second-adapter"
    second_root.mkdir(parents=True)
    (second_root / "adapter.bin").write_bytes(b"second synthetic adapter bytes")
    second = voice.model_copy(update={
        "id": second_id,
        "name": "An LoRA second checkpoint",
        "adapter_path": "jobs/training/run-1/second-adapter",
        "reference_audio": voice.reference_audio,
    })
    voice_root = source_root / "assets/voices" / second.id
    voice_root.mkdir(parents=True)
    (voice_root / "voice.json").write_text(second.model_dump_json(by_alias=True), encoding="utf-8")
    run = runs.get(source.id, "run-1")
    runs._write(source.id, run.model_copy(update={
        "checkpoints": [*run.checkpoints, TrainingCheckpoint(
            step=20, path=second.adapter_path,
            bytes=sum(path.stat().st_size for path in second_root.rglob("*") if path.is_file()),
        )],
    }))
    return second


def test_importing_selected_models_from_same_source_profile_reuses_one_destination_profile(tmp_path):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    second = _add_second_source_voice(projects, source, source_root, speaker, voice, runs)
    collection = store.create(VoiceCollectionCreate(name="Two checkpoints"))
    first_entry = store.add_entry(collection.id, source.id, voice.id)
    second_entry = store.add_entry(collection.id, source.id, second.id)

    first = store.import_entry(collection.id, first_entry.id, target.id)
    legacy_marker_path = Path(target.project_path) / "assets/voices" / first.voice.id / "collection-import.json"
    legacy_marker = json.loads(legacy_marker_path.read_text(encoding="utf-8"))
    legacy_marker.pop("sourceSpeakerId")
    legacy_marker_path.write_text(json.dumps(legacy_marker), encoding="utf-8")
    catalogs.save(target.id, first.catalog.model_copy(update={"speakers": []}))
    reopened = FileVoiceCollections(tmp_path / "data", projects, voices, catalogs, model_sets, runs)
    selective = reopened.import_entry(collection.id, second_entry.id, target.id)
    retried = reopened.import_entry(collection.id, second_entry.id, target.id)

    assert first.voice.speaker_profile_id == selective.voice.speaker_profile_id
    assert selective.speaker.id == first.speaker.id
    assert retried.voice.id == selective.voice.id
    assert len(selective.catalog.speakers) == 1
    assert {item.id for item in reopened.voices.list(target.id)} == {first.voice.id, selective.voice.id}


def test_same_display_name_from_distinct_source_profiles_stays_separate(tmp_path):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    second_speaker = speaker.model_copy(update={"id": "speaker-other", "name": speaker.name})
    catalog = catalogs.get(source.id)
    catalogs.save(source.id, catalog.model_copy(update={"speakers": [*catalog.speakers, second_speaker]}))
    second = _add_second_source_voice(projects, source, source_root, second_speaker, voice, runs)
    # The helper cloned the first voice's source speaker; model identity must follow the second profile.
    second_adapter_dir = source_root / "jobs/training/run-2/adapter"
    second_adapter_dir.parent.mkdir(parents=True)
    shutil.copytree(source_root / second.adapter_path, second_adapter_dir)
    second = second.model_copy(update={
        "speaker_profile_id": second_speaker.id,
        "source_run_id": "run-2",
        "adapter_path": "jobs/training/run-2/adapter",
    })
    (source_root / "assets/voices" / second.id / "voice.json").write_text(
        second.model_dump_json(by_alias=True), encoding="utf-8",
    )
    second_adapter = source_root / second.adapter_path
    runs._write(source.id, TrainingRun(
        id="run-2", project_id=source.id, manifest_id="manifest-second", speaker_profile_id=second_speaker.id,
        status="complete", checkpoints=[TrainingCheckpoint(
            step=20, path=second.adapter_path,
            bytes=sum(path.stat().st_size for path in second_adapter.rglob("*") if path.is_file()),
        )],
    ))
    collection = store.create(VoiceCollectionCreate(name="Duplicate names"))
    first_entry = store.add_entry(collection.id, source.id, voice.id)
    second_entry = store.add_entry(collection.id, source.id, second.id)

    first = store.import_entry(collection.id, first_entry.id, target.id)
    second_import = store.import_entry(collection.id, second_entry.id, target.id)

    assert first.speaker.name == second_import.speaker.name
    assert first.speaker.id != second_import.speaker.id
    assert first.voice.speaker_profile_id != second_import.voice.speaker_profile_id
    assert len(second_import.catalog.speakers) == 2


def test_deleting_first_imported_model_keeps_shared_consent_and_second_model_exportable(tmp_path):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    second = _add_second_source_voice(projects, source, source_root, speaker, voice, runs)
    collection = store.create(VoiceCollectionCreate(name="Shared consent"))
    first_entry = store.add_entry(collection.id, source.id, voice.id)
    second_entry = store.add_entry(collection.id, source.id, second.id)
    first = store.import_entry(collection.id, first_entry.id, target.id)
    second_import = store.import_entry(collection.id, second_entry.id, target.id)
    target_root = Path(target.project_path)
    profile_evidence = target_root / second_import.speaker.voice_consent.evidence.path

    voices.delete(target.id, first.voice.id)
    assert profile_evidence.read_bytes() == b"I agree to local use of my voice."
    assert (target_root / "assets/voices" / second_import.voice.id / "consent-evidence" / "evidence-source.txt").read_bytes() == b"I agree to local use of my voice."

    another_collection = store.create(VoiceCollectionCreate(name="Second remains usable"))
    reexported = store.add_entry(another_collection.id, target.id, second_import.voice.id)
    assert reexported.voice.id == second_import.voice.id


def test_failed_consent_copy_leaves_no_imported_model_or_speaker_profile(tmp_path, monkeypatch):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Copy failure"))
    entry = store.add_entry(collection.id, source.id, voice.id)
    original_copy = store._copy_from_archive

    def fail_consent_copy(archive_root, relative, destination):
        if relative == speaker.voice_consent.evidence.path:
            raise OSError("synthetic evidence copy failure")
        return original_copy(archive_root, relative, destination)

    monkeypatch.setattr(store, "_copy_from_archive", fail_consent_copy)
    with pytest.raises(OSError, match="synthetic evidence copy failure"):
        store.import_entry(collection.id, entry.id, target.id)

    assert catalogs.get(target.id).speakers == []
    assert voices.list(target.id) == []
    target_root = Path(target.project_path)
    consent_root = target_root / "assets/consent-evidence"
    assert not list((target_root / "assets/voices").glob("voice-*"))
    if consent_root.exists():
        assert not list(consent_root.glob("speaker-*"))


def test_profile_consent_publication_rejects_symlinked_speaker_folder(tmp_path):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Symlink consent target"))
    entry = store.add_entry(collection.id, source.id, voice.id)
    archive_root = tmp_path / "data/voice-collections" / collection.id / "entries" / entry.id / "payload"
    target_root = Path(target.project_path)
    consent_root = target_root / "assets/consent-evidence"
    consent_root.mkdir(parents=True)
    outside = tmp_path / "outside-consent"
    outside.mkdir()
    destination = consent_root / "speaker-link"
    try:
        os.symlink(outside, destination, target_is_directory=True)
    except (OSError, NotImplementedError) as exc:
        pytest.skip(f"symlink creation is unavailable: {exc}")

    linked_speaker = speaker.model_copy(update={"id": "speaker-link"})
    with pytest.raises(ValueError, match="symbolic link|escaped its root"):
        store._prepare_profile_evidence(target_root, linked_speaker, archive_root=archive_root)

    stage = consent_root / ".speaker-link.test.tmp"
    stage.mkdir()
    (stage / "evidence-source.txt").write_bytes(b"synthetic proof")
    with pytest.raises(ValueError, match="symbolic link|escaped its root"):
        store._publish_profile_evidence(stage, destination)
    assert list(outside.iterdir()) == []
    assert stage.exists()


def test_catalog_save_failure_rolls_back_new_model_and_profile_consent(tmp_path, monkeypatch):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Catalog save failure"))
    entry = store.add_entry(collection.id, source.id, voice.id)
    original_save = catalogs.save

    def fail_import_save(project_id, catalog):
        if project_id == target.id and catalog.speakers:
            raise OSError("synthetic catalog save failure")
        return original_save(project_id, catalog)

    monkeypatch.setattr(catalogs, "save", fail_import_save)
    with pytest.raises(OSError, match="synthetic catalog save failure"):
        store.import_entry(collection.id, entry.id, target.id)

    assert catalogs.get(target.id).speakers == []
    assert voices.list(target.id) == []
    target_root = Path(target.project_path)
    assert not list((target_root / "assets/voices").glob("voice-*"))
    assert not list((target_root / "assets/consent-evidence").glob("speaker-*"))


def test_collection_rejects_clone_missing_artifact_and_pending_model_set(tmp_path):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Collection"))
    clone = voices.publish(
        source.id, name="Clone", speaker_profile_id=speaker.id, kind="clone",
        reference=DatasetSegment(
            id="clone-segment", asset_id="asset-source", audio_path="assets/media/source/analysis.wav",
            start=0, end=3, text="clone", speaker_profile_id=speaker.id,
        ), language="vi",
    )
    with pytest.raises(ValueError, match="trained"):
        store.add_entry(collection.id, source.id, clone.id)

    (source_root / voice.adapter_path / "adapter.bin").unlink()
    with pytest.raises(ValueError, match="retained non-empty checkpoint"):
        store.add_entry(collection.id, source.id, voice.id)


def test_collection_rejects_voice_paths_outside_project(tmp_path):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Collection"))
    outside = tmp_path / "outside.bin"
    outside.write_bytes(b"outside")
    voice_record = source_root / "assets/voices" / voice.id / "voice.json"
    changed = voice.model_copy(update={"adapter_path": "../outside.bin"})
    voice_record.write_text(changed.model_dump_json(by_alias=True), encoding="utf-8")
    with pytest.raises(ValueError, match="safe project-relative"):
        store.add_entry(collection.id, source.id, voice.id)


def test_failed_entry_copy_is_not_published(tmp_path):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Collection"))
    (source_root / speaker.voice_consent.evidence.path).unlink()
    with pytest.raises(FileNotFoundError):
        store.add_entry(collection.id, source.id, voice.id)
    assert store.get(collection.id).entries == []
    entries_root = tmp_path / "data/voice-collections" / collection.id / "entries"
    assert list(entries_root.iterdir()) == []


@pytest.mark.parametrize("status", ["pending-gate", "rejected"])
def test_collection_does_not_bypass_pending_or_rejected_voice_model_set(tmp_path, status):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Collection"))
    voice = voice.model_copy(update={"model_set_id": "set-source"})
    (source_root / "assets/voices" / voice.id / "voice.json").write_text(
        voice.model_dump_json(by_alias=True), encoding="utf-8",
    )
    model_sets._write(source.id, VoiceModelSet(
        id="set-source", name="Source set", speaker_profile_id=speaker.id,
        generation_family="omnivoice:test", anchor_voice_id=voice.id, anchor_segment_id="segment-source",
        members=[VoiceModelSetMember(voice_id=voice.id)],
        lineage=VoiceModelSetLineage(
            manifest_id="manifest", manifest_hash="hash", engine="omnivoice", engine_revision="revision",
            base_model="base", config=TrainingRunConfig(), segment_count=1, source_run_ids=["run"],
        ),
        status=status,
    ))
    with pytest.raises(ValueError, match="identity gate"):
        store.add_entry(collection.id, source.id, voice.id)


def test_windows_checkpoint_path_reaches_pending_model_set_gate(tmp_path):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Windows checkpoint"))
    checkpoint_dir = source_root / voice.adapter_path
    windows_path = voice.adapter_path.replace("/", "\\")
    run = runs.get(source.id, "run-1")
    runs._write(source.id, run.model_copy(update={
        "checkpoints": [TrainingCheckpoint(
            step=10, path=windows_path,
            bytes=sum(path.stat().st_size for path in checkpoint_dir.rglob("*") if path.is_file()),
        )],
    }))
    voice = voice.model_copy(update={"model_set_id": "set-windows-pending"})
    (source_root / "assets/voices" / voice.id / "voice.json").write_text(
        voice.model_dump_json(by_alias=True), encoding="utf-8",
    )
    model_sets._write(source.id, VoiceModelSet(
        id="set-windows-pending", name="Pending identity gate", speaker_profile_id=speaker.id,
        generation_family="omnivoice:test", anchor_voice_id=voice.id, anchor_segment_id="segment-source",
        members=[VoiceModelSetMember(voice_id=voice.id)],
        lineage=VoiceModelSetLineage(
            manifest_id="manifest", manifest_hash="hash", engine="omnivoice", engine_revision="revision",
            base_model="base", config=TrainingRunConfig(), segment_count=1, source_run_ids=["run-1"],
        ),
        status="pending-gate",
    ))

    with pytest.raises(ValueError, match="identity gate"):
        store.add_entry(collection.id, source.id, voice.id)
    assert store.get(collection.id).entries == []


def test_collection_rejects_unsafe_source_run_id(tmp_path):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Unsafe run id"))
    changed = voice.model_copy(update={"source_run_id": "../outside"})
    (source_root / "assets/voices" / voice.id / "voice.json").write_text(
        changed.model_dump_json(by_alias=True), encoding="utf-8",
    )

    with pytest.raises(ValueError, match="training run ID is invalid"):
        store.add_entry(collection.id, source.id, voice.id)


def test_collection_rejects_dot_reference_and_recursive_copy(tmp_path):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Invalid reference"))
    changed = voice.model_copy(update={"reference_audio": "."})
    (source_root / "assets/voices" / voice.id / "voice.json").write_text(
        changed.model_dump_json(by_alias=True), encoding="utf-8",
    )

    with pytest.raises(ValueError, match="safe project-relative"):
        store.add_entry(collection.id, source.id, voice.id)
    with pytest.raises(ValueError, match="inside its source tree"):
        store._copy_tree(source_root, source_root / "recursive-copy")
    assert store.get(collection.id).entries == []


def test_collection_api_uploads_bounded_consent_evidence_and_serves_collection_contract(tmp_path):
    projects, source, _, _, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        evidence = client.post(
            f"/api/projects/{source.id}/consent-evidence",
            files={"file": ("signed.txt", b"Signed consent", "text/plain")},
        )
        catalog = catalogs.get(source.id)
        speaker_with_evidence = speaker.model_copy(update={
            "voice_consent": speaker.voice_consent.model_copy(
                update={"evidence": ConsentEvidence.model_validate(evidence.json())},
            ),
        })
        catalogs.save(source.id, catalog.model_copy(update={"speakers": [speaker_with_evidence]}))
        created = client.post("/api/voice-collections", json={"name": "Host vault", "properties": {"languageId": "vi"}})
        entry = client.post(
            f"/api/voice-collections/{created.json()['id']}/entries",
            json={"projectId": source.id, "voiceId": voice.id},
        )
        listed = client.get("/api/voice-collections")

    assert evidence.status_code == 201, evidence.text
    assert evidence.json()["path"].startswith("assets/consent-evidence/evidence-")
    assert created.status_code == 201 and created.json()["properties"]["languageId"] == "vi"
    assert entry.status_code == 201, entry.text
    assert listed.status_code == 200 and listed.json()[0]["entries"][0]["speaker"]["voiceConsent"]["evidence"]


def test_collection_api_imports_published_gated_voice_into_project_catalog(tmp_path):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    voice = voice.model_copy(update={"model_set_id": "set-passed"})
    (source_root / "assets/voices" / voice.id / "voice.json").write_text(
        voice.model_dump_json(by_alias=True), encoding="utf-8",
    )
    model_sets._write(source.id, VoiceModelSet(
        id="set-passed", name="Passed identity gate", speaker_profile_id=speaker.id,
        generation_family="omnivoice:test", anchor_voice_id=voice.id, anchor_segment_id="segment-source",
        members=[VoiceModelSetMember(voice_id=voice.id)],
        lineage=VoiceModelSetLineage(
            manifest_id="manifest", manifest_hash="hash", engine="omnivoice", engine_revision="revision",
            base_model="base", config=TrainingRunConfig(), segment_count=1, source_run_ids=["run-1"],
        ),
        status="published",
        gate=SpeakerSimilarityGateEvidence(
            embedder_id="synthetic-test-embedder", threshold=0.5, calibrated=True,
            scores_by_voice_id={voice.id: 0.8}, candidate_output_ids_by_voice_id={voice.id: "output-source"},
            score_passed=True, passed=True, decision_reason="passed",
        ),
    ))
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        created = client.post("/api/voice-collections", json={"name": "Gated voices"})
        entry = client.post(
            f"/api/voice-collections/{created.json()['id']}/entries",
            json={"projectId": source.id, "voiceId": voice.id},
        )
        imported_response = client.post(
            f"/api/voice-collections/{created.json()['id']}/entries/{entry.json()['id']}/import",
            json={"projectId": target.id},
        )
        target_voices = client.get(f"/api/projects/{target.id}/voices")
        target_catalog = client.get(f"/api/projects/{target.id}/training-catalog")

    assert created.status_code == 201
    assert entry.status_code == 201, entry.text
    assert imported_response.status_code == 200, imported_response.text
    imported_voice = imported_response.json()["voice"]
    assert imported_voice["modelSetId"] is None
    assert imported_voice["collectionSource"] == {
        "collectionId": created.json()["id"],
        "entryId": entry.json()["id"],
    }
    assert any(item["id"] == imported_voice["id"] for item in target_voices.json())
    imported_from_list = next(item for item in target_voices.json() if item["id"] == imported_voice["id"])
    assert imported_from_list["collectionSource"] == imported_voice["collectionSource"]
    assert any(item["id"] == imported_response.json()["speaker"]["id"] for item in target_catalog.json()["speakers"])
    assert (Path(target.project_path) / imported_voice["adapterPath"] / "adapter.bin").read_bytes() == b"real synthetic adapter bytes"


def test_collection_api_rejects_oversized_and_invalid_evidence(tmp_path):
    projects, source, *_ = fixture(tmp_path)
    settings = replace(Settings.from_env(), data_root=tmp_path / "data")
    with TestClient(create_app(project_repository=projects, settings=settings)) as client:
        oversized = client.post(
            f"/api/projects/{source.id}/consent-evidence",
            files={"file": ("large.txt", b"x" * (10 * 1024 * 1024 + 1), "text/plain")},
        )
        invalid = client.post(
            f"/api/projects/{source.id}/consent-evidence",
            files={"file": ("fake.pdf", b"not a PDF", "application/pdf")},
        )
    assert oversized.status_code == 400
    assert invalid.status_code == 400


def test_collection_rejects_symlinked_voice_artifact(tmp_path):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Collection"))
    adapter = source_root / voice.adapter_path
    outside = tmp_path / "outside-adapter"
    outside.mkdir()
    (outside / "adapter.bin").write_bytes(b"outside project")
    shutil.rmtree(adapter)
    try:
        os.symlink(outside, adapter, target_is_directory=True)
    except (OSError, NotImplementedError) as exc:
        pytest.skip(f"symlink creation is unavailable: {exc}")
    with pytest.raises(ValueError, match="symbolic link|escaped its root"):
        store.add_entry(collection.id, source.id, voice.id)


def test_collection_rejects_link_inside_voice_artifact_tree(tmp_path):
    projects, source, _, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Collection"))
    external = tmp_path / "external-artifact"
    external.mkdir()
    (external / "weights.bin").write_bytes(b"outside project")
    linked = source_root / voice.adapter_path / "external-link"
    try:
        os.symlink(external, linked, target_is_directory=True)
    except (OSError, NotImplementedError) as exc:
        pytest.skip(f"symlink creation is unavailable: {exc}")
    with pytest.raises(ValueError, match="symbolic link|escaped its root"):
        store.add_entry(collection.id, source.id, voice.id)
    assert store.get(collection.id).entries == []


def test_rvc_collection_import_preserves_weight_and_index_file_types(tmp_path):
    projects, source, target, source_root, speaker, voice, catalogs, voices, model_sets, runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="RVC collection"))
    run_root = source_root / "jobs/training/run-rvc"
    weights = run_root / "output/An.pth"
    index = run_root / "output/An.index"
    weights.parent.mkdir(parents=True)
    weights.write_bytes(b"synthetic RVC weights")
    index.write_bytes(b"synthetic RVC index")
    rvc = ProjectVoice(
        id="voice-rvc-source", name="An RVC", speaker_profile_id=speaker.id, engine="rvc", kind="vc",
        reference_audio=voice.reference_audio, reference_text="xin chào", reference_seconds=3,
        model_path="jobs/training/run-rvc/output/An.pth",
        adapter_path="jobs/training/run-rvc/output/An.index", source_run_id="run-rvc",
    )
    voice_folder = source_root / "assets/voices" / rvc.id
    voice_folder.mkdir(parents=True)
    (voice_folder / "voice.json").write_text(rvc.model_dump_json(by_alias=True), encoding="utf-8")
    runs._write(source.id, TrainingRun(
        id="run-rvc", project_id=source.id, manifest_id="manifest-rvc", speaker_profile_id=speaker.id,
        status="complete", checkpoints=[TrainingCheckpoint(step=100, path=rvc.model_path, bytes=weights.stat().st_size)],
    ))

    entry = store.add_entry(collection.id, source.id, rvc.id)
    imported = store.import_entry(collection.id, entry.id, target.id).voice
    imported_root = Path(target.project_path)

    assert imported.model_path.endswith(".pth")
    assert imported.adapter_path.endswith(".index")
    assert (imported_root / imported.model_path).is_file()
    assert (imported_root / imported.adapter_path).is_file()
    assert (imported_root / imported.model_path).read_bytes() == b"synthetic RVC weights"
    assert (imported_root / imported.adapter_path).read_bytes() == b"synthetic RVC index"
    assert imported.source_run_id is None and imported.reference_segment_id is None
