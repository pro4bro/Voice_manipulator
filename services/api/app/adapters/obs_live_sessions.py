"""Durable per-source OBS PCM receiver; OBS transport never waits on STT."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import secrets
import subprocess
import threading
import wave
from difflib import SequenceMatcher
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.domain.models import (
    MediaAssetCreate,
    ObsLiveEvent,
    ObsLiveGap,
    ObsLiveOpen,
    ObsLiveSession,
)
from app.domain.ports import MediaLibrary, ProjectRepository


_SESSION_ID = re.compile(r"live-[0-9a-f]{12}\Z")
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
_MAX_PCM_BYTES = 768_000  # One second, 192 kHz, two channels, PCM16.


class ObsLiveConflict(ValueError):
    pass


class FileObsLiveSessions:
    def __init__(
        self, projects: ProjectRepository, media: MediaLibrary, data_root: Path,
        ffmpeg_path: str | None,
    ) -> None:
        self.projects = projects
        self.media = media
        self.data_root = data_root
        self.ffmpeg = ffmpeg_path
        self._lock = threading.RLock()

    def pairing_token(self, project_id: str) -> str:
        self.projects.get(project_id)
        path = self.data_root / "obs-bridge" / "pairs" / f"{hashlib.sha256(project_id.encode()).hexdigest()}.token"
        with self._lock:
            if path.is_file():
                return path.read_text(encoding="ascii").strip()
            path.parent.mkdir(parents=True, exist_ok=True)
            token = secrets.token_urlsafe(32)
            self._write_bytes(path, token.encode("ascii"))
            return token

    def authorize(self, project_id: str, candidate: str | None) -> None:
        if not candidate or not secrets.compare_digest(candidate, self.pairing_token(project_id)):
            raise PermissionError("OBS plugin chưa ghép với project này.")

    def open(self, project_id: str, payload: ObsLiveOpen) -> ObsLiveSession:
        self.projects.get(project_id)
        now = datetime.now(timezone.utc)
        capture_id = payload.capture_id or f"legacy-{uuid4().hex[:12]}"
        with self._lock:
            if payload.capture_id:
                existing = next((item for item in self.list(project_id)
                                 if item.capture_id == capture_id
                                 and item.source_id == payload.source_id
                                 and item.status != "stopped"), None)
                if existing:
                    if (existing.sample_rate, existing.channels) != (payload.sample_rate, payload.channels):
                        raise ObsLiveConflict("OBS source reconnect đổi audio format giữa phiên.")
                    return existing
        session = ObsLiveSession(
            id=f"live-{uuid4().hex[:12]}", created_at=now, updated_at=now,
            obs_version=payload.obs_version, capture_id=capture_id, source_id=payload.source_id,
            source_label=payload.source_label, sample_rate=payload.sample_rate,
            channels=payload.channels, started_timestamp_ns=payload.started_timestamp_ns,
        )
        with self._lock:
            if not any(item.capture_id == capture_id and item.status != "stopped" for item in self.list(project_id)):
                self._best_effort_overlay(project_id, "")
            self._write(project_id, session)
        return session

    def overlay_path(self, project_id: str) -> Path:
        root = Path(self.projects.get(project_id).project_path).resolve()
        path = root / "cache" / "obs-live-caption.txt"
        if not path.is_file():
            with self._lock:
                if not path.is_file():
                    self._best_effort_overlay(project_id, "")
        return path

    def _write_overlay(self, project_id: str, text: str) -> None:
        path = Path(self.projects.get(project_id).project_path).resolve() / "cache" / "obs-live-caption.txt"
        self._write_bytes(path, text.encode("utf-8"))

    def _best_effort_overlay(self, project_id: str, text: str) -> None:
        try:
            self._write_overlay(project_id, text)
        except OSError:
            logging.getLogger(__name__).warning("OBS caption file unavailable; audio capture continues", exc_info=True)

    def _refresh_overlay(self, project_id: str, capture_id: str) -> None:
        active = [item for item in self.list(project_id)
                  if item.capture_id == capture_id and item.status == "recording"
                  and item.live_stt_status in {"live", "listening", "transcribing"}]
        lines = []
        for item in sorted(active, key=lambda source: source.source_id)[:3]:
            spoken = " ".join(part for part in (item.live_text, item.live_pending) if part).strip()
            if spoken:
                label = " ".join(item.source_label.split())[:40]
                lines.append(f"{label}: {' '.join(spoken.split())[-180:]}")
        self._best_effort_overlay(project_id, "[LIVE DRAFT]\n" + "\n".join(lines) if lines else "")

    def update_live_stt(
        self, project_id: str, session_id: str, *, status: str,
        text: str | None = None, pending: str | None = None,
        error: str | None = None, lag_seconds: float | None = None,
    ) -> ObsLiveSession:
        with self._lock:
            session = self._read(project_id, session_id)
            changes: dict[str, object] = {
                "live_stt_status": status, "live_stt_error": error,
                "updated_at": datetime.now(timezone.utc),
            }
            if text is not None:
                changes["live_text"] = text
            if pending is not None:
                changes["live_pending"] = pending
            if lag_seconds is not None:
                changes["live_stt_lag_seconds"] = max(0.0, lag_seconds)
            updated = session.model_copy(update=changes)
            self._write(project_id, updated)
            self._refresh_overlay(project_id, updated.capture_id)
            return updated

    def get(self, project_id: str, session_id: str) -> ObsLiveSession:
        with self._lock:
            return self._read(project_id, session_id)

    def caption_quality(self, project_id: str, session_id: str) -> dict[str, object]:
        session = self.get(project_id, session_id)
        result: dict[str, object] = {"sessionId": session.id, "finalAvailable": False,
                                     "mismatchPercent": None, "liveWords": 0, "finalWords": 0}
        if not session.asset_id or not session.live_text.strip():
            return result
        asset = self.media.get(project_id, session.asset_id)
        if asset.transcription_status != "complete" or not asset.text.strip():
            return result
        live_words = session.live_text.casefold().split()
        final_words = asset.text.casefold().split()
        # A sequence comparison is a quick draft/final estimate, not a timed WER.
        ratio = SequenceMatcher(None, live_words, final_words, autojunk=False).ratio()
        return {"sessionId": session.id, "finalAvailable": True,
                "mismatchPercent": round((1 - ratio) * 100, 1),
                "liveWords": len(live_words), "finalWords": len(final_words)}

    def list(self, project_id: str) -> list[ObsLiveSession]:
        root = self._root(project_id)
        return sorted(
            (self._read(project_id, path.parent.name) for path in root.glob("*/session.json")),
            key=lambda item: item.created_at, reverse=True,
        )

    def chunk(
        self, project_id: str, session_id: str, sequence: int,
        timestamp_ns: int, frames: int, digest: str, data: bytes,
    ) -> ObsLiveSession:
        if sequence < 0 or timestamp_ns < 0 or not _SHA256.fullmatch(digest):
            raise ValueError("OBS chunk metadata không hợp lệ.")
        if len(data) > _MAX_PCM_BYTES or not secrets.compare_digest(hashlib.sha256(data).hexdigest(), digest):
            raise ValueError("OBS chunk vượt giới hạn hoặc sai SHA-256.")
        with self._lock:
            session = self._read(project_id, session_id)
            if frames < 1 or frames > session.sample_rate or len(data) != frames * session.channels * 2:
                raise ValueError("OBS chunk không khớp PCM16/sample rate/channel count.")
            folder = self._folder(project_id, session_id) / "chunks"
            pcm_path = folder / f"{sequence:012d}.pcm"
            metadata_path = folder / f"{sequence:012d}.json"
            metadata = {"sequence": sequence, "timestampNs": timestamp_ns,
                        "frames": frames, "sha256": digest}
            if sequence <= session.last_sequence:
                if metadata_path.is_file() and json.loads(metadata_path.read_text(encoding="utf-8")) == metadata:
                    return session
                raise ObsLiveConflict("OBS sequence đã được ghi với dữ liệu khác.")
            if session.status != "recording":
                raise ObsLiveConflict("OBS session không ở trạng thái recording.")
            if pcm_path.exists() and hashlib.sha256(pcm_path.read_bytes()).hexdigest() != digest:
                raise ObsLiveConflict("OBS chunk trên đĩa có nội dung khác.")
            if metadata_path.is_file() and json.loads(metadata_path.read_text(encoding="utf-8")) != metadata:
                raise ObsLiveConflict("OBS chunk metadata trên đĩa có nội dung khác.")
            if not pcm_path.exists():
                self._write_bytes(pcm_path, data)
            self._write_json(metadata_path, metadata)
            gaps = list(session.gaps)
            if sequence > session.last_sequence + 1:
                if not any(gap.first_sequence == session.last_sequence + 1
                           and gap.last_sequence == sequence - 1 for gap in gaps):
                    gaps.append(ObsLiveGap(first_sequence=session.last_sequence + 1,
                                           last_sequence=sequence - 1, missing_frames=0))
            updated = session.model_copy(update={
                "last_sequence": sequence, "frames_received": session.frames_received + frames,
                "bytes_received": session.bytes_received + len(data), "gaps": gaps,
                "updated_at": datetime.now(timezone.utc),
            })
            self._write(project_id, updated)
            return updated

    def event(self, project_id: str, session_id: str, event: ObsLiveEvent) -> ObsLiveSession:
        with self._lock:
            session = self._read(project_id, session_id)
            event_path = self._folder(project_id, session_id) / "events" / f"{event.sequence:012d}.json"
            serialized = event.model_dump(by_alias=True)
            if event.sequence <= session.last_event_sequence:
                if not event_path.is_file() or json.loads(event_path.read_text(encoding="utf-8")) != serialized:
                    raise ObsLiveConflict("OBS event sequence đã dùng cho sự kiện khác.")
                if event.kind == "stopped" and session.status != "stopped":
                    stopped = self._finalize(project_id, session)
                    self._refresh_overlay(project_id, stopped.capture_id)
                    return stopped
                return session
            if event.sequence != session.last_event_sequence + 1:
                raise ObsLiveConflict("OBS event không liên tục; gửi lại sự kiện còn thiếu.")
            if session.status == "stopped":
                raise ObsLiveConflict("OBS session đã dừng.")
            if event.kind == "gap" and (event.first_sequence is None or event.last_sequence is None
                                         or event.last_sequence < event.first_sequence):
                raise ValueError("Gap cần firstSequence và lastSequence hợp lệ.")
            self._write_json(event_path, serialized)
            gaps = list(session.gaps)
            if event.kind == "gap":
                found = next((index for index, gap in enumerate(gaps)
                              if gap.first_sequence == event.first_sequence
                              and gap.last_sequence == event.last_sequence), None)
                gap = ObsLiveGap(first_sequence=event.first_sequence,
                                 last_sequence=event.last_sequence, missing_frames=event.missing_frames)
                if found is None:
                    gaps.append(gap)
                else:
                    gaps[found] = gap
            status = {"paused": "paused", "unpaused": "recording", "gap": session.status,
                      "stopped": session.status}[event.kind]
            live_status = {"paused": "paused", "unpaused": "listening", "gap": session.live_stt_status,
                           "stopped": session.live_stt_status}[event.kind]
            updated = session.model_copy(update={
                "last_event_sequence": event.sequence, "gaps": gaps, "status": status,
                "live_stt_status": live_status,
                "updated_at": datetime.now(timezone.utc),
            })
            self._write(project_id, updated)
            self._refresh_overlay(project_id, updated.capture_id)
            if event.kind == "stopped":
                stopped = self._finalize(project_id, updated)
                self._refresh_overlay(project_id, stopped.capture_id)
                return stopped
            return updated

    def _finalize(self, project_id: str, session: ObsLiveSession) -> ObsLiveSession:
        folder = self._folder(project_id, session.id)
        metadata_paths = sorted((folder / "chunks").glob("*.json"))
        root = Path(self.projects.get(project_id).project_path).resolve()
        asset_id = f"asset-{session.id.removeprefix('live-')}"
        asset_folder = root / "assets" / "media" / asset_id
        asset_folder.mkdir(parents=True, exist_ok=True)
        stem_path = asset_folder / "source.wav"
        analysis_path = asset_folder / "analysis.wav"
        if not metadata_paths:
            stopped = session.model_copy(update={"status": "stopped", "live_stt_status": "stopped",
                                                 "updated_at": datetime.now(timezone.utc)})
            self._write(project_id, stopped)
            return stopped
        metadata = [json.loads(path.read_text(encoding="utf-8")) for path in metadata_paths]
        gap_frames = {(gap.first_sequence, gap.last_sequence): gap.missing_frames for gap in session.gaps}
        timing_complete = True
        total_frames = 0
        temporary = stem_path.with_suffix(".wav.part")
        with wave.open(str(temporary), "wb") as output:
            output.setnchannels(session.channels)
            output.setsampwidth(2)
            output.setframerate(session.sample_rate)
            expected = 0
            for item in metadata:
                sequence = int(item["sequence"])
                if sequence > expected:
                    missing = gap_frames.get((expected, sequence - 1), 0)
                    if missing:
                        output.writeframes(b"\0" * missing * session.channels * 2)
                        total_frames += missing
                    else:
                        timing_complete = False
                data = (folder / "chunks" / f"{sequence:012d}.pcm").read_bytes()
                output.writeframes(data)
                total_frames += int(item["frames"])
                expected = sequence + 1
        temporary.replace(stem_path)
        if self.ffmpeg:
            result = subprocess.run([
                self.ffmpeg, "-y", "-nostdin", "-v", "error", "-i", str(stem_path),
                "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(analysis_path),
            ], capture_output=True, text=True, encoding="utf-8", errors="replace",
               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if result.returncode:
                raise RuntimeError(result.stderr.strip() or "Không tạo được OBS analysis WAV.")
            try:
                self.media.get(project_id, asset_id)
            except KeyError:
                self.media.create(project_id, MediaAssetCreate(
                    name=f"OBS live · {session.source_label}", source_extension=".wav",
                    media_kind="audio", source_path=stem_path.relative_to(root).as_posix(),
                    analysis_path=analysis_path.relative_to(root).as_posix(),
                    duration=total_frames / session.sample_rate,
                    sample_rate=session.sample_rate, audio_codec="pcm_s16le",
                    origin="record", transcription_status="skipped",
                ), asset_id)
        stopped = session.model_copy(update={
            "status": "stopped", "stem_path": stem_path.relative_to(root).as_posix(),
            "analysis_path": analysis_path.relative_to(root).as_posix() if analysis_path.is_file() else None,
            "asset_id": asset_id if analysis_path.is_file() else None,
            "timing_complete": timing_complete,
            "live_stt_status": "stopped",
            "updated_at": datetime.now(timezone.utc),
        })
        self._write(project_id, stopped)
        return stopped

    def _root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path).resolve() / "assets" / "obs-live"

    def _folder(self, project_id: str, session_id: str) -> Path:
        if not _SESSION_ID.fullmatch(session_id):
            raise KeyError(session_id)
        return self._root(project_id) / session_id

    def _read(self, project_id: str, session_id: str) -> ObsLiveSession:
        path = self._folder(project_id, session_id) / "session.json"
        if not path.is_file():
            raise KeyError(session_id)
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload.setdefault("captureId", f"legacy-{session_id}")
        return ObsLiveSession.model_validate(payload)

    def _write(self, project_id: str, session: ObsLiveSession) -> None:
        self._write_bytes(self._folder(project_id, session.id) / "session.json",
                          session.model_dump_json(by_alias=True, indent=2).encode("utf-8"))

    def _write_json(self, path: Path, value: dict) -> None:
        self._write_bytes(path, json.dumps(value, separators=(",", ":")).encode("utf-8"))

    @staticmethod
    def _write_bytes(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".part")
        with temporary.open("wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)
