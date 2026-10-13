"""Project-owned recycle and permanent deletion for OBS recording journals."""

from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.adapters.obs_livelink_deletions import deleted_recording_ids, mark_recording_deleted
from app.adapters.obs_livelink_audio import FileObsLiveLinkAudio
from app.adapters.obs_livelink_detailed_stt import ObsLiveLinkDetailedStt
from app.adapters.obs_livelink_runtime import ObsLiveLinkRuntime
from app.domain.ports import MediaLibrary, ProjectRepository


def _recording_folder(projects: ProjectRepository, project_id: str,
                      recording_id: str) -> tuple[Path, Path, Path]:
    try:
        UUID(recording_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid OBS recording ID.") from exc
    try:
        project = projects.get(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found.") from exc
    root = Path(project.project_path).resolve(strict=True)
    obs_root = root / "assets" / "obs-livelink"
    folder = obs_root / recording_id
    # Resolve before any read, write, or recursive delete. The project-owned
    # journal tree may contain PCM that must never escape the project boundary.
    resolved_obs = obs_root.resolve(strict=False)
    resolved_folder = folder.resolve(strict=False)
    if not resolved_obs.is_relative_to(root) or not resolved_folder.is_relative_to(resolved_obs):
        raise HTTPException(status_code=400, detail="OBS recording path escapes its project folder.")
    marker = obs_root / "deleted-recordings.json"
    if marker.is_symlink() or not marker.resolve(strict=False).is_relative_to(resolved_obs):
        raise HTTPException(status_code=400, detail="OBS deletion marker path escapes its project folder.")
    try:
        if recording_id in deleted_recording_ids(root):
            raise HTTPException(status_code=404, detail="OBS recording was permanently deleted.")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="OBS deletion marker is invalid.") from exc
    if folder.is_symlink() or obs_root.is_symlink():
        raise HTTPException(status_code=400, detail="OBS recording path cannot be a symlink.")
    journal_path = folder / "recording.json"
    if journal_path.is_symlink() or not journal_path.is_file():
        raise HTTPException(status_code=404, detail="OBS recording journal not found.")
    try:
        journal_resolved = journal_path.resolve(strict=True)
    except OSError as exc:
        raise HTTPException(status_code=404, detail="OBS recording journal not found.") from exc
    if not journal_resolved.is_relative_to(resolved_folder):
        raise HTTPException(status_code=400, detail="OBS journal escapes its recording folder.")
    return root, folder, journal_path


def _read_journal(path: Path, project_id: str, recording_id: str) -> dict:
    try:
        journal = json.loads(path.read_text(encoding="utf-8"))
        recording = journal["recording"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=409, detail="OBS recording journal is invalid.") from exc
    if recording.get("recordingId") != recording_id or recording.get("projectId") != project_id:
        raise HTTPException(status_code=404, detail="OBS recording does not belong to this project.")
    return journal


def _write_journal(path: Path, journal: dict) -> None:
    temporary = path.with_name(path.name + ".part")
    parent = path.parent.resolve(strict=True)
    if temporary.is_symlink() or not temporary.resolve(strict=False).is_relative_to(parent):
        raise HTTPException(status_code=400, detail="OBS journal staging path escapes its recording folder.")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as output:
            json.dump(journal, output, ensure_ascii=False, indent=2)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def make_obs_recording_management_router(
    projects: ProjectRepository,
    obs_livelink_runtime: ObsLiveLinkRuntime,
    media: MediaLibrary,
    detailed_stt: ObsLiveLinkDetailedStt,
    audio: FileObsLiveLinkAudio,
) -> APIRouter:
    """Create endpoints for reversible recycle and confirmed permanent removal."""
    router = APIRouter()
    prefix = "/api/projects/{project_id}/obs-livelink/recordings/{recording_id}"

    def _stopped(project_id: str, recording_id: str, recording: dict,
                 *, recycled: bool = False) -> None:
        state = obs_livelink_runtime._state
        if ((state and state.recording and state.recording.recording_id == recording_id)
                or recording.get("status") != "stopped"):
            raise HTTPException(status_code=409, detail="An active OBS recording cannot be removed.")
        if recording.get("archiveStatus") == "pending":
            raise HTTPException(status_code=409, detail="OBS archive finalization is still pending.")
        processing_lock = detailed_stt._locks.get(recording_id)
        if (processing_lock is not None and processing_lock.locked()) or any(
                key[0] == recording_id for key in detailed_stt._active):
            raise HTTPException(status_code=409, detail="OBS detailed STT must finish before removal.")
        # A recycled journal is deliberately rejected by status()/process_once.
        # Its active task and whole-pass lock were checked above, so status is
        # only needed for an in-view journal where its validation is meaningful.
        if not recycled:
            try:
                project = projects.get(project_id)
                stt = detailed_stt.status(project, recording_id)
            except FileNotFoundError:
                stt = None
            except (OSError, ValueError, KeyError) as exc:
                raise HTTPException(status_code=409, detail="OBS detailed STT state cannot be verified.") from exc
            if stt and stt.get("active"):
                raise HTTPException(status_code=409, detail="OBS detailed STT must finish before removal.")

    def _require_pending_footage(project_id: str, recording_id: str) -> None:
        if any(asset.obs_recording_id == recording_id for asset in media.list_metadata(project_id)):
            raise HTTPException(status_code=409, detail="Manage published OBS footage from its Media Pool row.")

    @router.post(prefix + "/recycle")
    def recycle(project_id: str, recording_id: str) -> dict:
        root, folder, journal_path = _recording_folder(projects, project_id, recording_id)
        lock = audio._recording_lock(recording_id)
        if not lock.acquire(blocking=False):
            raise HTTPException(status_code=409, detail="OBS archive finalization is still running.")
        try:
            with obs_livelink_runtime._lock:
                _require_pending_footage(project_id, recording_id)
                journal = _read_journal(journal_path, project_id, recording_id)
                recording = journal["recording"]
                _stopped(project_id, recording_id, recording,
                         recycled=bool(journal.get("deletedAt")))
                deleted_at = recording.get("deletedAt", journal.get("deletedAt"))
                if deleted_at:
                    raise HTTPException(status_code=409, detail="OBS recording is already in the Recycle Bin.")
                deleted_at = datetime.now(timezone.utc).isoformat()
                journal["deletedAt"] = deleted_at
                _write_journal(journal_path, journal)
                return {"recordingId": recording_id, "deletedAt": deleted_at}
        finally:
            lock.release()

    @router.post(prefix + "/restore")
    def restore(project_id: str, recording_id: str) -> dict:
        _, _, journal_path = _recording_folder(projects, project_id, recording_id)
        lock = audio._recording_lock(recording_id)
        if not lock.acquire(blocking=False):
            raise HTTPException(status_code=409, detail="OBS archive finalization is still running.")
        try:
            with obs_livelink_runtime._lock:
                _require_pending_footage(project_id, recording_id)
                journal = _read_journal(journal_path, project_id, recording_id)
                _stopped(project_id, recording_id, journal["recording"],
                         recycled=bool(journal.get("deletedAt")))
                if not journal.get("deletedAt"):
                    raise HTTPException(status_code=409, detail="OBS recording is not in the Recycle Bin.")
                journal.pop("deletedAt", None)
                _write_journal(journal_path, journal)
                return {"recordingId": recording_id, "deletedAt": None}
        finally:
            lock.release()

    @router.delete(prefix)
    def delete_permanently(project_id: str, recording_id: str) -> dict:
        root, folder, journal_path = _recording_folder(projects, project_id, recording_id)
        lock = audio._recording_lock(recording_id)
        if not lock.acquire(blocking=False):
            raise HTTPException(status_code=409, detail="OBS archive finalization is still running.")
        try:
            with obs_livelink_runtime._lock:
                _require_pending_footage(project_id, recording_id)
                journal = _read_journal(journal_path, project_id, recording_id)
                _stopped(project_id, recording_id, journal["recording"],
                         recycled=bool(journal.get("deletedAt")))
                if not journal.get("deletedAt"):
                    raise HTTPException(status_code=409, detail="Move this OBS recording to the Recycle Bin first.")
                # Validate again at the deletion boundary and fence stale native
                # outbox recovery before removing project-owned retained PCM.
                if folder.is_symlink() or not folder.resolve(strict=True).is_relative_to(
                        (root / "assets" / "obs-livelink").resolve(strict=True)):
                    raise HTTPException(status_code=400, detail="OBS recording path escapes its project folder.")
                marker = root / "assets" / "obs-livelink" / "deleted-recordings.json"
                marker_part = marker.with_name(marker.name + ".part")
                obs_root = marker.parent.resolve(strict=True)
                if (marker.is_symlink() or marker_part.is_symlink()
                        or not marker.resolve(strict=False).is_relative_to(obs_root)
                        or not marker_part.resolve(strict=False).is_relative_to(obs_root)):
                    raise HTTPException(status_code=400, detail="OBS deletion marker path escapes its project folder.")
                mark_recording_deleted(root, recording_id)
                shutil.rmtree(folder)
                return {"recordingId": recording_id, "deletedAt": journal["deletedAt"]}
        finally:
            lock.release()

    return router
