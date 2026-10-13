from __future__ import annotations

from pathlib import Path
import json
import zipfile

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.voice_collection_transfer_routes import make_voice_collection_transfer_router
from app.adapters.native_voice_package_picker import NativeVoicePackagePicker
from app.domain.models import VoiceCollectionCreate
from test_voice_collections import fixture


class FakePicker:
    def __init__(self, *, files: list[str] | None = None, folder: str | None = None):
        self.files = files or []
        self.folder = folder
        self.open_calls = 0
        self.folder_calls = 0

    def pick_zip_files(self, initial_path: str | None = None) -> list[str]:
        self.open_calls += 1
        return self.files

    def choose_export_folder(self, initial_path: str | None = None) -> str | None:
        self.folder_calls += 1
        return self.folder


def _client(store, picker: FakePicker) -> TestClient:
    app = FastAPI()
    app.include_router(make_voice_collection_transfer_router(store, picker=picker))
    return TestClient(app)


def _archive_entry(store, source, voice, collection_id: str):
    return store.add_entry(collection_id, source.id, voice.id)


def test_native_export_validates_all_ids_before_opening_folder_dialog(tmp_path: Path):
    *_, source, _target, _root, _speaker, voice, _catalogs, _voices, _sets, _runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Archive"))
    _archive_entry(store, source, voice, collection.id)
    picker = FakePicker(folder=str(tmp_path / "exports"))

    with _client(store, picker) as client:
        response = client.post(
            f"/api/voice-collections/{collection.id}/export-selected",
            json={"entryIds": ["entry-missing"]},
        )

    assert response.status_code == 404
    assert picker.folder_calls == 0
    assert not (tmp_path / "exports").exists()


def test_native_export_rejects_duplicate_ids_before_opening_folder_dialog(tmp_path: Path):
    *_, source, _target, _root, _speaker, voice, _catalogs, _voices, _sets, _runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Archive"))
    entry = _archive_entry(store, source, voice, collection.id)
    picker = FakePicker(folder=str(tmp_path))

    with _client(store, picker) as client:
        response = client.post(
            f"/api/voice-collections/{collection.id}/export-selected",
            json={"entryIds": [entry.id, entry.id]},
        )

    assert response.status_code == 400
    assert picker.folder_calls == 0


def test_native_export_verifies_archived_members_before_opening_folder_dialog(tmp_path: Path):
    *_, source, _target, _root, _speaker, voice, _catalogs, _voices, _sets, _runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Archive"))
    entry = _archive_entry(store, source, voice, collection.id)
    payload = store._entry_folder(collection.id, entry.id) / "payload"
    (payload / entry.voice.adapter_path / "adapter.bin").write_bytes(b"changed after archive")
    picker = FakePicker(folder=str(tmp_path))

    with _client(store, picker) as client:
        response = client.post(
            f"/api/voice-collections/{collection.id}/export-selected",
            json={"entryIds": [entry.id]},
        )

    assert response.status_code == 400
    assert "hashes" in response.json()["detail"]
    assert picker.folder_calls == 0


def test_native_export_publishes_verified_single_entry_zip_without_overwrite(tmp_path: Path):
    *_, source, _target, _root, _speaker, voice, _catalogs, _voices, _sets, _runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Archive"))
    entry = _archive_entry(store, source, voice, collection.id)
    export_folder = tmp_path / "exports"
    export_folder.mkdir()
    picker = FakePicker(folder=str(export_folder))

    with _client(store, picker) as client:
        response = client.post(
            f"/api/voice-collections/{collection.id}/export-selected",
            json={"entryIds": [entry.id]},
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cancelled"] is False
    assert picker.folder_calls == 1
    assert len(body["paths"]) == 1
    package = Path(body["paths"][0])
    assert package.parent == export_folder
    assert package.name.endswith(f"-{entry.id}.zip")
    with zipfile.ZipFile(package) as archive:
        assert {"manifest.json", "entry.json", "lineage.json"}.issubset(archive.namelist())

    package.write_bytes(b"keep existing file")
    with _client(store, picker) as client:
        response = client.post(
            f"/api/voice-collections/{collection.id}/export-selected",
            json={"entryIds": [entry.id]},
        )
    assert response.status_code == 200, response.text
    assert Path(body["paths"][0]).read_bytes() == b"keep existing file"
    assert Path(response.json()["paths"][0]) != package


def test_native_export_uses_windows_rename_when_hardlinks_are_unavailable_and_retries_conflicts(
    tmp_path: Path, monkeypatch,
):
    *_, source, _target, _root, _speaker, voice, _catalogs, _voices, _sets, _runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Archive"))
    entry = _archive_entry(store, source, voice, collection.id)
    export_folder = tmp_path / "exports"
    export_folder.mkdir()
    filename = f"voice-An-An-LoRA-{entry.id}.zip"
    original = export_folder / filename
    original.write_bytes(b"existing file must stay untouched")
    picker = FakePicker(folder=str(export_folder))
    import app.adapters.voice_collection_transfer_routes as routes

    def unsupported_link(_source, _target):
        raise OSError("hard links are unavailable on this volume")

    real_rename = routes.os.rename
    rename_calls = 0

    def race_first_rename(source_path, target_path):
        nonlocal rename_calls
        rename_calls += 1
        if rename_calls == 1:
            Path(target_path).write_bytes(b"concurrent file must stay untouched")
            raise FileExistsError(str(target_path))
        return real_rename(source_path, target_path)

    monkeypatch.setattr(routes.os, "link", unsupported_link)
    monkeypatch.setattr(routes.os, "rename", race_first_rename)
    with _client(store, picker) as client:
        response = client.post(
            f"/api/voice-collections/{collection.id}/export-selected",
            json={"entryIds": [entry.id]},
        )

    assert response.status_code == 200, response.text
    assert original.read_bytes() == b"existing file must stay untouched"
    raced = export_folder / f"{original.stem}-2{original.suffix}"
    exported = export_folder / f"{original.stem}-3{original.suffix}"
    assert raced.read_bytes() == b"concurrent file must stay untouched"
    assert Path(response.json()["paths"][0]) == exported
    with zipfile.ZipFile(exported) as archive:
        assert "entry.json" in archive.namelist()
    assert rename_calls == 2


def test_native_export_cancel_has_no_files_or_success_paths(tmp_path: Path):
    *_, source, _target, _root, _speaker, voice, _catalogs, _voices, _sets, _runs, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Archive"))
    entry = _archive_entry(store, source, voice, collection.id)
    picker = FakePicker(folder=None)

    with _client(store, picker) as client:
        response = client.post(
            f"/api/voice-collections/{collection.id}/export-selected",
            json={"entryIds": [entry.id]},
        )

    assert response.status_code == 200, response.text
    assert response.json() == {"cancelled": True, "paths": []}
    assert list(tmp_path.rglob("*.zip")) == []


def test_native_export_rolls_back_prior_files_when_batch_publish_fails(tmp_path: Path, monkeypatch):
    *_, source, _target, source_root, _speaker, voice, _catalogs, _voices, _sets, _runs, store = fixture(tmp_path)
    second_voice = voice.model_copy(update={"id": "voice-second", "name": "Second voice"})
    second_folder = source_root / "assets/voices" / second_voice.id
    second_folder.mkdir(parents=True)
    (second_folder / "voice.json").write_text(second_voice.model_dump_json(by_alias=True), encoding="utf-8")
    collection = store.create(VoiceCollectionCreate(name="Archive"))
    entries = [
        store.add_entry(collection.id, source.id, voice.id),
        store.add_entry(collection.id, source.id, second_voice.id),
    ]
    export_folder = tmp_path / "exports"
    export_folder.mkdir()
    picker = FakePicker(folder=str(export_folder))
    import app.adapters.voice_collection_transfer_routes as routes

    real_link = routes.os.link
    calls = 0

    def fail_second_link(source_path, target_path):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated publication failure")
        return real_link(source_path, target_path)

    def fail_fallback_rename(_source, _target):
        raise OSError("simulated publication failure")

    monkeypatch.setattr(routes.os, "link", fail_second_link)
    monkeypatch.setattr(routes.os, "rename", fail_fallback_rename)
    with _client(store, picker) as client:
        response = client.post(
            f"/api/voice-collections/{collection.id}/export-selected",
            json={"entryIds": [entry.id for entry in entries]},
        )

    assert response.status_code == 400
    assert "simulated publication failure" in response.json()["detail"]
    assert list(export_folder.glob("*.zip")) == []
    assert list(export_folder.glob(".pro4bro-voice-export-*")) == []


def test_native_import_returns_successes_and_reports_per_file_failures(tmp_path: Path):
    *_, source, _target, _root, _speaker, voice, _catalogs, _voices, _sets, _runs, store = fixture(tmp_path)
    source_collection = store.create(VoiceCollectionCreate(name="Source"))
    entry = _archive_entry(store, source, voice, source_collection.id)
    exported = tmp_path / "source.zip"
    from app.adapters.voice_collection_transfer import FileVoiceCollectionTransfer

    FileVoiceCollectionTransfer(store).export_entry(source_collection.id, entry.id, exported)
    bad_zip = tmp_path / "broken.zip"
    bad_zip.write_bytes(b"not a zip")
    destination = store.create(VoiceCollectionCreate(name="Destination"))
    picker = FakePicker(files=[str(bad_zip), str(exported)])

    with _client(store, picker) as client:
        response = client.post(f"/api/voice-collections/{destination.id}/entries/import-native")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cancelled"] is False
    assert len(body["entries"]) == 1
    assert body["entries"][0]["voice"]["id"] == voice.id
    assert len(body["errors"]) == 1 and "broken.zip" in body["errors"][0]
    assert picker.open_calls == 1


def test_native_import_cancel_has_no_entries_or_errors(tmp_path: Path):
    *_, store = fixture(tmp_path)
    collection = store.create(VoiceCollectionCreate(name="Archive"))
    picker = FakePicker(files=[])

    with _client(store, picker) as client:
        response = client.post(f"/api/voice-collections/{collection.id}/entries/import-native")

    assert response.status_code == 200, response.text
    assert response.json() == {"cancelled": True, "entries": [], "errors": []}
    assert picker.open_calls == 1


def test_native_import_skips_repeated_files_and_duplicate_model_artifacts(tmp_path: Path):
    *_, source, _target, _root, _speaker, voice, _catalogs, _voices, _sets, _runs, store = fixture(tmp_path)
    source_collection = store.create(VoiceCollectionCreate(name="Source"))
    entry = _archive_entry(store, source, voice, source_collection.id)
    exported = tmp_path / "source.zip"
    from app.adapters.voice_collection_transfer import FileVoiceCollectionTransfer

    FileVoiceCollectionTransfer(store).export_entry(source_collection.id, entry.id, exported)
    duplicate_export = tmp_path / "duplicate.zip"
    duplicate_export.write_bytes(exported.read_bytes())
    destination = store.create(VoiceCollectionCreate(name="Destination"))
    picker = FakePicker(files=[str(exported), str(duplicate_export)])

    with _client(store, picker) as client:
        response = client.post(f"/api/voice-collections/{destination.id}/entries/import-native")

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["entries"]) == 1
    assert body["entries"][0]["voice"]["id"] == voice.id
    assert len(body["errors"]) == 1
    assert "duplicate model package" in body["errors"][0]
    assert len(store.get(destination.id).entries) == 1


def test_embedded_windows_picker_fallback_uses_multiselect_zip_and_folder_dialogs(tmp_path: Path, monkeypatch):
    calls: list[tuple[str, str, str | None]] = []
    selected_zip = tmp_path / "voice.zip"

    def run_windows_dialog(script: str, variable: str, initial: str | None):
        calls.append((script, variable, initial))
        output = json.dumps(str(selected_zip)) if "OpenFileDialog" in script else str(tmp_path)
        return type("ProcessResult", (), {"returncode": 0, "stdout": output, "stderr": ""})()

    monkeypatch.setattr(NativeVoicePackagePicker, "_windows_command", staticmethod(run_windows_dialog))
    picker = NativeVoicePackagePicker()

    assert picker._pick_windows_zip_files(str(tmp_path)) == [str(selected_zip.resolve())]
    assert picker._choose_windows_export_folder(str(tmp_path)) == str(tmp_path.resolve())
    assert calls[0][1:] == ("PRO4BRO_VOICE_PACKAGE_INITIAL", str(tmp_path))
    assert "Multiselect = $true" in calls[0][0]
    assert "*.zip" in calls[0][0]
    assert "FolderBrowserDialog" in calls[1][0]
    assert calls[1][1:] == ("PRO4BRO_VOICE_EXPORT_INITIAL", str(tmp_path))


def test_embedded_windows_picker_fallback_treats_empty_dialog_output_as_cancel(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(
        NativeVoicePackagePicker, "_windows_command",
        staticmethod(lambda *_args: type("ProcessResult", (), {"returncode": 0, "stdout": "", "stderr": ""})()),
    )
    picker = NativeVoicePackagePicker()

    assert picker._pick_windows_zip_files(str(tmp_path)) == []
    assert picker._choose_windows_export_folder(str(tmp_path)) is None
