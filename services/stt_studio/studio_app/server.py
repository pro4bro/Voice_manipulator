from __future__ import annotations

import asyncio
from copy import deepcopy
import math
import os
import tempfile
import threading
import time
import uuid
import wave
from array import array
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from uvicorn.config import LOGGING_CONFIG


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
diarization_lock = threading.Lock()
loaded_diarization: Any | None = None
loaded_diarization_model: str | None = None
model_load_state = "idle"
model_load_error: str | None = None
_dll_directory_handles: list[Any] = []
app = FastAPI(title="Pro4Bro WhisperX Studio", version="1.0")


def _audio_duration(path: Path) -> tuple[float, int]:
    try:
        with wave.open(str(path), "rb") as input_file:
            frame_rate = input_file.getframerate()
            frames = input_file.getnframes()
            return (frames / frame_rate if frame_rate else 0.0), frame_rate
    except (wave.Error, OSError):
        return 0.0, 24000


def _is_near_silent(path: Path) -> bool:
    """Reject genuine silence before ASR can generate a hallucinated transcript."""
    try:
        with wave.open(str(path), "rb") as input_file:
            if input_file.getsampwidth() != 2 or input_file.getnchannels() != 1:
                return False
            sample_count = 0
            sum_squares = 0
            peak = 0
            while data := input_file.readframes(24000 * 8):
                samples = array("h")
                samples.frombytes(data)
                if samples.itemsize != 2:
                    return False
                sample_count += len(samples)
                for sample in samples:
                    absolute = abs(sample)
                    peak = max(peak, absolute)
                    sum_squares += sample * sample
            if not sample_count:
                return True
            rms = math.sqrt(sum_squares / sample_count)
            return peak <= 104 and rms <= 52
    except (wave.Error, OSError):
        return False


def _import_whisperx() -> Any:
    _configure_windows_cuda_dlls()
    try:
        import whisperx
    except ImportError as exc:
        raise RuntimeError("WhisperX chưa được cài. Chạy scripts\\setup-stt-runtime.ps1 trước.") from exc
    return whisperx


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


def _model(model_name: str = MODEL_NAME) -> tuple[Any, str]:
    global loaded_model, loaded_model_name, loaded_device, model_load_error, model_load_state
    device, compute_type = _resolve_device()
    with model_lock:
        if loaded_model is not None and loaded_model_name == model_name and loaded_device == device:
            return loaded_model, device
        model_load_error = None
        model_load_state = "importing WhisperX"
        try:
            whisperx = _import_whisperx()
            MODEL_ROOT.mkdir(parents=True, exist_ok=True)
            model_load_state = "loading ASR and VAD models"
            loaded_model = whisperx.load_model(model_name, device, compute_type=compute_type, language=LANGUAGE, vad_method="silero", download_root=str(MODEL_ROOT))
        except Exception as exc:
            model_load_state = "failed"
            model_load_error = str(exc)
            raise
        loaded_model_name = model_name
        loaded_device = device
        model_load_state = "ready"
        return loaded_model, device

def _words_from_result(result: dict[str, Any]) -> list[dict[str, float | str]]:
    words: list[dict[str, float | str]] = []
    for segment in result.get("segments", []):
        for word in segment.get("words", []) or []:
            text = str(word.get("word", "")).strip()
            start = word.get("start")
            end = word.get("end")
            if not text or start is None or end is None:
                continue
            try:
                start_value = max(0.0, float(start))
                end_value = max(start_value, float(end))
            except (TypeError, ValueError):
                continue
            words.append({"text": text, "start": round(start_value, 3), "end": round(end_value, 3)})
    return words


def _segment_text(segments: list[dict[str, Any]]) -> str:
    return " ".join(str(segment.get("text") or "").strip() for segment in segments).strip()


def _fallback_words_from_segments(segments: list[dict[str, Any]]) -> list[dict[str, float | str]]:
    """Keep the recognized transcript when a language aligner omitted word timings.

    These boundaries are explicitly marked provisional; they are never presented as
    forced alignment. This is materially better than falsely completing STT with no
    Script, no subtitle, and no artifact at all.
    """
    words: list[dict[str, float | str]] = []
    for segment in segments:
        tokens = [token for token in str(segment.get("text") or "").split() if token]
        if not tokens:
            continue
        try:
            start = max(0.0, float(segment.get("start", 0.0)))
            end = max(start, float(segment.get("end", start)))
        except (TypeError, ValueError):
            continue
        duration = max(0.001, end - start)
        weights = [max(1, len(token.strip(".,!?;:\"'“”()[]{}"))) for token in tokens]
        total_weight = sum(weights) or len(tokens)
        cursor = start
        for index, (token, weight) in enumerate(zip(tokens, weights)):
            next_cursor = end if index == len(tokens) - 1 else min(end, cursor + duration * weight / total_weight)
            words.append({"text": token, "start": round(cursor, 3), "end": round(max(cursor, next_cursor), 3)})
            cursor = next_cursor
    return words

def _transcribe(path: Path, progress_id: str, model_name: str = MODEL_NAME) -> dict[str, Any]:
    progress.set(progress_id, 4)
    duration, sample_rate = _audio_duration(path)
    if _is_near_silent(path):
        progress.set(progress_id, 100)
        return {"id": f"stt-{uuid.uuid4().hex[:12]}", "duration": duration, "sample_rate": sample_rate, "text": "", "words": [], "language": LANGUAGE or "", "model": model_name}
    model, device = _model(model_name)
    progress.set(progress_id, 16)
    whisperx = _import_whisperx()
    audio = whisperx.load_audio(str(path))
    asr_result = model.transcribe(audio, batch_size=16 if device == "cuda" else 1, language=LANGUAGE)
    progress.set(progress_id, 72)
    segments = list(asr_result.get("segments", []))
    language_code = str(asr_result.get("language") or LANGUAGE or "").strip()
    aligned_result: dict[str, Any] = asr_result
    alignment_warning: str | None = None
    if segments and language_code:
        try:
            align_model, metadata = whisperx.load_align_model(language_code=language_code, device=device)
            aligned_result = whisperx.align(segments, align_model, metadata, audio, device, return_char_alignments=False)
        except Exception as exc:
            alignment_warning = str(exc)
    progress.set(progress_id, 94)
    words = _words_from_result(aligned_result)
    provisional = False
    if not words:
        words = _fallback_words_from_segments(segments)
        provisional = bool(words)
    text = _segment_text(segments) or str(asr_result.get("text") or "").strip()
    if not text and words:
        text = " ".join(str(word["text"]) for word in words)
    progress.set(progress_id, 100)
    timing_note = (
        "WhisperX forced alignment"
        if words and not provisional and not alignment_warning
        else f"WhisperX forced alignment failed; recognizer segment timing is available for review only. {alignment_warning}"
        if alignment_warning
        else "WhisperX returned transcript segments but no word alignment; provisional word timing was generated for review."
        if provisional
        else None
    )
    return {
        "id": f"stt-{uuid.uuid4().hex[:12]}",
        "duration": duration,
        "sample_rate": sample_rate,
        "text": text,
        "words": words,
        "language": language_code,
        "model": model_name,
        "word_timing_quality": "source" if words and not provisional and not alignment_warning else "needs-alignment" if words and (provisional or alignment_warning) else "unverified",
        "word_timing_note": timing_note,
        "alignment_warning": alignment_warning,
    }

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
        target_samples = max(1, round(waveform.shape[-1] * target_rate / sample_rate))
        waveform = torch.nn.functional.interpolate(
            waveform.unsqueeze(0), size=target_samples, mode="linear", align_corners=False
        ).squeeze(0)
    return {"waveform": waveform, "sample_rate": target_rate}

def _diarize(path: Path, progress_id: str, model_name: str, token: str, expected_speakers: int = 0) -> list[dict[str, Any]]:
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
    progress.set(progress_id, 100)
    return spans


@app.get("/api/audio/diarize/{progress_id}/progress")
def diarize_progress(progress_id: str) -> dict[str, float]:
    return {"progress": progress.get(progress_id) or 0.0}


@app.post("/api/audio/diarize")
async def diarize_audio(file: UploadFile = File(...), progress_id: str = Form(""), model: str = Form("pyannote/speaker-diarization-community-1"), expected_speakers: int = Form(0), huggingface_token: str | None = Header(default=None, alias="X-Pro4Bro-HuggingFace-Token")) -> dict[str, Any]:
    started = time.perf_counter()
    if not (huggingface_token or "").strip():
        raise HTTPException(status_code=503, detail="Cần Hugging Face token cho Speaker Diarization. Mở Windows → Preferences để cấu hình.")
    suffix = Path(file.filename or "analysis.wav").suffix or ".wav"
    progress.set(progress_id, 1)
    with tempfile.TemporaryDirectory(prefix="pro4bro-diarize-") as temporary_directory:
        destination = Path(temporary_directory) / f"input{suffix}"
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                output.write(chunk)
        try:
            spans = await asyncio.to_thread(_diarize, destination, progress_id, model, huggingface_token, max(0, min(8, expected_speakers)))
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Speaker Diarization thất bại: {exc}") from exc
    return {"spans": spans, "elapsed": round(time.perf_counter() - started, 2)}

@app.get("/api/status")
def status() -> dict[str, Any]:
    device, compute_type = _resolve_device()
    return {"status": "ok", "engine": "whisperx", "model": MODEL_NAME, "device": device, "compute_type": compute_type, "loaded": loaded_model is not None, "load_state": model_load_state, "load_error": model_load_error}


@app.get("/api/audio/import/{progress_id}/progress")
def import_progress(progress_id: str) -> dict[str, float]:
    # Polling may run before the job is registered; 0 avoids a false 404.
    return {"progress": progress.get(progress_id) or 0.0}


@app.post("/api/audio/import")
async def import_audio(file: UploadFile = File(...), origin: str = Form("import"), realtime_text: str = Form(""), progress_id: str = Form(""), model: str = Form(MODEL_NAME)) -> dict[str, Any]:
    del origin, realtime_text
    if model not in SUPPORTED_STT_MODELS:
        raise HTTPException(status_code=400, detail="Model STT không được hỗ trợ.")
    started = time.perf_counter()
    suffix = Path(file.filename or "analysis.wav").suffix or ".wav"
    progress.set(progress_id, 1)
    with tempfile.TemporaryDirectory(prefix="pro4bro-stt-") as temporary_directory:
        destination = Path(temporary_directory) / f"input{suffix}"
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                output.write(chunk)
        try:
            item = await asyncio.to_thread(_transcribe, destination, progress_id, model)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"WhisperX STT thất bại: {exc}") from exc
    return {"item": item, "elapsed": round(time.perf_counter() - started, 2)}

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




