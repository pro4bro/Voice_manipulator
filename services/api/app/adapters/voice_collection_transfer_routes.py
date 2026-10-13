from __future__ import annotations

import os
from pathlib import Path
import re
import shutil
import tempfile
from typing import Protocol

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import Field
from starlette.background import BackgroundTask

from app.adapters import voice_collection_transfer as transfer_module
from app.adapters.file_voice_collections import FileVoiceCollections
from app.adapters.voice_collection_transfer import FileVoiceCollectionTransfer
from app.adapters.native_voice_package_picker import NativeVoicePackagePicker
from app.domain.models import DomainModel, VoiceCollectionEntry


MAX_NATIVE_PACKAGE_SELECTION = 100
_SAFE_FILENAME_PART = re.compile(r"[^A-Za-z0-9._-]+")


class NativeVoicePackagePickerPort(Protocol):
    def pick_zip_files(self, initial_path: str | None = None) -> list[str]: ...

    def choose_export_folder(self, initial_path: str | None = None) -> str | None: ...


class ExportSelectedRequest(DomainModel):
    entry_ids: list[str] = Field(min_length=1, max_length=MAX_NATIVE_PACKAGE_SELECTION)


class NativeExportResult(DomainModel):
    cancelled: bool
    paths: list[str] = Field(default_factory=list)


class NativeImportResult(DomainModel):
    cancelled: bool
    entries: list[VoiceCollectionEntry] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


def make_voice_collection_transfer_router(
    voice_collections: FileVoiceCollections,
    picker: NativeVoicePackagePickerPort | None = None,
) -> APIRouter:
    router = APIRouter(tags=["voice-collection-transfer"])
    transfer = FileVoiceCollectionTransfer(voice_collections)
    native_picker = picker or NativeVoicePackagePicker()

    @router.post(
        "/api/voice-collections/{collection_id}/export-selected",
        response_model=NativeExportResult,
    )
    def export_selected_voice_collection_entries(
        collection_id: str, payload: ExportSelectedRequest,
    ) -> NativeExportResult:
        try:
            collection = voice_collections.get(collection_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Collection not found") from exc
        if len(set(payload.entry_ids)) != len(payload.entry_ids):
            raise HTTPException(status_code=400, detail="Entry IDs must not contain duplicates.")

        entries: list[VoiceCollectionEntry] = []
        try:
            collection_entry_ids = {entry.id for entry in collection.entries}
            for entry_id in payload.entry_ids:
                if entry_id not in collection_entry_ids:
                    raise KeyError(entry_id)
                entry = voice_collections._read_entry(collection_id, entry_id)
                voice_collections._verified_entry_lineage(collection_id, entry_id, entry)
                entries.append(entry)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Collection entry not found") from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            selected_folder = native_picker.choose_export_folder(str(voice_collections.root))
        except (OSError, RuntimeError, ImportError) as exc:
            raise HTTPException(status_code=503, detail=f"Could not open destination folder picker: {exc}") from exc
        if not selected_folder:
            return NativeExportResult(cancelled=True)
        try:
            destination = Path(selected_folder).resolve(strict=True)
            if not destination.is_dir():
                raise ValueError("Selected destination is not a folder.")
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid export folder: {exc}") from exc

        stage = Path(tempfile.mkdtemp(prefix=".pro4bro-voice-export-", dir=destination))
        published: list[Path] = []
        try:
            staged: list[tuple[Path, str]] = []
            for entry in entries:
                filename = _entry_package_filename(entry)
                package = stage / filename
                transfer.export_entry(collection_id, entry.id, package)
                staged.append((package, filename))

            result_paths: list[str] = []
            for package, filename in staged:
                target = _publish_staged_package(package, destination, filename)
                published.append(target)
                result_paths.append(str(target))
            return NativeExportResult(cancelled=False, paths=result_paths)
        except Exception as exc:
            rollback_errors: list[str] = []
            for path in reversed(published):
                try:
                    path.unlink(missing_ok=True)
                except OSError as rollback_exc:
                    rollback_errors.append(f"{path.name}: {rollback_exc}")
            rollback_note = f"; rollback incomplete ({'; '.join(rollback_errors)})" if rollback_errors else ""
            raise HTTPException(status_code=400, detail=f"Voice package export failed: {exc}{rollback_note}") from exc
        finally:
            shutil.rmtree(stage, ignore_errors=True)

    @router.post(
        "/api/voice-collections/{collection_id}/entries/import-native",
        response_model=NativeImportResult,
    )
    def import_native_voice_collection_entries(collection_id: str) -> NativeImportResult:
        try:
            voice_collections.get(collection_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Collection not found") from exc
        try:
            selected_paths = native_picker.pick_zip_files(str(voice_collections.root))
        except (OSError, RuntimeError, ImportError) as exc:
            raise HTTPException(status_code=503, detail=f"Could not open ZIP file picker: {exc}") from exc
        if not selected_paths:
            return NativeImportResult(cancelled=True)
        if len(selected_paths) > MAX_NATIVE_PACKAGE_SELECTION:
            return NativeImportResult(
                cancelled=False,
                errors=[f"Select at most {MAX_NATIVE_PACKAGE_SELECTION} voice packages at a time."],
            )

        imported: list[VoiceCollectionEntry] = []
        errors: list[str] = []
        seen_paths: set[str] = set()
        seen_entries: set[str] = set()
        for raw_path in selected_paths:
            display_name = Path(raw_path).name or "Selected file"
            try:
                path = Path(raw_path).resolve(strict=True)
                path_key = os.path.normcase(str(path))
                if path_key in seen_paths:
                    errors.append(f"{display_name}: duplicate file selection was skipped.")
                    continue
                seen_paths.add(path_key)
                if not path.is_file() or path.suffix.lower() != ".zip":
                    raise ValueError("Selected file must be a ZIP package.")
                if path.stat().st_size > transfer_module.MAX_UPLOAD_BYTES:
                    raise ValueError("Voice package exceeds the upload size limit.")
                entry = transfer.import_package(collection_id, path)
                if entry.id in seen_entries:
                    errors.append(f"{display_name}: duplicate model package was skipped.")
                    continue
                seen_entries.add(entry.id)
                imported.append(entry)
            except (OSError, ValueError, KeyError) as exc:
                errors.append(f"{display_name}: {exc}")
        return NativeImportResult(cancelled=False, entries=imported, errors=errors)

    @router.get(
        "/api/voice-collections/{collection_id}/entries/{entry_id}/export",
        response_class=FileResponse,
    )
    def export_voice_collection_entry(collection_id: str, entry_id: str) -> FileResponse:
        try:
            voice_collections.get(collection_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Collection not found") from exc
        descriptor, package_name = tempfile.mkstemp(
            prefix=".voice-collection-export-", suffix=".zip", dir=voice_collections.root,
        )
        os.close(descriptor)
        package = Path(package_name)
        try:
            entry = transfer.export_entry(collection_id, entry_id, package)
            return FileResponse(
                package,
                media_type="application/zip",
                filename=f"voice-entry-{entry.id}.zip",
                background=BackgroundTask(lambda: package.unlink(missing_ok=True)),
            )
        except KeyError as exc:
            package.unlink(missing_ok=True)
            raise HTTPException(status_code=404, detail="Collection or entry not found") from exc
        except (ValueError, OSError) as exc:
            package.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post(
        "/api/voice-collections/{collection_id}/entries/import-package",
        response_model=VoiceCollectionEntry,
        status_code=status.HTTP_200_OK,
    )
    def import_voice_collection_package(
        collection_id: str,
        file: UploadFile = File(...),
    ) -> VoiceCollectionEntry:
        upload_path: Path | None = None
        try:
            voice_collections.get(collection_id)
            descriptor, upload_name = tempfile.mkstemp(
                prefix=".voice-collection-upload-", suffix=".tmp", dir=voice_collections.root,
            )
            os.close(descriptor)
            upload_path = Path(upload_name)
            total = 0
            with upload_path.open("wb") as destination:
                while chunk := file.file.read(1024 * 1024):
                    total += len(chunk)
                    if total > transfer_module.MAX_UPLOAD_BYTES:
                        raise ValueError("Voice package upload exceeds the size limit.")
                    destination.write(chunk)
            return transfer.import_package(collection_id, upload_path)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Collection not found") from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        finally:
            if upload_path is not None:
                upload_path.unlink(missing_ok=True)
            file.file.close()

    return router


def _entry_package_filename(entry: VoiceCollectionEntry) -> str:
    speaker = _safe_filename_part(entry.speaker.name, "speaker")
    voice = _safe_filename_part(entry.voice.name, "voice")
    return f"voice-{speaker}-{voice}-{entry.id}.zip"


def _safe_filename_part(value: str, fallback: str) -> str:
    cleaned = _SAFE_FILENAME_PART.sub("-", value.strip()).strip(" .-_")
    return (cleaned or fallback)[:64]


def _available_target(folder: Path, filename: str) -> Path:
    base = Path(filename).stem
    suffix = Path(filename).suffix
    candidate = folder / filename
    index = 2
    while candidate.exists():
        candidate = folder / f"{base}-{index}{suffix}"
        index += 1
    return candidate


def _publish_staged_package(package: Path, folder: Path, filename: str) -> Path:
    """Publish a complete staged ZIP atomically without replacing a file."""
    while True:
        target = _available_target(folder, filename)
        try:
            # Hard links work on NTFS and publish the completed file in one step.
            os.link(package, target)
            return target
        except FileExistsError:
            # A user or another export claimed the candidate after the check.
            continue
        except OSError:
            if os.name != "nt":
                raise
            try:
                # The staged package is on the destination volume. Windows
                # rename refuses an existing destination, unlike os.replace.
                os.rename(package, target)
                return target
            except FileExistsError:
                continue

