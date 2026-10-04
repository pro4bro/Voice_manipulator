"""Scoped recovery of the paired native spool without consuming source PCM."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import zipfile
from contextlib import contextmanager
from pathlib import Path
from uuid import UUID, uuid4

from app.adapters.obs_livelink_connection import LiveLinkError
from app.adapters.obs_livelink_deletions import deleted_recording_ids
from app.domain.obs_livelink_state import ObsCaptureRecording


class ObsLiveLinkOutbox:
    MAX_ROWS = 10_000
    MAX_BYTES = 256 * 1024 * 1024
    MAX_ROW_BYTES = 32 * 1024 * 1024

    def __init__(self, audio) -> None:
        self.audio = audio
        self.path = audio.connection.pairing_file.parent / "livelink-pcm-spool.sqlite3"

    @contextmanager
    def _scope(self, project_id: str, recording_id: str):
        try:
            UUID(recording_id)
        except ValueError as exc:
            raise LiveLinkError("Invalid OBS recording ID.", 422) from exc
        with self.audio._recording_lock(recording_id):
            with self.audio.runtime._lock:
                root = Path(self.audio.projects.get(project_id).project_path).resolve()
                if recording_id in deleted_recording_ids(root):
                    raise LiveLinkError("OBS recording was permanently deleted.", 404)
                journal_path = root / "assets" / "obs-livelink" / recording_id / "recording.json"
                if not journal_path.resolve().is_relative_to(root):
                    raise LiveLinkError("OBS journal is outside its project.", 422)
                try:
                    journal = json.loads(journal_path.read_text(encoding="utf-8"))
                    recording = ObsCaptureRecording.model_validate(journal["recording"])
                except FileNotFoundError as exc:
                    raise LiveLinkError("OBS recording journal is missing.", 404) from exc
                except (ValueError, KeyError) as exc:
                    raise LiveLinkError("OBS recording journal is invalid.", 422) from exc
                if recording.project_id != project_id or recording.recording_id != recording_id:
                    raise LiveLinkError("OBS recording does not belong to this project.", 403)
                if recording.status != "stopped" or recording.ended_monotonic_ns is None:
                    raise LiveLinkError("Stop the OBS recording before recovering its outbox.", 409)
            yield root, journal

    @contextmanager
    def _database(self, *, write=False):
        if not self.path.is_file():
            raise LiveLinkError("Native OBS outbox is unavailable.", 503)
        db = None
        try:
            db = sqlite3.connect(self.path.resolve().as_uri() + ("?mode=rw" if write else "?mode=ro"),
                                 uri=True, timeout=2)
            db.row_factory = sqlite3.Row
            if write:
                db.execute("PRAGMA synchronous=FULL")
            db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield db
            if write:
                db.commit()
        except sqlite3.Error as exc:
            raise LiveLinkError(f"Native outbox recovery failed: {exc}", 503) from exc
        finally:
            if db is not None:
                db.close()  # rolls back uncommitted changes/read snapshots

    def _rows(self, db, recording_id, *, rejected=False):
        where = " AND rejected_status IS NOT NULL" if rejected else ""
        count, size, largest = db.execute(
            "SELECT count(*), coalesce(sum(length(pcm)),0), coalesce(max(length(pcm)),0) "
            "FROM chunks WHERE recording_id=?" + where, (recording_id,)).fetchone()
        if count > self.MAX_ROWS or size > self.MAX_BYTES or largest > self.MAX_ROW_BYTES:
            raise LiveLinkError("Outbox recovery exceeds the bounded export limit; original PCM is retained.", 413)
        columns = {row[1] for row in db.execute("PRAGMA table_info(chunks)")}
        timestamp = "enqueued_wall_ms" if "enqueued_wall_ms" in columns else "NULL AS enqueued_wall_ms"
        return db.execute("SELECT id, recording_id, channel_id, sequence, source_uuid, first_sample_index, "
                          "obs_timestamp_ns, plugin_monotonic_ns, frames, sample_rate, channels, "
                          "rejected_status, " + timestamp + ", pcm FROM chunks WHERE recording_id=?" +
                          where + " ORDER BY id", (recording_id,))

    @staticmethod
    def _metadata(row):
        value = dict(row)
        pcm = value.pop("pcm")
        value.update(pcmBytes=len(pcm), pcmSha256=hashlib.sha256(pcm).hexdigest())
        return value, pcm

    def _rejected_snapshot(self, db, recording_id):
        digest = hashlib.sha256()
        count = 0
        for row in self._rows(db, recording_id, rejected=True):
            metadata, _ = self._metadata(row)
            digest.update(json.dumps(metadata, sort_keys=True, separators=(",", ":")).encode())
            count += 1
        return {"recordingId": recording_id, "rejectedChunks": count, "rejectedDigest": digest.hexdigest()}

    def snapshot(self, project_id, recording_id):
        with self._scope(project_id, recording_id), self._database() as db:
            result = self._rejected_snapshot(db, recording_id)
            result["retainedChunks"] = db.execute("SELECT count(*) FROM chunks WHERE recording_id=?",
                                                (recording_id,)).fetchone()[0]
            return result

    def retry(self, project_id, recording_id, expected_digest):
        if not isinstance(expected_digest, str) or len(expected_digest) != 64:
            raise LiveLinkError("Read the scoped outbox snapshot before retrying.", 422)
        with self._scope(project_id, recording_id), self._database(write=True) as db:
            snapshot = self._rejected_snapshot(db, recording_id)
            if snapshot["rejectedDigest"] != expected_digest:
                raise LiveLinkError("Rejected PCM changed; refresh its snapshot before retrying.", 409)
            db.execute("UPDATE chunks SET rejected_status=NULL WHERE recording_id=? AND rejected_status IS NOT NULL",
                       (recording_id,))
            return {"recordingId": recording_id, "retriedChunks": snapshot["rejectedChunks"],
                    "durablyAccepted": False}

    def export(self, project_id, recording_id):
        with self._scope(project_id, recording_id) as (root, journal), self._database() as db:
            rows = self._rows(db, recording_id)
            folder = root / "exports" / "obs-outbox"
            if not folder.resolve().is_relative_to(root):
                raise LiveLinkError("Recovery export folder is outside its project.", 422)
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / f"{recording_id}--{uuid4().hex}.zip"
            staging = target.with_suffix(".zip.part")
            try:
                manifest = []
                with zipfile.ZipFile(staging, "w", compression=zipfile.ZIP_STORED) as archive:
                    for row in rows:
                        metadata, pcm = self._metadata(row)
                        metadata["pcmEntry"] = f"pcm/{row['id']}.pcm"
                        archive.writestr(metadata["pcmEntry"], pcm)
                        manifest.append(metadata)
                    if not manifest:
                        raise LiveLinkError("No retained PCM exists for this recording.", 409)
                    archive.writestr("manifest.json", json.dumps({"version": 1, "projectId": project_id,
                        "recordingId": recording_id, "pcmFormat": "s16le", "chunks": manifest,
                        "sourceJournal": journal}, ensure_ascii=False, indent=2).encode("utf-8"))
                with staging.open("rb+") as output:
                    os.fsync(output.fileno())
                os.replace(staging, target)
                return target
            finally:
                staging.unlink(missing_ok=True)
