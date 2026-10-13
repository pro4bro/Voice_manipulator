from __future__ import annotations

import os
from pathlib import Path
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.adapters import voice_collection_transfer as transfer_module
from app.adapters.file_voice_collections import FileVoiceCollections
from app.adapters.voice_collection_transfer import FileVoiceCollectionTransfer
from app.domain.models import VoiceCollectionEntry


def make_voice_collection_transfer_router(voice_collections: FileVoiceCollections) -> APIRouter:
    router = APIRouter(tags=["voice-collection-transfer"])
    transfer = FileVoiceCollectionTransfer(voice_collections)

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

