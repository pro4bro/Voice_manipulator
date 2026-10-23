from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import tempfile
import threading
import time
import wave
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.adapters.activity_center import CENTER
from app.domain.output_timing_repair import (
    OutputTimingRepairApplyRequest,
    OutputTimingRepairJob,
    OutputTimingRepairStartRequest,
)
from app.domain.script_word_alignment import WORD_TIMING_VERSION, align_script_words


_ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
_OUTPUT_ID = re.compile(r"^output-[A-Za-z0-9_-]{1,100}$")
_RATE = 24000
_WIDTH = 2
_MAX_SECONDS = 600
_ROUNDING_TOLERANCE_FRAMES = 12


class OutputTimingRepairConflict(ValueError):
    """The output, proposal, or job changed after the user reviewed the plan."""


@dataclass
class _Capture:
    output: Any
    audio_path: Path
    audio_sha256: str
    metadata_sha256: str
    recognizer: dict[str, Any]
    timing_policy_version: int
    frames: int
    segments: list[dict[str, Any]]
    blockers: list[str] = field(default_factory=list)
    key: str = ""


@dataclass
class _Running:
    job: OutputTimingRepairJob
    cancel_event: threading.Event = field(default_factory=threading.Event)
    active_request_id: str | None = None
    lock: threading.RLock = field(default_factory=threading.RLock)


class OutputTimingRepair:
    """Measure existing Voice Output audio against its saved Script words."""

    _lock = threading.RLock()
    _timing_policy_version = WORD_TIMING_VERSION

    def __init__(self, projects, outputs, recognizer, lease) -> None:
        self.projects, self.outputs = projects, outputs
        self.recognizer, self.lease = recognizer, lease
        self._running: dict[str, _Running] = {}
        self._threads: dict[str, threading.Thread] = {}
        self._job_io_lock = threading.RLock()

    def _root(self, project_id: str) -> Path:
        return Path(self.projects.get(project_id).project_path).resolve()

    def _contained(self, project_id: str, path: Path) -> Path:
        root, resolved = self._root(project_id), path.resolve()
        if root != resolved and root not in resolved.parents:
            raise ValueError("Timing Repair path escapes its project.")
        return resolved

    @staticmethod
    def _sha(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    @staticmethod
    def _hash_json(value: Any) -> str:
        payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @classmethod
    def _metadata_sha(cls, output) -> str:
        return cls._hash_json(output.model_dump(mode="json", by_alias=True, exclude={"audio_available"}))

    def _recognizer_identity(self) -> dict[str, Any]:
        if self.recognizer is None:
            return {"engine": None, "model": None}
        recognizer_type = type(self.recognizer)
        model = getattr(self.recognizer, "model", None)
        return {"engine": f"{recognizer_type.__module__}.{recognizer_type.__qualname__}",
            "model": model if isinstance(model, str) else None}

    def job_path(self, project_id: str, job_id: str) -> Path:
        if not _ID.fullmatch(job_id):
            raise KeyError(job_id)
        return self._contained(project_id, self._root(project_id) / "jobs" / "output-timing-repair" / f"{job_id}.json")

    def proposal_path(self, project_id: str, job_id: str) -> Path:
        if not _ID.fullmatch(job_id):
            raise KeyError(job_id)
        return self._contained(project_id, self._root(project_id) / "jobs" / "output-timing-repair" / job_id / "proposal.json")

    def applied_path(self, project_id: str, job_id: str) -> Path:
        if not _ID.fullmatch(job_id):
            raise KeyError(job_id)
        return self._contained(project_id, self._root(project_id) / "jobs" / "output-timing-repair" / "applied" / f"{job_id}.json")

    def _capture(self, project_id: str, output_id: str) -> _Capture:
        if not _OUTPUT_ID.fullmatch(output_id):
            raise KeyError(output_id)
        root = self._root(project_id)
        output = self.outputs.get(project_id, output_id)
        if output.id != output_id:
            raise ValueError("Voice Output id does not match its project record.")
        audio_path = self._contained(project_id, self.outputs.audio_path(project_id, output_id))
        if not audio_path.is_file() or audio_path.stat().st_size == 0:
            raise ValueError("Voice Output audio is missing or empty.")
        audio_sha = self._sha(audio_path)
        metadata_sha = self._metadata_sha(output)
        blockers: list[str] = []
        frames = 0
        try:
            with wave.open(str(audio_path), "rb") as wav:
                geometry = (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype())
                frames = wav.getnframes()
                if geometry != (1, _WIDTH, _RATE, "NONE"):
                    blockers.append("Timing Repair requires PCM16 mono 24 kHz Voice Output audio.")
                if frames <= 0:
                    blockers.append("Voice Output has no audio frames.")
                if frames > _MAX_SECONDS * _RATE:
                    blockers.append("Voice Output exceeds the 600 second Timing Repair limit.")
        except (wave.Error, EOFError) as exc:
            blockers.append(f"Voice Output WAV cannot be read: {exc}")

        segments: list[dict[str, Any]] = []
        if not output.segments:
            blockers.append("Voice Output has no saved Script segments to align.")
        previous_end = 0
        seen_rows: set[str] = set()
        for index, segment in enumerate(output.segments):
            try:
                start_seconds, end_seconds = float(segment.start), float(segment.end)
                if not math.isfinite(start_seconds) or not math.isfinite(end_seconds):
                    raise ValueError("nonfinite bounds")
                start_frame, end_frame = round(start_seconds * _RATE), round(end_seconds * _RATE)
            except (TypeError, ValueError, OverflowError):
                blockers.append(f"Segment {index + 1} has invalid frame geometry.")
                continue
            if end_frame > frames and end_frame - frames <= _ROUNDING_TOLERANCE_FRAMES:
                # Voice Output stores segment bounds to milliseconds while its
                # WAV remains sample-exact; reconcile only that known rounding.
                end_frame = frames
            if start_frame < 0 or end_frame <= start_frame or end_frame > frames:
                blockers.append(f"Segment {index + 1} falls outside the saved output audio.")
            if index and start_frame < previous_end:
                blockers.append(f"Segment {index + 1} overlaps the preceding segment.")
            previous_end = max(previous_end, end_frame)
            if segment.row_id in seen_rows:
                blockers.append(f"Script row {segment.row_id} appears in more than one segment.")
            seen_rows.add(segment.row_id)
            text = segment.text.strip()
            if not text:
                blockers.append(f"Segment {index + 1} has no saved Script text.")
            generator_params = (output.parameters.get("generators") or {}).get(segment.generator_id) or {}
            language = generator_params.get("language")
            segments.append({
                "index": index,
                "rowId": segment.row_id,
                "speakerProfileId": segment.speaker_profile_id,
                "text": segment.text,
                "startFrame": start_frame,
                "endFrame": end_frame,
                "language": language,
            })
        material = {
            "strategy": "studio-dtw-script-mapping-v1",
            "recognizer": self._recognizer_identity(),
            "wordTimingVersion": self._timing_policy_version,
            "sourceOutputId": output.id,
            "sourceAudioSha256": audio_sha,
            "sourceMetadataSha256": metadata_sha,
            "sampleRate": _RATE,
            "frames": frames,
            "segments": segments,
        }
        return _Capture(output, audio_path, audio_sha, metadata_sha, self._recognizer_identity(),
            self._timing_policy_version, frames, segments, blockers,
            self._hash_json(material))

    def _availability_blockers(self, capture: _Capture) -> list[str]:
        blockers = list(capture.blockers)
        if self.recognizer is None:
            blockers.append("Speech to Text is unavailable; Timing Repair cannot measure audio.")
        if self.lease is None:
            blockers.append("GPU lease service is unavailable.")
        elif self.lease.holder() is not None:
            blockers.append("GPU is busy; retry Timing Repair when the current job finishes.")
        return blockers

    @staticmethod
    def _activity_id(job: OutputTimingRepairJob) -> str:
        return f"alignment:{job.id}"

    def _start_activity(self, job: OutputTimingRepairJob, output_name: str) -> None:
        label = f"{output_name} — Output Timing Repair"
        CENTER.start_task("alignment", label, task_id=self._activity_id(job), detail="Queued output timing repair",
            fraction=0.0, project_id=job.project_id, group_label=label, status="queued")

    def _sync_activity(self, job: OutputTimingRepairJob) -> None:
        task_id = self._activity_id(job)
        if job.status in {"complete", "cancelled", "failed", "stale"}:
            status = "complete" if job.status == "complete" else "cancelled" if job.status == "cancelled" else "failed"
            detail = "Timing proposal published and validated" if status == "complete" else job.error or job.stale_reason or job.status
            CENTER.finish_task(task_id, status=status, detail=detail,
                error=None if status == "complete" else job.error or job.stale_reason or job.status)
            return
        task = next((item for item in CENTER.tasks() if item.id == task_id), None)
        if task is not None and task.status == "queued":
            CENTER.claim_queued_task(task_id, job.project_id, "alignment", detail="Timing repair worker started")
        fraction = job.done / max(1, job.total) if job.done < job.total else None
        detail = f"Measuring output timing segments {job.done}/{job.total}" if fraction is not None else "Validating timing proposal"
        CENTER.update_task(task_id, detail=detail, fraction=fraction)

    def plan(self, project_id: str, output_id: str) -> dict[str, Any]:
        capture = self._capture(project_id, output_id)
        blockers = self._availability_blockers(capture)
        latest = self.latest_job(project_id, output_id)
        return {
            "outputId": output_id,
            "expectedKey": capture.key,
            "sourceAudioSha256": capture.audio_sha256,
            "sourceMetadataSha256": capture.metadata_sha256,
            "sampleRate": _RATE,
            "frames": capture.frames,
            "duration": capture.frames / _RATE,
            "strategy": "studio-dtw-script-mapping-v1",
            "recognizer": self._recognizer_identity(),
            "wordTimingVersion": self._timing_policy_version,
            "total": len(capture.segments),
            "segments": capture.segments,
            "processingAvailable": not blockers,
            "blockers": blockers,
            "latestJob": latest.model_dump(mode="json", by_alias=True) if latest else None,
        }

    def _write_job(self, job: OutputTimingRepairJob) -> None:
        with self._job_io_lock:
            path = self.job_path(job.project_id, job.id)
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
            try:
                with temporary.open("w", encoding="utf-8") as stream:
                    stream.write(job.model_dump_json(by_alias=True, indent=2))
                    stream.flush()
                    os.fsync(stream.fileno())
                for attempt in range(6):
                    try:
                        os.replace(temporary, path)
                        break
                    except PermissionError:
                        if os.name != "nt" or attempt == 5:
                            raise
                        time.sleep(.01 * (2 ** attempt))
            finally:
                temporary.unlink(missing_ok=True)

    def _load_job(self, project_id: str, job_id: str) -> OutputTimingRepairJob:
        path = self.job_path(project_id, job_id)
        if not path.is_file():
            raise KeyError(job_id)
        with self._job_io_lock:
            for attempt in range(6):
                try:
                    return OutputTimingRepairJob.model_validate_json(path.read_text(encoding="utf-8"))
                except PermissionError:
                    if os.name != "nt" or attempt == 5:
                        raise
                    time.sleep(.01 * (2 ** attempt))

    def latest_job(self, project_id: str, output_id: str) -> OutputTimingRepairJob | None:
        folder = self._root(project_id) / "jobs" / "output-timing-repair"
        if not folder.is_dir():
            return None
        jobs = []
        for path in folder.glob("timing-*.json"):
            try:
                with self._job_io_lock:
                    job = OutputTimingRepairJob.model_validate_json(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if job.project_id == project_id and job.output_id == output_id:
                jobs.append(job)
        if not jobs:
            return None
        latest = max(jobs, key=lambda item: item.created_at)
        return self.get_job(project_id, output_id, latest.id)

    def start(self, project_id: str, output_id: str, expected_key: str | OutputTimingRepairStartRequest) -> OutputTimingRepairJob:
        if isinstance(expected_key, OutputTimingRepairStartRequest):
            expected_key = expected_key.expected_key
        capture = self._capture(project_id, output_id)
        if expected_key != capture.key:
            raise OutputTimingRepairConflict("Voice Output changed; refresh the Timing Repair plan.")
        blockers = self._availability_blockers(capture)
        if blockers:
            raise ValueError("Timing Repair is blocked: " + " ".join(blockers))
        with self._lock:
            for path in (self._root(project_id) / "jobs" / "output-timing-repair").glob("timing-*.json"):
                try:
                    with self._job_io_lock:
                        existing = OutputTimingRepairJob.model_validate_json(path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                if existing.output_id == output_id and existing.status in {"queued", "running"}:
                    raise OutputTimingRepairConflict("Timing Repair is already running for this Voice Output.")
            job = OutputTimingRepairJob(project_id=project_id, output_id=output_id, key=capture.key,
                status="queued", done=0, total=len(capture.segments))
            self._write_job(job)
            self._start_activity(job, capture.output.name)
            state = _Running(job)
            self._running[job.id] = state
            thread = threading.Thread(target=self._run, args=(capture, state), daemon=True,
                name=f"output-timing-repair-{job.id}")
            self._threads[job.id] = thread
            try:
                thread.start()
            except Exception as exc:
                self._persist(state, status="failed", error=f"Could not start timing repair worker: {exc}")
                raise
            return job.model_copy(deep=True)

    def _is_cancelled(self, state: _Running) -> bool:
        return state.cancel_event.is_set()

    def _persist(self, state: _Running, **changes) -> OutputTimingRepairJob:
        with state.lock:
            state.job = state.job.model_copy(update={**changes, "updated_at": datetime.now(timezone.utc)}, deep=True)
            self._write_job(state.job)
            self._sync_activity(state.job)
            return state.job.model_copy(deep=True)

    @staticmethod
    def _extract_segment(source: Path, start_frame: int, end_frame: int, destination: Path) -> float:
        with wave.open(str(source), "rb") as wav:
            wav.setpos(start_frame)
            frames = wav.readframes(end_frame - start_frame)
        if len(frames) != (end_frame - start_frame) * _WIDTH:
            raise ValueError("Segment audio read returned an incomplete PCM frame sequence.")
        with wave.open(str(destination), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(_WIDTH)
            wav.setframerate(_RATE)
            wav.writeframes(frames)
        return len(frames) / (_WIDTH * _RATE)

    def _recognize_segment(self, wav_path: Path, language: str | None, request_id: str,
        state: _Running) -> list[dict[str, Any]]:
        with state.lock:
            if self._is_cancelled(state):
                raise RuntimeError("Timing Repair cancelled.")
            state.active_request_id = request_id
        try:
            if self._is_cancelled(state):
                raise RuntimeError("Timing Repair cancelled.")
            recognized = self.recognizer.recognize(wav_path, language, cancellation_id=request_id)
            if self._is_cancelled(state):
                raise RuntimeError("Timing Repair cancelled.")
            return recognized
        finally:
            with state.lock:
                if state.active_request_id == request_id:
                    state.active_request_id = None

    def _run(self, capture: _Capture, state: _Running) -> None:
        job = state.job
        self._sync_activity(job)
        lease = None
        terminal: tuple[str, dict[str, Any]] | None = None
        try:
            fresh = self._capture(job.project_id, job.output_id)
            if fresh.key != job.key:
                raise OutputTimingRepairConflict("Voice Output changed before Timing Repair started.")
            if self._is_cancelled(state):
                raise RuntimeError("Timing Repair cancelled.")
            lease = self.lease.acquire(f"output-timing-repair:{job.project_id}:{job.id}")
            self._persist(state, status="running")
            all_words: list[dict[str, Any]] = []
            segment_reports: list[dict[str, Any]] = []
            trusted_count = 0
            with tempfile.TemporaryDirectory(prefix="pro4bro-timing-") as temporary:
                temporary_root = Path(temporary)
                for index, segment in enumerate(capture.segments):
                    if self._is_cancelled(state):
                        raise RuntimeError("Timing Repair cancelled.")
                    audio_path = temporary_root / f"segment-{index}.wav"
                    seconds = self._extract_segment(capture.audio_path, segment["startFrame"], segment["endFrame"], audio_path)
                    cancellation_id = f"{job.id}-{index}-{uuid4().hex}"
                    error = None
                    recognized: list[dict[str, Any]] = []
                    try:
                        recognized = self._recognize_segment(audio_path, segment["language"], cancellation_id, state)
                    except Exception as exc:
                        if self._is_cancelled(state):
                            raise RuntimeError("Timing Repair cancelled.") from exc
                        error = f"{type(exc).__name__}: {exc}"
                    words, _quality = align_script_words(segment["text"], recognized, seconds)
                    offset = segment["startFrame"] / _RATE
                    for word in words:
                        item = dict(word)
                        original_start = round((offset + float(word["start"])) * _RATE)
                        original_end = round((offset + float(word["end"])) * _RATE)
                        start_frame = min(max(original_start, segment["startFrame"]), segment["endFrame"])
                        end_frame = min(max(original_end, start_frame), segment["endFrame"])
                        if (start_frame != original_start or end_frame != original_end or end_frame <= start_frame):
                            item["timingTrusted"] = False
                            item["timingSource"] = "script-proportional"
                        item.update(start=start_frame / _RATE, end=end_frame / _RATE,
                            segmentIndex=index, rowId=segment["rowId"], speakerId=segment["speakerProfileId"])
                        all_words.append(item)
                    measured = sum(word.get("timingTrusted") is True for word in words)
                    trusted_count += measured
                    segment_reports.append({"segmentIndex": index, "rowId": segment["rowId"],
                        "speakerProfileId": segment["speakerProfileId"], "totalWords": len(words),
                        "trustedWords": measured, "error": error})
                    self._persist(state, done=index + 1, report={"segments": segment_reports,
                        "trustedWords": trusted_count})
            if self._is_cancelled(state):
                raise RuntimeError("Timing Repair cancelled.")
            if trusted_count <= 0:
                raise ValueError("Timing Repair measured zero trusted Script word timings; no proposal was published.")
            fresh = self._capture(job.project_id, job.output_id)
            if fresh.key != job.key:
                raise OutputTimingRepairConflict("Voice Output changed while Timing Repair was running.")
            word_total = len(all_words)
            quality = "source" if trusted_count == word_total else "partial"
            report = {"version": 1, "strategy": "studio-dtw-script-mapping-v1",
                "recognizer": self._recognizer_identity(), "wordTimingVersion": self._timing_policy_version,
                "sourceOutputId": job.output_id, "sourceAudioSha256": capture.audio_sha256,
                "sourceMetadataSha256": capture.metadata_sha256, "sampleRate": _RATE,
                "frames": capture.frames, "segments": segment_reports,
                "trustedWords": trusted_count, "totalWords": word_total, "quality": quality,
                "timingReview": "asr-measured-needs-human-review"}
            proposal = {"version": 1, "jobId": job.id, "key": job.key,
                "recognizer": self._recognizer_identity(), "wordTimingVersion": self._timing_policy_version,
                "sourceOutputId": job.output_id, "sourceAudioSha256": capture.audio_sha256,
                "sourceMetadataSha256": capture.metadata_sha256, "words": all_words, "report": report}
            proposal_path = self.proposal_path(job.project_id, job.id)
            proposal_path.parent.mkdir(parents=True, exist_ok=True)
            payload = json.dumps(proposal, ensure_ascii=False, sort_keys=True, indent=2)
            with proposal_path.open("x", encoding="utf-8") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            proposal_sha = self._sha(proposal_path)
            terminal = ("complete", {"done": len(capture.segments), "report": report,
                "proposal_sha256": proposal_sha, "error": None})
        except OutputTimingRepairConflict as exc:
            terminal = ("stale", {"error": "Timing Repair inputs changed before completion.",
                "stale_reason": self._difference_reason(job.project_id, capture)})
        except Exception as exc:
            status = "cancelled" if self._is_cancelled(state) else "failed"
            terminal = (status, {"error": str(exc) or type(exc).__name__})
        finally:
            if lease is not None:
                self.lease.release(lease.token)
            # Persist terminal state only after releasing this job's GPU lease.
            if terminal is not None:
                self._persist(state, status=terminal[0], **terminal[1])
            with self._lock:
                self._running.pop(job.id, None)
                self._threads.pop(job.id, None)

    def get_job(self, project_id: str, output_id: str, job_id: str) -> OutputTimingRepairJob:
        job = self._load_job(project_id, job_id)
        if job.output_id != output_id:
            raise KeyError(job_id)
        thread = self._threads.get(job_id)
        if thread is not None and thread.is_alive():
            return job
        if job.status in {"queued", "running"}:
            job = job.model_copy(update={"status": "failed", "error": "Timing Repair worker was interrupted; start a fresh job.",
                "updated_at": datetime.now(timezone.utc)}, deep=True)
            self._write_job(job)
        elif job.status == "stale":
            if job.stale_reason is None:
                job = job.model_copy(update={"stale_reason": "identity"}, deep=True)
                self._write_job(job)
        elif job.status == "complete":
            try:
                capture = self._capture(project_id, output_id)
                reason = self._stale_reason(job, capture)
                if reason is not None:
                    raise OutputTimingRepairConflict(reason)
                proposal = self._load_proposal(project_id, job)
                report = proposal.get("report") if isinstance(proposal, dict) else None
                words = proposal.get("words") if isinstance(proposal, dict) else None
                if (not isinstance(report, dict) or not isinstance(words, list)
                        or report.get("wordTimingVersion") != self._timing_policy_version
                        or report.get("recognizer") != self._recognizer_identity()
                        or not isinstance(report.get("trustedWords"), int) or report["trustedWords"] <= 0):
                    raise OutputTimingRepairConflict("proposal")
            except (OSError, ValueError, KeyError) as exc:
                reason = str(exc) if str(exc) in {"source-audio", "source-metadata", "recognizer",
                    "timing-policy", "proposal", "identity"} else "identity"
                job = job.model_copy(update={"status": "stale", "stale_reason": reason, "error": str(exc),
                    "updated_at": datetime.now(timezone.utc)}, deep=True)
                self._write_job(job)
        self._sync_activity(job)
        return job

    def _stale_reason(self, job: OutputTimingRepairJob, capture: _Capture) -> str | None:
        report = job.report
        if not isinstance(report, dict) or not report:
            return "identity"
        # Preserve this order so a metadata change never hides a changed source WAV.
        if report.get("sourceAudioSha256") != capture.audio_sha256:
            return "source-audio"
        if report.get("sourceMetadataSha256") != capture.metadata_sha256:
            return "source-metadata"
        if report.get("recognizer") != self._recognizer_identity():
            return "recognizer"
        if report.get("wordTimingVersion") != self._timing_policy_version:
            return "timing-policy"
        if capture.key != job.key:
            return "identity"
        try:
            self._load_proposal(job.project_id, job)
        except (OSError, ValueError, KeyError):
            return "proposal"
        return None

    def _difference_reason(self, project_id: str, original: _Capture) -> str:
        try:
            current = self._capture(project_id, original.output.id)
        except (KeyError, OSError, ValueError):
            return "identity"
        if original.audio_sha256 != current.audio_sha256:
            return "source-audio"
        if original.metadata_sha256 != current.metadata_sha256:
            return "source-metadata"
        if original.recognizer != self._recognizer_identity():
            return "recognizer"
        if original.timing_policy_version != self._timing_policy_version:
            return "timing-policy"
        return "identity"

    def stop(self, project_id: str, output_id: str, job_id: str) -> OutputTimingRepairJob:
        job = self._load_job(project_id, job_id)
        if job.output_id != output_id:
            raise KeyError(job_id)
        state = self._running.get(job_id)
        if state is None or job.status not in {"queued", "running"}:
            if job.status in {"queued", "running"}:
                job = job.model_copy(update={"status": "failed", "error": "Timing Repair worker was interrupted; start a fresh job.",
                    "updated_at": datetime.now(timezone.utc)}, deep=True)
                self._write_job(job)
            return job
        cancellation_id = None
        with state.lock:
            state.cancel_event.set()
            cancellation_id = state.active_request_id
        cancel = getattr(self.recognizer, "cancel_request", None)
        if cancellation_id and callable(cancel):
            cancel(cancellation_id)
        return state.job.model_copy(deep=True)

    def close(self, timeout: float = 5.0) -> None:
        """Cancel and bounded-join only workers owned by this service."""
        deadline = time.monotonic() + max(0.0, timeout)
        with self._lock:
            states, threads = dict(self._running), dict(self._threads)
        cancellations: list[str] = []
        for state in states.values():
            with state.lock:
                state.cancel_event.set()
                if state.active_request_id:
                    cancellations.append(state.active_request_id)
        cancel = getattr(self.recognizer, "cancel_request", None)
        if callable(cancel):
            for request_id in cancellations:
                try:
                    cancel(request_id)
                except Exception:
                    pass
        for thread in threads.values():
            if thread.is_alive():
                thread.join(timeout=max(0.0, deadline - time.monotonic()))

    def _load_proposal(self, project_id: str, job: OutputTimingRepairJob) -> dict[str, Any]:
        path = self.proposal_path(project_id, job.id)
        if not path.is_file() or not job.proposal_sha256 or self._sha(path) != job.proposal_sha256:
            raise OutputTimingRepairConflict("Timing Repair proposal is missing or has changed.")
        try:
            proposal = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise OutputTimingRepairConflict("Timing Repair proposal cannot be read.") from exc
        if (not isinstance(proposal, dict) or proposal.get("version") != 1
                or proposal.get("jobId") != job.id or proposal.get("key") != job.key
                or proposal.get("sourceOutputId") != job.output_id
                or proposal.get("recognizer") != self._recognizer_identity()
                or proposal.get("wordTimingVersion") != WORD_TIMING_VERSION):
            raise OutputTimingRepairConflict("Timing Repair proposal identity does not match the job.")
        return proposal

    def _valid_receipt(self, project_id: str, receipt: dict[str, Any], capture: _Capture, job: OutputTimingRepairJob):
        if (receipt.get("version") != 1 or receipt.get("jobId") != job.id or receipt.get("key") != job.key
                or receipt.get("sourceOutputId") != job.output_id
                or receipt.get("sourceAudioSha256") != capture.audio_sha256
                or receipt.get("sourceMetadataSha256") != capture.metadata_sha256
                or receipt.get("proposalSha256") != job.proposal_sha256):
            raise OutputTimingRepairConflict("Timing Repair receipt is stale or does not match its source.")
        output_id = receipt.get("outputId")
        if not isinstance(output_id, str) or not _OUTPUT_ID.fullmatch(output_id):
            raise OutputTimingRepairConflict("Timing Repair receipt has an invalid output id.")
        output = self.outputs.get(project_id, output_id)
        path = self._contained(project_id, self.outputs.audio_path(project_id, output_id))
        if (self._metadata_sha(output) != receipt.get("outputMetadataSha256")
                or self._sha(path) != capture.audio_sha256
                or receipt.get("outputAudioSha256") != capture.audio_sha256):
            raise OutputTimingRepairConflict("Applied Timing Repair output failed audio or metadata integrity checks.")
        lineage = output.parameters.get("timingRepair")
        if (not isinstance(lineage, dict) or lineage.get("jobId") != job.id
                or lineage.get("proposalSha256") != job.proposal_sha256):
            raise OutputTimingRepairConflict("Applied output lineage does not match its Timing Repair receipt.")
        return {"output": output, "audioUrl": f"/api/projects/{project_id}/voice-outputs/{output.id}/audio",
            "sourceOutputId": job.output_id}

    def apply(self, project_id: str, output_id: str, request: OutputTimingRepairApplyRequest | dict[str, Any]) -> dict[str, Any]:
        if isinstance(request, dict):
            request = OutputTimingRepairApplyRequest.model_validate(request)
        job = self.get_job(project_id, output_id, request.job_id)
        if job.status != "complete" or job.key != request.expected_key:
            raise OutputTimingRepairConflict("A completed, current Timing Repair job is required before Apply.")
        capture = self._capture(project_id, output_id)
        if capture.key != job.key:
            raise OutputTimingRepairConflict("Voice Output changed; rerun Timing Repair before Apply.")
        receipt_path = self.applied_path(project_id, job.id)
        with self._lock:
            if receipt_path.is_file():
                try:
                    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
                except (OSError, ValueError) as exc:
                    raise OutputTimingRepairConflict("Timing Repair receipt cannot be read; refusing duplicate Apply.") from exc
                return self._valid_receipt(project_id, receipt, capture, job)
            proposal = self._load_proposal(project_id, job)
            if (proposal.get("sourceAudioSha256") != capture.audio_sha256
                    or proposal.get("sourceMetadataSha256") != capture.metadata_sha256):
                raise OutputTimingRepairConflict("Timing Repair proposal no longer matches the source output.")
            words = proposal.get("words")
            report = proposal.get("report")
            if not isinstance(words, list) or not isinstance(report, dict) or report.get("trustedWords", 0) <= 0:
                raise OutputTimingRepairConflict("Timing Repair proposal has no trusted measured word timing.")
            if self._sha(capture.audio_path) != capture.audio_sha256:
                raise OutputTimingRepairConflict("Source Voice Output audio changed during Apply.")
            output_id_new, output_audio = self.outputs.reserve(project_id)
            try:
                shutil.copyfile(capture.audio_path, output_audio)
                if self._sha(output_audio) != capture.audio_sha256:
                    raise ValueError("Timing Repair output audio is not byte-identical to its source.")
                parameters = dict(capture.output.parameters)
                parameters["timingRepair"] = {
                    "version": 1, "strategy": "studio-dtw-script-mapping-v1",
                    "recognizer": self._recognizer_identity(), "wordTimingVersion": WORD_TIMING_VERSION,
                    "jobId": job.id,
                    "jobKey": job.key, "sourceOutputId": output_id,
                    "sourceAudioSha256": capture.audio_sha256,
                    "sourceMetadataSha256": capture.metadata_sha256,
                    "proposalSha256": job.proposal_sha256,
                }
                output_root = self._root(project_id)
                candidate = capture.output.model_copy(update={
                    "id": output_id_new,
                    "name": f"Timing Repair - {capture.output.name}",
                    "audio_path": output_audio.relative_to(output_root).as_posix(),
                    "parameters": parameters,
                    "words": words,
                    "word_timing_quality": report.get("quality"),
                    "word_timing_note": "Existing Voice Output audio was measured with Speech to Text against its saved Script. Review word timing before export.",
                    "created_at": datetime.now(timezone.utc),
                })
                if self._capture(project_id, output_id).key != capture.key:
                    raise OutputTimingRepairConflict("Source Voice Output changed before Apply could publish.")
                self.outputs.save(project_id, candidate)
                if (self._sha(output_audio) != capture.audio_sha256
                        or self._metadata_sha(candidate) != self._metadata_sha(self.outputs.get(project_id, output_id_new))):
                    raise ValueError("Timing Repair output failed post-save integrity validation.")
                receipt = {"version": 1, "jobId": job.id, "key": job.key, "sourceOutputId": output_id,
                    "sourceAudioSha256": capture.audio_sha256, "sourceMetadataSha256": capture.metadata_sha256,
                    "outputId": output_id_new, "outputAudioSha256": self._sha(output_audio),
                    "outputMetadataSha256": self._metadata_sha(candidate), "proposalSha256": job.proposal_sha256,
                    "report": report, "createdAt": datetime.now(timezone.utc).isoformat()}
                receipt_path.parent.mkdir(parents=True, exist_ok=True)
                temporary = receipt_path.with_name(f".{receipt_path.name}.{uuid4().hex}.tmp")
                try:
                    temporary.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
                    with temporary.open("r+b") as stream:
                        os.fsync(stream.fileno())
                    os.link(temporary, receipt_path)
                finally:
                    temporary.unlink(missing_ok=True)
                return self._valid_receipt(project_id, receipt, capture, job)
            except Exception:
                if not receipt_path.exists():
                    self.outputs.discard(project_id, output_id_new)
                raise

