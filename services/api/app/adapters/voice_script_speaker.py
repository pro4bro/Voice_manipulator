from __future__ import annotations

import audioop
import hashlib
import json
import logging
import shutil
import subprocess
import tempfile
import threading
import time
import wave
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4

import httpx

from app.adapters.activity_center import CENTER
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.gpu_lease import GpuLease
from app.adapters.omnivoice_generator import SpeechPlan, VoiceGenerator, file_digest
from app.adapters.processing_cancellation import ProcessingStopError
from app.domain.models import VoiceOutput, VoiceOutputSegment, VoiceScriptJob, VoiceScriptRequest, VoiceScriptRow
from app.domain.ports import ProjectRepository
from app.domain.script_word_alignment import align_script_words

logger = logging.getLogger("app.adapters.voice_script_speaker")

SAMPLE_RATE = 24000
SAMPLE_WIDTH = 2
# Silence a generated row may keep before its first word and after its last.
# Engines sometimes open with seconds of breath or room tone; the gap between
# rows is set by the Script read, not left to chance inside each clip.
LEAD_SECONDS = 0.2
TAIL_SECONDS = 0.3


class VoiceScriptBusy(RuntimeError):
    """This project is already reading a Script."""


class WordRecognizer(Protocol):
    def recognize(self, audio: Path, language: str | None) -> list[dict[str, Any]]: ...


class StudioWordRecognizer:
    """Word timing from the Speech to Text sidecar, measured on generated audio.

    The same Faster-Whisper DTW timing footage gets, so a subtitle follows
    generated speech with the accuracy it follows a recording.
    """

    def __init__(self, studio_url: str, model: str = "large-v3", timeout: float = 300.0) -> None:
        self.studio_url = studio_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def recognize(
        self, audio: Path, language: str | None, cancellation_id: str | None = None,
    ) -> list[dict[str, Any]]:
        with audio.open("rb") as handle:
            response = httpx.post(
                f"{self.studio_url}/api/audio/import",
                files={"file": ("clip.wav", handle, "audio/wav")},
                data={"model": self.model, "language": language or "", "progress_id": cancellation_id or ""},
                timeout=httpx.Timeout(self.timeout, connect=5.0),
            )
        response.raise_for_status()
        return list((response.json().get("item") or {}).get("words") or [])

    def cancel_request(self, cancellation_id: str) -> bool:
        """Ask Studio to cancel this exact import, including a pre-dispatch tombstone."""
        try:
            response = httpx.post(
                f"{self.studio_url}/api/audio/import/{cancellation_id}/cancel",
                timeout=httpx.Timeout(3.0, connect=1.0),
            )
            if response.status_code == 404:
                raise ProcessingStopError(
                    "Studio does not support per-job cancellation. Restart the Studio runtime before retrying."
                )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("cancelled"), bool):
                raise ProcessingStopError("Studio did not acknowledge transcription cancellation.")
            return True
        except httpx.HTTPStatusError as exc:
            raise ProcessingStopError(
                "Studio rejected the transcription cancellation request. Restart the Studio runtime before retrying."
            ) from exc
        except httpx.RequestError as exc:
            raise ProcessingStopError(
                "Cannot reach Studio to confirm transcription stopped. Restart the Studio runtime before retrying."
            ) from exc
        except ValueError as exc:
            raise ProcessingStopError("Studio returned an invalid transcription cancellation response.") from exc


def read_pcm(path: Path, ffmpeg_path: str | None = None) -> bytes:
    """Mono 16-bit frames at the Voice Output rate, whatever the engine wrote."""
    try:
        with wave.open(str(path), "rb") as handle:
            rate, width, channels = handle.getframerate(), handle.getsampwidth(), handle.getnchannels()
            frames = handle.readframes(handle.getnframes())
    except wave.Error:
        # Float WAV is valid and `wave` does not read it; FFmpeg does.
        if not ffmpeg_path:
            raise
        with tempfile.TemporaryDirectory(prefix="pro4bro-pcm-") as folder:
            converted = Path(folder) / "pcm.wav"
            subprocess.run(
                [ffmpeg_path, "-y", "-hide_banner", "-loglevel", "error", "-i", str(path),
                 "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", str(converted)],
                check=True, capture_output=True,
            )
            return read_pcm(converted)
    if channels > 1:
        frames = audioop.tomono(frames, width, 1 / channels, 1 / channels) if channels == 2 else frames[:: channels * width]
    if width != SAMPLE_WIDTH:
        frames = audioop.lin2lin(frames, width, SAMPLE_WIDTH)
    if rate != SAMPLE_RATE:
        frames, _ = audioop.ratecv(frames, SAMPLE_WIDTH, 1, rate, SAMPLE_RATE, None)
    return frames


def write_pcm(path: Path, frames: bytes) -> None:
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(SAMPLE_WIDTH)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(frames)


def seconds_of(frames: bytes) -> float:
    return len(frames) / SAMPLE_WIDTH / SAMPLE_RATE


def trim_to_words(frames: bytes, words: list[dict[str, Any]]) -> tuple[bytes, list[dict[str, Any]], float, float]:
    """Cut long silence around the speech, where recognition measured the first and last word.

    Only measured edges are trusted to cut at; an estimated word could sit in
    the middle of speech. Returns the frames, the words shifted to match, and
    how many seconds came off each end.
    """
    seconds = seconds_of(frames)
    if not words:
        return frames, words, 0.0, 0.0
    first, last = words[0], words[-1]
    head = max(0.0, float(first["start"]) - LEAD_SECONDS) if first.get("timingTrusted") else 0.0
    tail_at = min(seconds, float(last["end"]) + TAIL_SECONDS) if last.get("timingTrusted") else seconds
    head = head if head >= 0.15 else 0.0
    tail_at = tail_at if seconds - tail_at >= 0.15 else seconds
    if not head and tail_at >= seconds:
        return frames, words, 0.0, 0.0
    start_frame = int(round(head * SAMPLE_RATE)) * SAMPLE_WIDTH
    end_frame = int(round(tail_at * SAMPLE_RATE)) * SAMPLE_WIDTH
    trimmed = frames[start_frame:end_frame]
    length = seconds_of(trimmed)
    shifted = [
        {**word, "start": round(max(0.0, float(word["start"]) - head), 3), "end": round(min(length, float(word["end"]) - head), 3)}
        for word in words
    ]
    return trimmed, shifted, round(head, 3), round(seconds - tail_at, 3)


@dataclass
class Clip:
    key: str
    audio: Path
    seconds: float
    words: list[dict[str, Any]]
    quality: str
    note: str | None
    reused: bool


@dataclass
class _Step:
    row: VoiceScriptRow
    text: str
    plan: SpeechPlan


@dataclass
class _Job:
    record: VoiceScriptJob
    request_signature: str | None = None
    start_claimed: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)
    live: bool = True
    stop_after_current: bool = False
    cancel_requested: bool = False
    cancel_event: threading.Event = field(default_factory=threading.Event)
    commit_lock: threading.Lock = field(default_factory=threading.Lock)
    active_request_id: str | None = None
    active_worker: Any | None = None


class VoiceScriptSpeaker:
    """Reads a typed Script row by row, each row in its own voice, into one Voice Output.

    Every row becomes a clip cached by what made it - voice, generator,
    settings and text - so reading the Script again after changing one row
    speaks only that row. The clips are joined with a short silence and the
    words of each are timed on its own audio, then shifted into place.
    """

    def __init__(
        self,
        projects: ProjectRepository,
        outputs: FileVoiceOutputs,
        generator: VoiceGenerator,
        gpu_lease: GpuLease,
        recognizer: WordRecognizer | None = None,
        ffmpeg_path: str | None = None,
        before_start: Callable[[], None] | None = None,
    ) -> None:
        self.projects = projects
        self.outputs = outputs
        self.generator = generator
        self.gpu_lease = gpu_lease
        self.recognizer = recognizer
        self.ffmpeg_path = ffmpeg_path
        self.before_start = before_start
        self._jobs: dict[str, _Job] = {}
        self._lock = threading.Lock()

    # ---------- the API surface ----------

    def reserve(self, project_id: str, request: VoiceScriptRequest) -> str:
        """Register project ownership before a caller queues start on a threadpool."""
        self.projects.get(project_id)
        record = VoiceScriptJob(id=f"script-{uuid4().hex[:12]}", project_id=project_id, total=len(request.rows))
        job = _Job(record, request_signature=request.model_dump_json())
        with self._lock:
            if any(job.record.project_id == project_id and job.record.status == "running" for job in self._jobs.values()):
                raise VoiceScriptBusy("Đang đọc một Script khác của project này.")
            self._jobs[record.id] = job
        return record.id

    def start(
        self, project_id: str, request: VoiceScriptRequest, *, background: bool = True,
        reserved_job_id: str | None = None,
    ) -> VoiceScriptJob:
        if reserved_job_id is None:
            reserved_job_id = self.reserve(project_id, request)
        else:
            self.projects.get(project_id)
        with self._lock:
            job = self._jobs.get(reserved_job_id)
        if job is None or job.record.project_id != project_id:
            raise KeyError(reserved_job_id)
        if job.request_signature != request.model_dump_json():
            raise ValueError("Voice Script reservation does not match this request.")
        with job.lock:
            if job.record.status != "running":
                job.live = False
                return job.record.model_copy(deep=True)
            if job.start_claimed:
                raise ValueError("Voice Script reservation has already been started.")
            job.start_claimed = True
        try:
            steps = self._plan(project_id, request)
            with job.lock:
                if job.record.status != "running":
                    job.live = False
                    return job.record.model_copy(deep=True)
            lease = self.gpu_lease.acquire(f"voice-script:{project_id}")
            with job.lock:
                if job.record.status != "running":
                    job.live = False
                    self.gpu_lease.release(lease.token)
                    return job.record.model_copy(deep=True)
                job.record = job.record.model_copy(update={"total": len(steps)})
        except Exception:
            with job.lock:
                stopped = job.record.status in {"stopped", "cancelled"}
                job.live = False
            if stopped:
                return self.job(project_id, job.record.id)
            with self._lock:
                self._jobs.pop(job.record.id, None)
            raise
        if background:
            threading.Thread(
                target=self._run,
                args=(job, steps, request.gap_seconds, lease.token, request.force_regenerate),
                daemon=True,
            ).start()
        else:
            self._run(job, steps, request.gap_seconds, lease.token, request.force_regenerate)
        return self.job(project_id, job.record.id)

    def job(self, project_id: str, job_id: str) -> VoiceScriptJob:
        job = self._jobs.get(job_id)
        if job is None or job.record.project_id != project_id:
            raise KeyError(job_id)
        with job.lock:
            # Publication finishes before the thread's GPU/worker cleanup.
            # Keep polling live until that handover is complete, so the next
            # inference is not offered while the previous lease is still held.
            if job.live and (job.record.status in {"complete", "failed"}
                    or (job.record.status == "stopped" and job.record.output is not None)):
                return job.record.model_copy(update={"status": "running", "finished_at": None}, deep=True)
            return job.record.model_copy(deep=True)

    def stop(self, project_id: str, include_active: bool = False) -> VoiceScriptJob | None:
        """Stop queued Script rows, optionally cancelling the current inference."""
        self.projects.get(project_id)
        selected: _Job | None = None
        cancel: tuple[Any, str] | None = None
        with self._lock:
            jobs = [job for job in self._jobs.values() if job.record.project_id == project_id]
            selected = next(
                (job for job in reversed(jobs) if job.live and job.record.status in {"running", "stopped"}),
                None,
            )
        if selected is None:
            return None
        if include_active:
            with selected.commit_lock:
                with selected.lock:
                    if selected.record.status in {"complete", "failed"}:
                        return None
                    selected.cancel_event.set()
                    selected.cancel_requested = True
                    selected.record = selected.record.model_copy(update={
                        "status": "cancelled", "current_row_id": None, "finished_at": datetime.now(timezone.utc),
                    })
                    if selected.active_worker is not None and selected.active_request_id is not None:
                        cancel = (selected.active_worker, selected.active_request_id)
        else:
            with selected.lock:
                if selected.record.status in {"complete", "failed"}:
                    return None
                selected.stop_after_current = True
                if selected.record.current_row_id is None and selected.record.done == 0:
                    selected.record = selected.record.model_copy(update={
                        "status": "stopped", "message": None, "finished_at": datetime.now(timezone.utc),
                    })
        if cancel is not None:
            cancel[0].cancel_request(cancel[1])
        return self.job(project_id, selected.record.id)

    # ---------- planning, before the GPU is taken ----------

    def _plan(self, project_id: str, request: VoiceScriptRequest) -> list[_Step]:
        plans: dict[str, SpeechPlan] = {}
        steps: list[_Step] = []
        for number, row in enumerate(request.rows, start=1):
            text = " ".join(row.text.split())
            if not text:
                raise ValueError(f"Đoạn {number} chưa có chữ.")
            if row.voice_id not in plans:
                try:
                    voice = self.generator.voices.get(project_id, row.voice_id)
                except KeyError as exc:
                    raise ValueError(f"Voice của đoạn {number} không còn trong project.") from exc
                generator_id = self.generator.generator_for(voice.engine)
                if generator_id is None:
                    raise ValueError(f"Chưa có công cụ tạo giọng cho engine {voice.engine} (đoạn {number}).")
                plans[row.voice_id] = self.generator.prepare(project_id, voice.id, generator_id, request.parameters.get(generator_id, {}))
            steps.append(_Step(row, text, plans[row.voice_id]))
        return steps

    # ---------- the work ----------

    def _update(self, job: _Job, **changes: Any) -> None:
        with job.lock:
            if job.record.status != "running":
                return
            job.record = job.record.model_copy(update=changes)

    def _run(
        self, job: _Job, steps: list[_Step], gap_seconds: float, lease_token: str,
        force_regenerate: bool = False,
    ) -> None:
        project_id = job.record.project_id
        task = CENTER.start_task(
            "tts", f"Đọc Script · {len(steps)} đoạn", detail="Chuẩn bị", fraction=0.0, project_id=project_id,
        )
        began = time.perf_counter()
        logger.info("Đọc Script: %s đoạn", len(steps))
        try:
            if self.before_start is not None:
                self.before_start()
            clips: list[tuple[_Step, Clip]] = []
            reused = 0
            for index, step in enumerate(steps):
                cancellation_id = f"script-{job.record.id}-{uuid4().hex}"
                with job.lock:
                    if job.cancel_requested or job.record.status != "running":
                        return
                    if job.stop_after_current and job.record.current_row_id is None:
                        if clips:
                            break
                        job.record = job.record.model_copy(update={
                            "status": "stopped", "message": None, "finished_at": datetime.now(timezone.utc),
                        })
                        return
                    job.record = job.record.model_copy(update={
                        "current_row_id": step.row.id,
                        "message": f"Đoạn {index + 1}/{len(steps)} · {step.plan.voice.name}",
                    })
                    job.active_request_id = cancellation_id
                    job.active_worker = step.plan.engine_speech.worker
                    register = getattr(job.active_worker, "register_request", None)
                    if callable(register):
                        register(cancellation_id)
                CENTER.update_task(
                    task, detail=f"Đoạn {index + 1}/{len(steps)} · {step.plan.voice.name}",
                    fraction=index / max(1, len(steps)),
                )
                clip = self._clip(
                    project_id, step, cancellation_id,
                    job=job,
                    is_cancelled=lambda: self._cancel_requested(job),
                    commit=lambda action: self._commit_if_active(job, action),
                    force_regenerate=force_regenerate,
                )
                abandon = getattr(step.plan.engine_speech.worker, "abandon_request", None)
                if callable(abandon):
                    abandon(cancellation_id)
                with job.lock:
                    if job.cancel_requested or job.record.status != "running":
                        return
                    job.active_request_id = None
                    job.active_worker = None
                reused += int(clip.reused)
                clips.append((step, clip))
                with job.lock:
                    if job.record.status == "running":
                        job.record = job.record.model_copy(update={
                            "done": index + 1, "reused": reused, "current_row_id": None,
                        })
                spent = time.perf_counter() - began
                CENTER.update_task(
                    task, fraction=(index + 1) / max(1, len(steps)),
                    eta_seconds=spent / (index + 1) * (len(steps) - index - 1),
                )
                with job.lock:
                    if job.stop_after_current:
                        break
            with job.lock:
                if job.cancel_requested or job.record.status != "running":
                    return
                should_stop = job.stop_after_current and len(clips) < len(steps)
                if should_stop and not clips:
                    job.record = job.record.model_copy(update={
                        "status": "stopped", "finished_at": datetime.now(timezone.utc),
                    })
                    return
            CENTER.update_task(task, detail="Ghép các đoạn thành một file", fraction=1.0)
            if self._cancel_requested(job):
                return
            output = self._assemble(
                project_id, clips, gap_seconds,
                publish=lambda candidate: self._publish_script_output(job, project_id, candidate, should_stop),
            )
            spent = time.perf_counter() - began
            with job.lock:
                final_status = job.record.status
            CENTER.finish_task(task, status="cancelled" if final_status == "stopped" else "complete", detail=f"{len(clips)} đoạn · {reused} dùng lại")
            logger.info("Đọc Script xong: %s đoạn, %s dùng lại, %.1f giây", len(steps), reused, spent)
        except Exception as exc:  # the job reports it; nothing above this thread would
            with job.lock:
                cancelled = job.cancel_requested or job.record.status == "cancelled"
                if not cancelled and job.record.status == "running":
                    job.record = job.record.model_copy(update={
                        "status": "failed", "error": str(exc) or type(exc).__name__,
                        "current_row_id": None, "finished_at": datetime.now(timezone.utc),
                    })
            CENTER.finish_task(task, status="cancelled" if cancelled else "failed", error=None if cancelled else str(exc) or type(exc).__name__)
            if not cancelled:
                logger.error("Đọc Script thất bại: %s", exc)
        finally:
            with job.lock:
                terminal_status = job.record.status
                active_request_id = job.active_request_id
                active_worker = job.active_worker
                job.active_request_id = None
                job.active_worker = None
            try:
                abandon = getattr(active_worker, "abandon_request", None)
                if active_request_id is not None and callable(abandon):
                    abandon(active_request_id)
                if terminal_status == "stopped":
                    CENTER.finish_task(task, status="cancelled", detail=f"Đã dừng sau {job.record.done}/{len(steps)} đoạn")
                elif terminal_status == "cancelled":
                    CENTER.finish_task(task, status="cancelled", detail="Đã huỷ")
            finally:
                self.gpu_lease.release(lease_token)
                with job.lock:
                    job.live = False

    @staticmethod
    def _cancel_requested(job: _Job) -> bool:
        with job.lock:
            return job.cancel_event.is_set() or job.cancel_requested or job.record.status == "cancelled"

    def _publish_script_output(
        self, job: _Job, project_id: str, candidate: VoiceOutput, should_stop: bool,
    ) -> VoiceOutput:
        with job.commit_lock:
            if job.cancel_event.is_set() or job.cancel_requested:
                raise RuntimeError("Voice Script job was cancelled.")
            with job.lock:
                if job.record.status not in {"running", "stopped"} or job.cancel_event.is_set() or job.cancel_requested:
                    raise RuntimeError("Voice Script job was cancelled.")
                should_stop = should_stop or (
                    job.stop_after_current and job.record.done < job.record.total
                ) or job.record.status == "stopped"
                saved = self.outputs.save(project_id, candidate)
                job.record = job.record.model_copy(update={
                    "status": "stopped" if should_stop else "complete", "output": saved,
                    "current_row_id": None, "message": None, "finished_at": datetime.now(timezone.utc),
                })
                return saved

    @staticmethod
    def _commit_if_active(job: _Job, action: Callable[[], None]) -> bool:
        """Commit one derived clip while serialized with all-stop."""
        with job.lock:
            if job.cancel_event.is_set() or job.cancel_requested or job.record.status != "running":
                return False
            action()
            return True

    @staticmethod
    def clip_key(step: _Step) -> str:
        identity = {
            "voice": step.plan.voice.id,
            "artifacts": step.plan.artifact_fingerprint,
            "generator": step.plan.generator_id,
            "generation": step.plan.generation,
            "language": step.plan.language,
            "speed": step.plan.speed,
            "text": step.text,
        }
        encoded = json.dumps(identity, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()[:32]

    def _clip(
        self,
        project_id: str,
        step: _Step,
        cancellation_id: str | None = None,
        job: _Job | None = None,
        is_cancelled: Callable[[], bool] | None = None,
        commit: Callable[[Callable[[], None]], bool] | None = None,
        force_regenerate: bool = False,
    ) -> Clip:
        key = self.clip_key(step)
        if force_regenerate:
            # Keep every completed output's original clip immutable. Fresh
            # generations receive their own project-owned revision directory.
            key = f"{key}-{uuid4().hex}"
        folder = self.outputs.clips_root(project_id) / key
        record = folder / "clip.json"
        saved = None
        if folder.exists():
            try:
                candidate = json.loads(record.read_text(encoding="utf-8"))
                audio = folder / "audio.wav"
                with wave.open(str(audio), "rb") as handle:
                    valid = (handle.getframerate() == SAMPLE_RATE and handle.getnchannels() == 1
                             and handle.getsampwidth() == SAMPLE_WIDTH and handle.getnframes() > 0
                             and len(handle.readframes(handle.getnframes())) == handle.getnframes() * SAMPLE_WIDTH)
                if valid and candidate.get("audioSha256") == file_digest(audio):
                    saved = candidate
            except (OSError, ValueError, EOFError, wave.Error):
                pass
            if saved is None:
                # Never rewrite a clip referenced by a previously published output.
                key = f"{key}-{uuid4().hex}"
                folder = self.outputs.clips_root(project_id) / key
                record = folder / "clip.json"
        if saved is not None:
            if saved.get("measured") or self.recognizer is None:
                return Clip(key, folder / "audio.wav", float(saved["seconds"]), saved["words"], saved["quality"], saved.get("note"), True)
            # Timing was estimated because recognition was down; try again,
            # the audio itself is still good.
            words, quality, note, measured = self._time_words(
                folder / "audio.wav", step, float(saved["seconds"]),
                job=job, cancellation_id=cancellation_id, is_cancelled=is_cancelled,
            )
            if is_cancelled is not None and is_cancelled():
                raise RuntimeError("Voice Script job was cancelled.")
            write = lambda: self._write_record(record, key, step, float(saved["seconds"]), words, quality, note, measured)
            if commit is not None:
                if not commit(write):
                    raise RuntimeError("Voice Script job was cancelled.")
            else:
                write()
            return Clip(key, folder / "audio.wav", float(saved["seconds"]), words, quality, note, True)

        partial = folder.with_name(f"{key}.partial-{uuid4().hex[:6]}")
        partial.mkdir(parents=True)
        try:
            raw = partial / "raw.wav"
            self.generator.speak(step.plan, step.text, raw, cancellation_id=cancellation_id)
            frames = read_pcm(raw, self.ffmpeg_path)
            raw.unlink(missing_ok=True)
            write_pcm(partial / "audio.wav", frames)
            seconds = seconds_of(frames)
            words, quality, note, measured = self._time_words(
                partial / "audio.wav", step, seconds,
                job=job, cancellation_id=cancellation_id, is_cancelled=is_cancelled,
            )
            frames, words, _cut_head, _cut_tail = trim_to_words(frames, words)
            if len(frames) != int(round(seconds * SAMPLE_RATE)) * SAMPLE_WIDTH:
                write_pcm(partial / "audio.wav", frames)
                seconds = seconds_of(frames)
            self._write_record(partial / "clip.json", key, step, seconds, words, quality, note, measured)
            if is_cancelled is not None and is_cancelled():
                raise RuntimeError("Voice Script job was cancelled.")
            def publish() -> None:
                if folder.exists():
                    shutil.rmtree(partial, ignore_errors=True)
                else:
                    partial.replace(folder)
            if commit is not None:
                if not commit(publish):
                    raise RuntimeError("Voice Script job was cancelled.")
            else:
                publish()
        except Exception:
            shutil.rmtree(partial, ignore_errors=True)
            raise
        return Clip(key, folder / "audio.wav", seconds, words, quality, note, False)

    def _time_words(
        self, audio: Path, step: _Step, seconds: float, *, job: _Job | None = None,
        cancellation_id: str | None = None, is_cancelled: Callable[[], bool] | None = None,
    ) -> tuple[list[dict[str, Any]], str, str | None, bool]:
        if self.recognizer is None:
            words, quality = align_script_words(step.text, [], seconds)
            return words, quality, "Chưa có Speech to Text để đo word timing; vị trí từ được ước lượng theo độ dài chữ.", False
        recognizer_cancel = getattr(self.recognizer, "cancel_request", None)
        request_id = f"{cancellation_id}-words" if cancellation_id else None
        owns_cancellable_request = job is not None and request_id is not None and callable(recognizer_cancel)
        if owns_cancellable_request:
            # Publish the exact STT owner before HTTP dispatch. Studio records a
            # tombstone when cancellation arrives before its import registers.
            with job.lock:
                if job.cancel_event.is_set() or job.cancel_requested or job.record.status == "cancelled":
                    raise RuntimeError("Voice Script job was cancelled.")
                job.active_worker = self.recognizer
                job.active_request_id = request_id
        try:
            if is_cancelled is not None and is_cancelled():
                raise RuntimeError("Voice Script job was cancelled.")
            if owns_cancellable_request:
                recognized = self.recognizer.recognize(audio, step.plan.language, cancellation_id=request_id)
            else:
                recognized = self.recognizer.recognize(audio, step.plan.language)
            if is_cancelled is not None and is_cancelled():
                raise RuntimeError("Voice Script job was cancelled.")
        except Exception as exc:
            if is_cancelled is not None and is_cancelled():
                raise
            # Worth a line: the subtitle for this row is estimated, not measured,
            # and the reason is usually the recogniser competing for the GPU.
            logger.warning("Không đo được word timing cho đoạn %s: %s: %s", step.row.id, type(exc).__name__, exc)
            words, quality = align_script_words(step.text, [], seconds)
            return words, quality, f"Không đo được word timing ({type(exc).__name__}); vị trí từ được ước lượng theo độ dài chữ.", False
        finally:
            if owns_cancellable_request and job is not None:
                with job.lock:
                    if job.active_request_id == request_id:
                        job.active_request_id = None
                        job.active_worker = None
        words, quality = align_script_words(step.text, recognized, seconds)
        return words, quality, None, True

    @staticmethod
    def _write_record(record: Path, key: str, step: _Step, seconds: float, words: list, quality: str, note: str | None, measured: bool) -> None:
        payload = {
            "key": key, "text": step.text, "voiceId": step.plan.voice.id, "generatorId": step.plan.generator_id,
            "seconds": round(seconds, 3), "words": words, "quality": quality, "note": note, "measured": measured,
            "audioSha256": file_digest(record.parent / "audio.wav"),
            "artifactFingerprint": step.plan.artifact_fingerprint,
        }
        temporary = record.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(record)

    def _assemble(
        self,
        project_id: str,
        clips: list[tuple[_Step, Clip]],
        gap_seconds: float,
        publish: Callable[[VoiceOutput], VoiceOutput] | None = None,
    ) -> VoiceOutput:
        project_root = Path(self.projects.get(project_id).project_path)
        gap = b"\x00" * (int(round(gap_seconds * SAMPLE_RATE)) * SAMPLE_WIDTH)
        output_id, audio = self.outputs.reserve(project_id)
        words: list[dict[str, Any]] = []
        segments: list[VoiceOutputSegment] = []
        notes: list[str] = []
        try:
            with wave.open(str(audio), "wb") as handle:
                handle.setnchannels(1)
                handle.setsampwidth(SAMPLE_WIDTH)
                handle.setframerate(SAMPLE_RATE)
                cursor = 0.0
                for index, (step, clip) in enumerate(clips):
                    if index:
                        handle.writeframes(gap)
                        cursor += seconds_of(gap)
                    with wave.open(str(clip.audio), "rb") as source:
                        frames = source.readframes(source.getnframes())
                    handle.writeframes(frames)
                    length = seconds_of(frames)
                    voice = step.plan.voice
                    for word in clip.words:
                        words.append({
                            **word,
                            "start": round(cursor + float(word["start"]), 3),
                            "end": round(cursor + float(word["end"]), 3),
                            "speakerId": voice.speaker_profile_id,
                            "segmentIndex": index,
                        })
                    segments.append(VoiceOutputSegment(
                        row_id=step.row.id, voice_id=voice.id, voice_name=voice.name,
                        speaker_profile_id=voice.speaker_profile_id, engine=step.plan.engine,
                        generator_id=step.plan.generator_id, text=step.text,
                        start=round(cursor, 3), end=round(cursor + length, 3), clip=clip.key,
                    ))
                    if clip.note and clip.note not in notes:
                        notes.append(clip.note)
                    cursor += length
        except Exception:
            self.outputs.discard(project_id, output_id)
            raise

        trusted = sum(1 for word in words if word.get("timingTrusted"))
        quality = "source" if words and trusted == len(words) else "partial" if trusted else "needs-alignment"
        note = notes[0] if notes else (
            "Word timing đo bằng Faster-Whisper DTW trên audio vừa tạo."
            if quality == "source"
            else "Vài từ recognition không khớp Script; vị trí của chúng được ước lượng giữa các từ đã đo."
        )
        first_step, _ = clips[0]
        voices = {step.plan.voice.id for step, _ in clips}
        preview = " ".join(first_step.text.split()[:6])
        name = f"{first_step.plan.voice.name} · {preview}" if len(voices) == 1 and len(clips) == 1 else f"Script · {len(clips)} đoạn · {len(voices)} voice · {preview}"
        generators = {
            step.plan.generator_id: {**step.plan.generation, "language": step.plan.language, "speed": step.plan.speed}
            for step, _ in clips
        }
        candidate = VoiceOutput(
                id=output_id,
                name=name,
                text="\n".join(step.text for step, _ in clips),
                voice_id=first_step.plan.voice.id,
                voice_name=first_step.plan.voice.name if len(voices) == 1 else f"{len(voices)} voice",
                speaker_profile_id=first_step.plan.voice.speaker_profile_id,
                engine=first_step.plan.engine,
                generator_id=first_step.plan.generator_id,
                parameters={"gapSeconds": gap_seconds, "generators": generators},
                duration=round(cursor, 3),
                sample_rate=SAMPLE_RATE,
                audio_path=audio.relative_to(project_root).as_posix(),
                words=words,
                word_timing_quality=quality,
                word_timing_note=note,
                segments=segments,
        )
        try:
            return publish(candidate) if publish is not None else self.outputs.save(project_id, candidate)
        except Exception:
            self.outputs.discard(project_id, output_id)
            raise
