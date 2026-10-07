from __future__ import annotations

import asyncio
import audioop
import gc
import json
import logging
from collections import OrderedDict
from copy import deepcopy
import math
import os
import tempfile
import threading
import time
import uuid
import wave
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from uvicorn.config import LOGGING_CONFIG

from studio_app.local_agreement import LocalAgreement, Word, text_of


def _runtime_root() -> Path:
    configured = os.getenv("PRO4BRO_STUDIO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[1]


RUNTIME_ROOT = _runtime_root()
MODEL_NAME = os.getenv("PRO4BRO_STT_MODEL", "large-v3")
LANGUAGE = os.getenv("PRO4BRO_STT_LANGUAGE", "").strip() or None
DEVICE = os.getenv("PRO4BRO_STT_DEVICE", "cuda")
COMPUTE_TYPE = os.getenv("PRO4BRO_STT_COMPUTE_TYPE", "float16")
MODEL_ROOT = Path(os.getenv("PRO4BRO_STT_MODEL_ROOT", RUNTIME_ROOT / "models"))
SUPPORTED_STT_MODELS = {"tiny", "base", "small", "medium", "large-v3"}
SPEECH_BOUNDARY_MIN_SILENCE_MS = 120
SPEECH_BOUNDARY_MERGE_GAP_SECONDS = 0.24
WORD_GROUP_GAP_SECONDS = 0.20
WORD_EDGE_SNAP_WINDOW_SECONDS = 0.40


def _configure_windows_cuda_dlls() -> None:
    """Make CUDA/cuDNN wheels visible to CTranslate2 on Windows."""
    if os.name != "nt" or not hasattr(os, "add_dll_directory"):
        return
    candidates: set[Path] = set()
    for entry in __import__("sys").path:
        site_packages = Path(entry)
        if site_packages.name.lower() != "site-packages":
            continue
        candidates.add(site_packages / "torch" / "lib")
        candidates.update((site_packages / "nvidia").glob("*"))
    for candidate in candidates:
        binary_dir = candidate / "bin" if candidate.name != "lib" else candidate
        if binary_dir.is_dir():
            try:
                _dll_directory_handles.append(os.add_dll_directory(str(binary_dir)))
            except OSError:
                continue


@dataclass
class ProgressBook:
    values: dict[str, float] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def set(self, job_id: str, value: float) -> None:
        if not job_id:
            return
        with self.lock:
            self.values[job_id] = round(max(0.0, min(100.0, value)), 1)

    def get(self, job_id: str) -> float | None:
        with self.lock:
            return self.values.get(job_id)


progress = ProgressBook()
model_lock = threading.Lock()
loaded_model: Any | None = None
loaded_model_name: str | None = None
loaded_device: str | None = None
loaded_models: OrderedDict[tuple[str, str, str], Any] = OrderedDict()
loaded_model_names: tuple[str, ...] = ()
model_load_count = 0
last_model_load_seconds: float | None = None
diarization_lock = threading.Lock()
loaded_diarization: Any | None = None
loaded_diarization_model: str | None = None
model_load_state = "idle"
model_load_error: str | None = None
_dll_directory_handles: list[Any] = []
app = FastAPI(title="Pro4Bro WhisperX Studio", version="1.0")


@dataclass
class InferenceJob:
    progress_id: str
    cancelled: bool = False
    process: asyncio.subprocess.Process | None = None


inference_jobs: dict[str, InferenceJob] = {}
cancelled_job_ids: dict[str, float] = {}
inference_jobs_lock = threading.Lock()
# Cancellable queue jobs share one local inference slot and keep their model in
# one reusable child process per engine type. The legacy live-session route has
# its own state and does not participate in this queue.
queued_inference_lock = asyncio.Lock()
inference_workers: dict[str, asyncio.subprocess.Process] = {}
inference_worker_models: dict[str, set[str]] = {}
inference_worker_idle_tasks: dict[str, asyncio.Task[None]] = {}
INFERENCE_WORKER_IDLE_SECONDS = 300.0
INFERENCE_MARKER = "@@PRO4BRO_JOB@@"
logger = logging.getLogger(__name__)


def _register_inference_job(progress_id: str) -> InferenceJob:
    now = time.monotonic()
    with inference_jobs_lock:
        for key, expires in list(cancelled_job_ids.items()):
            if expires <= now:
                cancelled_job_ids.pop(key, None)
        job = InferenceJob(progress_id)
        if progress_id and progress_id in cancelled_job_ids:
            job.cancelled = True
        inference_jobs[progress_id] = job
        return job


async def _cancel_inference_job(progress_id: str) -> bool:
    """Cancel one active/queued inference, retaining a tombstone for upload races."""
    with inference_jobs_lock:
        job = inference_jobs.get(progress_id)
        if job is None:
            cancelled_job_ids[progress_id] = time.monotonic() + 900
            return False
        job.cancelled = True
        process = job.process
    if process is not None and process.returncode is None:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
        with inference_jobs_lock:
            for kind, worker in list(inference_workers.items()):
                if worker is process:
                    inference_workers.pop(kind, None)
                    inference_worker_models.pop(kind, None)
    return True


async def _get_inference_worker(kind: str) -> asyncio.subprocess.Process:
    idle_task = inference_worker_idle_tasks.pop(kind, None)
    if idle_task is not None:
        idle_task.cancel()
    worker = inference_workers.get(kind)
    if worker is not None and worker.returncode is None:
        return worker
    worker = await asyncio.create_subprocess_exec(
        sys.executable,
        str(Path(__file__).with_name("inference_worker.py")),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(Path(__file__).resolve().parents[1]),
        limit=1024 * 1024,
    )
    inference_workers[kind] = worker
    return worker


async def _retire_other_inference_workers(kind: str) -> None:
    """Keep only the active engine kind warm in the shared GPU slot."""
    for other_kind, worker in list(inference_workers.items()):
        if other_kind == kind:
            continue
        inference_workers.pop(other_kind, None)
        inference_worker_models.pop(other_kind, None)
        idle_task = inference_worker_idle_tasks.pop(other_kind, None)
        if idle_task is not None:
            idle_task.cancel()
        if worker.returncode is None:
            worker.terminate()
            try:
                await asyncio.wait_for(worker.wait(), timeout=5)
            except asyncio.TimeoutError:
                worker.kill()
                await worker.wait()


def _schedule_worker_idle_shutdown(kind: str, worker: asyncio.subprocess.Process) -> None:
    async def shut_down_when_idle() -> None:
        try:
            await asyncio.sleep(INFERENCE_WORKER_IDLE_SECONDS)
            await queued_inference_lock.acquire()
            try:
                if inference_workers.get(kind) is worker and worker.returncode is None:
                    inference_workers.pop(kind, None)
                    inference_worker_models.pop(kind, None)
                    if worker.stdin is not None:
                        worker.stdin.write(b'{"kind":"shutdown"}\n')
                        await worker.stdin.drain()
                    try:
                        await asyncio.wait_for(worker.wait(), timeout=5)
                    except asyncio.TimeoutError:
                        worker.kill()
                        await worker.wait()
            finally:
                queued_inference_lock.release()
        except asyncio.CancelledError:
            return

    old_task = inference_worker_idle_tasks.pop(kind, None)
    if old_task is not None:
        old_task.cancel()
    inference_worker_idle_tasks[kind] = asyncio.create_task(shut_down_when_idle())


async def _run_cancellable_inference(
    job: InferenceJob,
    kind: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    """Run one inference in its own reusable worker while retaining FIFO order."""
    async with queued_inference_lock:
        if job.cancelled:
            raise HTTPException(status_code=409, detail="Inference was cancelled.")
        result_fd, result_name = tempfile.mkstemp(prefix="pro4bro-job-", suffix=".json")
        os.close(result_fd)
        result_path = Path(result_name)
        result_path.unlink(missing_ok=True)
        payload = {
            **arguments,
            "kind": kind,
            "result_path": str(result_path),
            "progress_id": job.progress_id,
        }
        process: asyncio.subprocess.Process | None = None
        try:
            await _retire_other_inference_workers(kind)
            process = await _get_inference_worker(kind)
            with inference_jobs_lock:
                job.process = process
                already_cancelled = job.cancelled
            if already_cancelled:
                process.terminate()
                await process.wait()
                inference_workers.pop(kind, None)
                raise HTTPException(status_code=409, detail="Inference was cancelled.")
            assert process.stdin is not None and process.stdout is not None
            process.stdin.write(json.dumps(payload, ensure_ascii=False).encode("utf-8") + b"\n")
            await process.stdin.drain()
            completed = False
            while line := await process.stdout.readline():
                if not line.startswith(INFERENCE_MARKER.encode("ascii")):
                    logger.warning("Inference worker %s: %s", kind,
                                   line.decode("utf-8", errors="replace").rstrip()[:2048])
                    continue
                try:
                    message = json.loads(line[len(INFERENCE_MARKER):])
                except (UnicodeDecodeError, ValueError):
                    continue
                if message.get("progress_id") != job.progress_id:
                    continue
                if message.get("kind") == "progress":
                    progress.set(job.progress_id, float(message.get("value", 0)))
                elif message.get("kind") == "done":
                    completed = True
                    break
            if job.cancelled:
                raise HTTPException(status_code=409, detail="Inference was cancelled.")
            if not completed or process.returncode is not None or not result_path.is_file():
                if process.returncode is None:
                    process.terminate()
                    await process.wait()
                inference_workers.pop(kind, None)
                inference_worker_models.pop(kind, None)
                raise RuntimeError("Inference worker exited without a result.")
            result = json.loads(result_path.read_text(encoding="utf-8"))
            if result.get("error"):
                raise RuntimeError(str(result["error"]))
            requested_model = arguments.get("model")
            if requested_model:
                inference_worker_models.setdefault(kind, set()).add(str(requested_model))
            return dict(result.get("result") or {})
        finally:
            with inference_jobs_lock:
                if job.process is process:
                    job.process = None
            result_path.unlink(missing_ok=True)
            if process is not None and process.returncode is None and not job.cancelled:
                _schedule_worker_idle_shutdown(kind, process)


async def _send_worker_control(worker: asyncio.subprocess.Process, kind: str) -> None:
    if worker.returncode is not None or worker.stdin is None or worker.stdout is None:
        return
    progress_id = uuid.uuid4().hex
    worker.stdin.write(json.dumps({"kind": kind, "progress_id": progress_id}) .encode("utf-8") + b"\n")
    await worker.stdin.drain()
    while line := await worker.stdout.readline():
        if not line.startswith(INFERENCE_MARKER.encode("ascii")):
            continue
        try:
            message = json.loads(line[len(INFERENCE_MARKER):])
        except (UnicodeDecodeError, ValueError):
            continue
        if message.get("kind") == "done" and message.get("progress_id") == progress_id:
            return


@app.post("/api/runtime/release")
async def release_inference_models() -> dict[str, bool]:
    """Release warm sidecar models before another local workload takes the GPU."""
    if queued_inference_lock.locked():
        raise HTTPException(status_code=409, detail="Speaker or STT inference is active.")
    await queued_inference_lock.acquire()
    try:
        workers = list(inference_workers.values())
        inference_workers.clear()
        inference_worker_models.clear()
        for task in inference_worker_idle_tasks.values():
            task.cancel()
        inference_worker_idle_tasks.clear()
        for worker in workers:
            if worker.returncode is None:
                worker.terminate()
                try:
                    await asyncio.wait_for(worker.wait(), timeout=5)
                except asyncio.TimeoutError:
                    worker.kill()
                    await worker.wait()
        return {"released": True}
    finally:
        queued_inference_lock.release()


@app.on_event("shutdown")
async def stop_inference_workers() -> None:
    async with queued_inference_lock:
        workers = list(inference_workers.values())
        inference_workers.clear()
        inference_worker_models.clear()
        for task in inference_worker_idle_tasks.values():
            task.cancel()
        inference_worker_idle_tasks.clear()
        for worker in workers:
            if worker.returncode is None:
                try:
                    await _send_worker_control(worker, "shutdown")
                    await asyncio.wait_for(worker.wait(), timeout=5)
                except (OSError, asyncio.TimeoutError):
                    worker.kill()
                    await worker.wait()


def _audio_duration(path: Path) -> tuple[float, int]:
    try:
        with wave.open(str(path), "rb") as input_file:
            frame_rate = input_file.getframerate()
            frames = input_file.getnframes()
            return (frames / frame_rate if frame_rate else 0.0), frame_rate
    except (wave.Error, OSError):
        return 0.0, 24000


def _is_near_silent(path: Path) -> bool:
    """Reject genuine silence before ASR can generate a hallucinated transcript.

    This runs before any model work, so its cost is dead time the user watches at
    4% progress. A per-sample Python loop measured 3.054 s on a 236 second file,
    which extrapolates to roughly 128 s on a 2.7 hour recording. The same
    reduction in C takes 0.072 s on that file - 42 times faster.

    Peak is exact. `audioop.rms` rounds each block to an integer, so the combined
    RMS can differ from the per-sample loop by well under one unit (measured
    3525.05 against 3524.61 on the sample above). That is immaterial against a
    threshold of 52, where anything near the boundary is ambiguous either way.
    """
    try:
        with wave.open(str(path), "rb") as input_file:
            if input_file.getsampwidth() != 2 or input_file.getnchannels() != 1:
                return False
            sample_count = 0
            sum_squares = 0.0
            peak = 0
            while data := input_file.readframes(24000 * 8):
                block_samples = len(data) // 2
                if not block_samples:
                    continue
                peak = max(peak, audioop.max(data, 2))
                # Squared block RMS times its sample count reconstructs the exact
                # global sum of squares, so the overall RMS is not an average of
                # averages over uneven blocks.
                sum_squares += float(audioop.rms(data, 2)) ** 2 * block_samples
                sample_count += block_samples
            if not sample_count:
                return True
            rms = math.sqrt(sum_squares / sample_count)
            return peak <= 104 and rms <= 52
    except (wave.Error, OSError, audioop.error):
        return False


def _resolve_device() -> tuple[str, str]:
    if DEVICE != "cuda":
        return DEVICE, COMPUTE_TYPE
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda", COMPUTE_TYPE
    except ImportError:
        pass
    return "cpu", "int8"


def _model_cache_capacity(device: str) -> int:
    """Keep live and detailed models warm only on GPUs large enough for both."""
    if device != "cuda":
        return 1
    try:
        import torch
        free, total = torch.cuda.mem_get_info(0)
        return 2 if total >= 20 * 1024 ** 3 and free >= 6 * 1024 ** 3 else 1
    except (ImportError, RuntimeError, AssertionError):
        return 1


def _model(model_name: str = MODEL_NAME) -> tuple[Any, str]:
    global loaded_model, loaded_model_name, loaded_device, model_load_error, model_load_state
    global loaded_model_names, model_load_count, last_model_load_seconds
    device, compute_type = _resolve_device()
    key = model_name, device, compute_type
    with model_lock:
        if key in loaded_models:
            loaded_models.move_to_end(key)
            loaded_model_names = tuple(item[0] for item in loaded_models)
            loaded_model = loaded_models[key]
            loaded_model_name = model_name
            loaded_device = device
            return loaded_model, device
        model_load_error = None
        model_load_state = "importing Faster-Whisper"
        capacity = _model_cache_capacity(device)
        while len(loaded_models) >= capacity:
            loaded_models.popitem(last=False)
        loaded_model_names = tuple(item[0] for item in loaded_models)
        loaded_model = None
        gc.collect()
        try:
            _configure_windows_cuda_dlls()
            from faster_whisper import WhisperModel

            MODEL_ROOT.mkdir(parents=True, exist_ok=True)
            model_load_state = "loading ASR model"
            started = time.perf_counter()
            try:
                model = WhisperModel(model_name, device=device, compute_type=compute_type,
                                     download_root=str(MODEL_ROOT))
            except Exception as exc:
                # A cached model may have consumed the headroom needed by the
                # next one. Fall back to the previous single-model behavior.
                if loaded_models and "out of memory" in str(exc).lower():
                    loaded_models.clear()
                    loaded_model_names = ()
                    gc.collect()
                    model = WhisperModel(model_name, device=device, compute_type=compute_type,
                                         download_root=str(MODEL_ROOT))
                else:
                    raise
        except Exception as exc:
            model_load_state = "failed"
            model_load_error = str(exc)
            raise
        loaded_models[key] = model
        loaded_model_names = tuple(item[0] for item in loaded_models)
        model_load_count += 1
        last_model_load_seconds = round(time.perf_counter() - started, 3)
        loaded_model = model
        loaded_model_name = model_name
        loaded_device = device
        model_load_state = "ready"
        return loaded_model, device

def _value(item: Any, name: str, default: Any = None) -> Any:
    return item.get(name, default) if isinstance(item, dict) else getattr(item, name, default)


def _merge_speech_spans(
    spans: list[tuple[float, float]],
    max_gap: float = SPEECH_BOUNDARY_MERGE_GAP_SECONDS,
) -> list[tuple[float, float]]:
    merged: list[tuple[float, float]] = []
    for start, end in sorted(spans):
        if not math.isfinite(start) or not math.isfinite(end) or end <= start:
            continue
        if merged and start - merged[-1][1] <= max_gap:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((max(0.0, start), end))
    return merged


RECOGNITION_SAMPLE_RATE = 16000


def _decode_recognition_audio(path: Path) -> Any:
    """Decode the recording once, at the rate both passes need."""
    from faster_whisper.audio import decode_audio

    return decode_audio(str(path), sampling_rate=RECOGNITION_SAMPLE_RATE)


def _fine_speech_spans(audio: Any) -> list[tuple[float, float]]:
    """Return unpadded Silero speech spans for waveform-edge refinement.

    Takes the already-decoded waveform. Decoding the file a second time here cost
    a second full-length float32 buffer - about 632 MB on a 2.7 hour recording -
    immediately after the recognition pass had finished with its own copy.
    """
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    raw_spans = get_speech_timestamps(
        audio,
        VadOptions(
            min_speech_duration_ms=40,
            min_silence_duration_ms=SPEECH_BOUNDARY_MIN_SILENCE_MS,
            speech_pad_ms=0,
        ),
        sampling_rate=RECOGNITION_SAMPLE_RATE,
    )
    return _merge_speech_spans(
        [
            (
                float(span["start"]) / RECOGNITION_SAMPLE_RATE,
                float(span["end"]) / RECOGNITION_SAMPLE_RATE,
            )
            for span in raw_spans
        ]
    )


def _refine_word_boundaries(
    words: list[dict[str, Any]], speech_spans: list[tuple[float, float]]
) -> int:
    """Snap only phrase-edge words onto nearby unpadded acoustic boundaries.

    Faster-Whisper deliberately pads VAD chunks by 400 ms. DTW can attach the
    first word to that padding. Segment-aware, short-gap groups keep continuous
    Vietnamese speech bounded, while middle-word DTW intervals remain untouched.
    """
    if not words or not speech_spans:
        return 0

    groups: list[tuple[int, int]] = []
    group_start = 0
    for index in range(1, len(words)):
        gap = float(words[index]["start"]) - float(words[index - 1]["end"])
        previous_segment = words[index - 1].get("segmentIndex")
        current_segment = words[index].get("segmentIndex")
        segment_changed = (
            previous_segment is not None
            and current_segment is not None
            and previous_segment != current_segment
        )
        if segment_changed or gap > WORD_GROUP_GAP_SECONDS:
            groups.append((group_start, index))
            group_start = index
    groups.append((group_start, len(words)))

    refined = 0
    for start_index, end_index in groups:
        source_start = float(words[start_index]["start"])
        source_end = float(words[end_index - 1]["end"])
        onset_candidates = [
            start
            for start, _ in speech_spans
            if abs(start - source_start) <= WORD_EDGE_SNAP_WINDOW_SECONDS
        ]
        offset_candidates = [
            end
            for _, end in speech_spans
            if abs(end - source_end) <= WORD_EDGE_SNAP_WINDOW_SECONDS
        ]
        group_snapped = False
        first = words[start_index]
        last = words[end_index - 1]
        if onset_candidates:
            target_start = min(onset_candidates, key=lambda value: abs(value - source_start))
            snapped_start = round(target_start, 3)
            if snapped_start < float(first["end"]) and snapped_start != float(first["start"]):
                first["start"] = snapped_start
                first["timingSource"] = "faster-whisper-dtw+silero-edge"
                group_snapped = True
        if offset_candidates:
            target_end = min(offset_candidates, key=lambda value: abs(value - source_end))
            snapped_end = round(target_end, 3)
            if snapped_end > float(last["start"]) and snapped_end != float(last["end"]):
                last["end"] = snapped_end
                last["timingSource"] = "faster-whisper-dtw+silero-edge"
                group_snapped = True
        if group_snapped:
            refined += 1
    return refined


def _native_transcription_item(
    raw_segments: Any,
    *,
    duration: float,
    sample_rate: int,
    language_code: str,
    model_name: str,
    progress_id: str = "",
) -> dict[str, Any]:
    """Convert Faster-Whisper DTW words without inventing missing boundaries."""
    words: list[dict[str, Any]] = []
    text_parts: list[str] = []
    untimed_segments = 0
    safe_duration = max(0.0, float(duration))

    for segment_index, segment in enumerate(raw_segments):
        segment_text = str(_value(segment, "text", "") or "").strip()
        if segment_text:
            text_parts.append(segment_text)
        timed_in_segment = 0
        for raw_word in _value(segment, "words", None) or []:
            text = str(_value(raw_word, "word", "") or "").strip()
            try:
                start = max(0.0, float(_value(raw_word, "start")))
                end = min(safe_duration, float(_value(raw_word, "end")))
            except (TypeError, ValueError):
                continue
            if not text or not math.isfinite(start) or not math.isfinite(end) or end <= start:
                continue
            word: dict[str, Any] = {
                "text": text,
                "start": round(start, 3),
                "end": round(end, 3),
                "timingSource": "faster-whisper-dtw",
                "segmentIndex": segment_index,
            }
            try:
                confidence = float(_value(raw_word, "probability"))
            except (TypeError, ValueError):
                confidence = math.nan
            if math.isfinite(confidence):
                word["confidence"] = round(max(0.0, min(1.0, confidence)), 4)
            words.append(word)
            timed_in_segment += 1
        if segment_text and timed_in_segment == 0:
            untimed_segments += 1
        try:
            segment_end = float(_value(segment, "end", 0.0))
        except (TypeError, ValueError):
            segment_end = 0.0
        if safe_duration > 0:
            progress.set(progress_id, 16 + min(76.0, max(0.0, segment_end / safe_duration) * 76.0))

    text = " ".join(text_parts).strip()
    if words and untimed_segments == 0:
        quality = "source"
        note = "Faster-Whisper cross-attention/DTW word timing (20 ms acoustic frame resolution)."
    elif text:
        quality = "needs-alignment"
        note = (
            f"{untimed_segments or 1} speech segment không có word timing DTW; "
            "không tạo timestamp chia đều để tránh subtitle lệch waveform."
        )
    else:
        quality = "unverified"
        note = None

    return {
        "id": f"stt-{uuid.uuid4().hex[:12]}",
        "duration": safe_duration,
        "sample_rate": sample_rate,
        "text": text,
        "words": words,
        "language": language_code,
        "model": model_name,
        "transcription_engine": "faster-whisper-native-dtw",
        "word_timing_quality": quality,
        "word_timing_note": note,
    }

# ---------- live transcript ----------
# One buffer and one agreement policy per recording. Held here because this is
# where the model lives; a second service would mean a second copy of it.
live_sessions: dict[str, dict[str, Any]] = {}
live_lock = threading.Lock()

# Every pass re-reads the whole buffer, so the buffer length is what decides
# whether live transcription keeps up. Measured here: an 18 s buffer took 3.2-4.8 s
# a pass against a 4 s chunk cadence - at the edge of falling behind. Twelve keeps
# it comfortably inside.
LIVE_BUFFER_LIMIT_SECONDS = 12.0
#: Kept behind the last committed word so the next pass still has context.
LIVE_CONTEXT_SECONDS = 2.0


def _live_words(audio: Any, model_name: str, language: str | None) -> tuple[list[Word], str]:
    """One pass over the buffer, as words. No artifacts, no progress, no disk.

    Detection is unreliable on a few seconds of cold audio - one pass over a
    Vietnamese clip came back as Chinese - so the caller passes the project's own
    language when it knows it. Pinning whatever the *first* pass guessed was
    tried and was worse: it made an early mistake permanent, where letting each
    pass decide at least recovers once there is more audio to go on.
    """
    model, _device = _model(model_name)
    segments, info = model.transcribe(
        audio,
        language=language or LANGUAGE,
        task="transcribe",
        beam_size=1,
        condition_on_previous_text=False,
        without_timestamps=False,
        word_timestamps=True,
        vad_filter=True,
    )
    found: list[Word] = []
    for segment in segments:
        for word in _value(segment, "words", None) or []:
            text = str(_value(word, "word", "") or "").strip()
            if text:
                found.append(Word(text, float(_value(word, "start", 0.0) or 0.0), float(_value(word, "end", 0.0) or 0.0)))
    return found, str(_value(info, "language", "") or "").strip()


def _transcribe(path: Path, progress_id: str, model_name: str = MODEL_NAME, language: str | None = None) -> dict[str, Any]:
    progress.set(progress_id, 4)
    duration, sample_rate = _audio_duration(path)
    if _is_near_silent(path):
        progress.set(progress_id, 100)
        return {"id": f"stt-{uuid.uuid4().hex[:12]}", "duration": duration, "sample_rate": sample_rate, "text": "", "words": [], "language": language or LANGUAGE or "", "model": model_name}
    model, _device = _model(model_name)
    progress.set(progress_id, 16)
    audio = _decode_recognition_audio(path)
    segments, info = model.transcribe(
        audio,
        # A caller that knows the language says so: detection on a few seconds
        # of speech is unreliable, and generated speech arrives in short rows.
        language=language or LANGUAGE,
        task="transcribe",
        beam_size=5,
        patience=1,
        condition_on_previous_text=False,
        without_timestamps=False,
        word_timestamps=True,
        vad_filter=True,
        hallucination_silence_threshold=1.0,
    )
    language_code = str(_value(info, "language", LANGUAGE or "") or "").strip()
    item = _native_transcription_item(
        segments,
        duration=duration,
        sample_rate=sample_rate,
        language_code=language_code,
        model_name=model_name,
        progress_id=progress_id,
    )
    if item.get("word_timing_quality") == "source" and item.get("words"):
        progress.set(progress_id, 94)
        try:
            refined_groups = _refine_word_boundaries(
                item["words"], _fine_speech_spans(audio)
            )
        except Exception as exc:
            refined_groups = 0
            item["word_timing_note"] += (
                f" Acoustic boundary refinement unavailable ({type(exc).__name__}); "
                "DTW source timing was retained."
            )
        if refined_groups:
            item["transcription_engine"] = "faster-whisper-native-dtw+silero-edge"
            item["word_timing_note"] = (
                "Faster-Whisper DTW word timing snapped to nearby unpadded Silero VAD "
                f"phrase edges ({refined_groups} phrase groups; middle words unchanged)."
            )
        else:
            item["word_timing_note"] += (
                " Silero edge refinement found no phrase boundary within ±0.40 s; "
                "original DTW timing was retained."
            )
    progress.set(progress_id, 100)
    return item

def _diarization_model(model_name: str, token: str) -> Any:
    global loaded_diarization, loaded_diarization_model
    if not token.strip():
        raise RuntimeError("Cần Hugging Face token và quyền truy cập model pyannote community-1.")
    with diarization_lock:
        if loaded_diarization is not None and loaded_diarization_model == model_name:
            return loaded_diarization
        try:
            import torch
            from pyannote.audio import Pipeline
        except ImportError as exc:
            raise RuntimeError("Thiếu pyannote.audio 4.x. Chạy scripts\\setup-stt-runtime.ps1 để cập nhật runtime.") from exc
        try:
            pipeline = Pipeline.from_pretrained(model_name, token=token, cache_dir=str(MODEL_ROOT / "diarization"))
            if torch.cuda.is_available() and DEVICE == "cuda":
                pipeline.to(torch.device("cuda"))
        except Exception as exc:
            raise RuntimeError("Không tải được model Speaker Diarization. Hãy chấp nhận điều khoản pyannote community-1 trên Hugging Face và kiểm tra token. " + str(exc)) from exc
        loaded_diarization = pipeline
        loaded_diarization_model = model_name
        return pipeline


def _load_diarization_waveform(path: Path) -> dict[str, Any]:
    """Bypass torchcodec by handing pyannote a decoded mono 16 kHz tensor."""
    try:
        import numpy as np
        import torch
        with wave.open(str(path), "rb") as input_file:
            if input_file.getnchannels() != 1 or input_file.getsampwidth() != 2:
                raise RuntimeError("Diarization cần PCM WAV mono 16-bit; analysis audio của Pro4Bro phải được tạo lại.")
            sample_rate = input_file.getframerate()
            samples = np.frombuffer(input_file.readframes(input_file.getnframes()), dtype="<i2").astype("float32") / 32768.0
    except (wave.Error, OSError) as exc:
        raise RuntimeError("Không đọc được analysis WAV cho Speaker Diarization.") from exc
    waveform = torch.from_numpy(samples).unsqueeze(0)
    target_rate = 16000
    if sample_rate != target_rate:
        # torchaudio applies a windowed-sinc low-pass before decimating.
        # `interpolate(mode="linear")` does not, so content above the new Nyquist
        # folded back into the band: measured on a 24 kHz analysis WAV it left
        # 57% excess energy in 6.5-8 kHz and about 10% RMS error overall, in the
        # region that carries much of what distinguishes one voice from another.
        import torchaudio

        waveform = torchaudio.functional.resample(waveform, sample_rate, target_rate)
    return {"waveform": waveform, "sample_rate": target_rate}

def overlap_regions(segments: Any) -> list[dict[str, float]]:
    """Where two or more voices sound at once, as plain start/end pairs.

    Exclusive diarization is what makes word labels clean - every instant has
    exactly one owner - and for that same reason it cannot say where people
    talked over each other: the overlap is resolved away before it reaches us.
    The regular annotation still holds it, so the regions are read from there
    and carried alongside, never mixed into the spans the labels come from.
    """
    regions: list[dict[str, float]] = []
    for segment in segments or []:
        try:
            start, end = max(0.0, float(segment.start)), max(0.0, float(segment.end))
        except (AttributeError, TypeError, ValueError):
            continue
        if end > start:
            regions.append({"start": round(start, 3), "end": round(end, 3)})
    return regions


def _diarize(path: Path, progress_id: str, model_name: str, token: str, expected_speakers: int = 0) -> dict[str, list[dict[str, Any]]]:
    progress.set(progress_id, 3)
    pipeline = _diarization_model(model_name, token)
    progress.set(progress_id, 15)
    audio = _load_diarization_waveform(path)
    output = pipeline(audio, num_speakers=expected_speakers) if expected_speakers > 0 else pipeline(audio)
    progress.set(progress_id, 92)
    annotation = getattr(output, "exclusive_speaker_diarization", None) or getattr(output, "speaker_diarization", output)
    spans: list[dict[str, Any]] = []
    for turn, speaker in annotation:
        try:
            start, end = max(0.0, float(turn.start)), max(0.0, float(turn.end))
        except (AttributeError, TypeError, ValueError):
            continue
        if end > start:
            spans.append({"speaker": str(speaker), "start": round(start, 3), "end": round(end, 3)})
    overlaps: list[dict[str, float]] = []
    regular = getattr(output, "speaker_diarization", None)
    try:
        if regular is not None and hasattr(regular, "get_overlap"):
            overlaps = overlap_regions(regular.get_overlap())
    except Exception:
        # Overlap is evidence for training, not for labelling. Losing it must
        # never fail a diarization that already produced good labels.
        overlaps = []
    progress.set(progress_id, 100)
    return {"spans": spans, "overlaps": overlaps}


@app.get("/api/audio/diarize/{progress_id}/progress")
def diarize_progress(progress_id: str) -> dict[str, float]:
    return {"progress": progress.get(progress_id) or 0.0}


@app.post("/api/audio/diarize/{progress_id}/cancel")
async def cancel_diarize(progress_id: str) -> dict[str, bool]:
    return {"cancelled": await _cancel_inference_job(progress_id)}


@app.post("/api/audio/diarize")
async def diarize_audio(file: UploadFile = File(...), progress_id: str = Form(""), model: str = Form("pyannote/speaker-diarization-community-1"), expected_speakers: int = Form(0), huggingface_token: str | None = Header(default=None, alias="X-Pro4Bro-HuggingFace-Token")) -> dict[str, Any]:
    started = time.perf_counter()
    if not (huggingface_token or "").strip():
        raise HTTPException(status_code=503, detail="Cần Hugging Face token cho Speaker Diarization. Mở Windows → Preferences để cấu hình.")
    effective_id = progress_id or uuid.uuid4().hex
    job = _register_inference_job(effective_id)
    suffix = Path(file.filename or "analysis.wav").suffix or ".wav"
    progress.set(effective_id, 1)
    try:
        if job.cancelled:
            raise HTTPException(status_code=409, detail="Inference was cancelled.")
        with tempfile.TemporaryDirectory(prefix="pro4bro-diarize-") as temporary_directory:
            destination = Path(temporary_directory) / f"input{suffix}"
            with destination.open("wb") as output:
                while chunk := await file.read(1024 * 1024):
                    if job.cancelled:
                        raise HTTPException(status_code=409, detail="Inference was cancelled.")
                    output.write(chunk)
            result = await _run_cancellable_inference(job, "diarize", {
                "path": str(destination),
                "model": model,
                "token": huggingface_token,
                "expected_speakers": max(0, min(8, expected_speakers)),
            })
        return {"spans": result["spans"], "overlaps": result["overlaps"], "elapsed": round(time.perf_counter() - started, 2)}
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Speaker Diarization thất bại: {exc}") from exc
    finally:
        with inference_jobs_lock:
            if inference_jobs.get(effective_id) is job:
                inference_jobs.pop(effective_id, None)

@app.post("/api/audio/live/chunk")
async def live_chunk(
    file: UploadFile = File(...),
    session: str = Form(...),
    model: str = Form("tiny"),
    language: str = Form(""),
) -> dict[str, Any]:
    """Add audio to a live session and report what is now certain.

    The caller sends the newest slice; this keeps the running buffer, transcribes
    the whole of it, and returns the prefix two passes have agreed on. Committed
    text never changes, so a caller can append it and forget it - only `pending`
    is provisional.
    """
    payload = await file.read()
    return await asyncio.to_thread(_advance_live_session, session, payload, model, language.strip() or None)


def _advance_live_session(
    session: str, payload: bytes, model_name: str, language: str | None
) -> dict[str, Any]:
    import numpy as np

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        handle.write(payload)
        chunk_path = Path(handle.name)
    try:
        arriving = _decode_recognition_audio(chunk_path)
    finally:
        chunk_path.unlink(missing_ok=True)

    with live_lock:
        state = live_sessions.setdefault(
            session,
            {"audio": np.zeros(0, dtype="float32"), "agreement": LocalAgreement()},
        )
        state["audio"] = np.concatenate([state["audio"], arriving])
        audio = state["audio"]
        agreement: LocalAgreement = state["agreement"]

    hypothesis, _detected = _live_words(audio, model_name, language)
    committed = agreement.update(hypothesis)

    with live_lock:
        held = len(state["audio"]) / RECOGNITION_SAMPLE_RATE
        if held > LIVE_BUFFER_LIMIT_SECONDS and agreement.committed:
            # Scroll to just before the last committed word so the next pass keeps
            # a little context, and drop everything settled before it.
            keep_from = max(0.0, agreement.committed[-1].end - agreement.offset - LIVE_CONTEXT_SECONDS)
            if keep_from > 0:
                state["audio"] = state["audio"][int(keep_from * RECOGNITION_SAMPLE_RATE):]
                agreement.scroll_to(keep_from)
    return {
        "committed": text_of(committed),
        "text": text_of(agreement.committed),
        "pending": text_of(agreement.pending),
    }


@app.post("/api/audio/live/end")
async def live_end(session: str = Form(...)) -> dict[str, Any]:
    """Recording stopped: take the provisional tail and forget the session."""
    with live_lock:
        state = live_sessions.pop(session, None)
    if not state:
        return {"text": "", "committed": ""}
    agreement: LocalAgreement = state["agreement"]
    tail = agreement.flush()
    return {"committed": text_of(tail), "text": text_of(agreement.committed), "pending": ""}


@app.get("/api/health")
async def health() -> dict[str, str]:
    # A listener can be ready while CUDA/model initialization is slow or fails.
    # This probe must stay independent of inference and its worker thread pool.
    return {"status": "ok", "service": "stt-studio"}


@app.get("/api/status")
def status() -> dict[str, Any]:
    device, compute_type = _resolve_device()
    child_models = sorted({model for models in inference_worker_models.values() for model in models})
    return {"status": "ok", "engine": "faster-whisper", "timing_engine": "cross-attention-dtw", "model": MODEL_NAME, "device": device, "compute_type": compute_type, "loaded": loaded_model is not None or bool(child_models), "load_state": model_load_state, "load_error": model_load_error,
            "loaded_models": sorted(set(loaded_model_names) | set(child_models)), "model_load_count": model_load_count,
            "last_model_load_seconds": last_model_load_seconds}


@app.get("/api/audio/import/{progress_id}/progress")
def import_progress(progress_id: str) -> dict[str, float]:
    # Polling may run before the job is registered; 0 avoids a false 404.
    return {"progress": progress.get(progress_id) or 0.0}


@app.post("/api/audio/import/{progress_id}/cancel")
async def cancel_import(progress_id: str) -> dict[str, bool]:
    return {"cancelled": await _cancel_inference_job(progress_id)}


def _resolve_local_source(value: str) -> Path:
    """Accept an in-workspace path so a local file is not copied to be read.

    Analysis WAVs reach 600 MB. Uploading one over loopback to a sidecar on the
    same machine wrote it a second time into a temporary directory before any
    decoding started. The sidecar only ever listens on 127.0.0.1, but a path
    coming in over HTTP still gets confined to the configured workspace roots so
    it cannot be pointed at arbitrary files.
    """
    candidate = Path(value).expanduser().resolve()
    roots: list[Path] = []
    for variable in ("PRO4BRO_DATA_ROOT", "PRO4BRO_STUDIO_ROOT"):
        configured = os.getenv(variable)
        if configured:
            roots.append(Path(configured).expanduser().resolve())
    if not roots:
        raise HTTPException(
            status_code=400,
            detail="Sidecar chưa được cấu hình PRO4BRO_DATA_ROOT nên không nhận source_path.",
        )
    if not any(candidate == root or root in candidate.parents for root in roots):
        raise HTTPException(status_code=400, detail="source_path nằm ngoài workspace Pro4Bro.")
    if not candidate.is_file():
        raise HTTPException(status_code=400, detail="source_path không tồn tại.")
    return candidate


@app.post("/api/audio/import")
async def import_audio(file: UploadFile | None = File(None), origin: str = Form("import"), realtime_text: str = Form(""), progress_id: str = Form(""), model: str = Form(MODEL_NAME), source_path: str = Form(""), language: str = Form("")) -> dict[str, Any]:
    del origin, realtime_text
    if model not in SUPPORTED_STT_MODELS:
        raise HTTPException(status_code=400, detail="Model STT không được hỗ trợ.")
    started = time.perf_counter()
    effective_id = progress_id or uuid.uuid4().hex
    job = _register_inference_job(effective_id)
    progress.set(effective_id, 1)
    try:
        if job.cancelled:
            raise HTTPException(status_code=409, detail="Inference was cancelled.")
        if source_path.strip():
            path = _resolve_local_source(source_path.strip())
            item = await _run_cancellable_inference(job, "transcribe", {
                "path": str(path), "model": model, "language": language.strip() or None,
            })
            return {"item": item, "elapsed": round(time.perf_counter() - started, 2)}

        if file is None:
            raise HTTPException(status_code=400, detail="Cần file upload hoặc source_path.")
        suffix = Path(file.filename or "analysis.wav").suffix or ".wav"
        with tempfile.TemporaryDirectory(prefix="pro4bro-stt-") as temporary_directory:
            destination = Path(temporary_directory) / f"input{suffix}"
            with destination.open("wb") as output:
                while chunk := await file.read(1024 * 1024):
                    if job.cancelled:
                        raise HTTPException(status_code=409, detail="Inference was cancelled.")
                    output.write(chunk)
            item = await _run_cancellable_inference(job, "transcribe", {
                "path": str(destination), "model": model, "language": language.strip() or None,
            })
        return {"item": item, "elapsed": round(time.perf_counter() - started, 2)}
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"WhisperX STT thất bại: {exc}") from exc
    finally:
        with inference_jobs_lock:
            if inference_jobs.get(effective_id) is job:
                inference_jobs.pop(effective_id, None)

if __name__ == "__main__":
    import uvicorn

    timestamped_logging_config = deepcopy(LOGGING_CONFIG)
    timestamped_logging_config["formatters"]["default"].update(
        {"fmt": "%(asctime)s | %(levelprefix)s%(message)s", "datefmt": "%Y-%m-%d %H:%M:%S"}
    )
    timestamped_logging_config["formatters"]["access"].update(
        {"fmt": '%(asctime)s | %(levelprefix)s%(client_addr)s - "%(request_line)s" %(status_code)s', "datefmt": "%Y-%m-%d %H:%M:%S"}
    )
    uvicorn.run(
        app,
        host=os.getenv("PRO4BRO_STUDIO_HOST", "127.0.0.1"),
        port=int(os.getenv("PRO4BRO_STUDIO_PORT", "18081")),
        log_config=timestamped_logging_config,
    )




