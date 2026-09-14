from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.adapters.engine_worker import EngineWorkerError, EngineWorkerProcess
from app.adapters.gpu_lease import GpuLease

WORKER_SCRIPT = Path(__file__).resolve().parents[1] / "workers" / "vibevoice_asr_worker.py"

TIMING_SOURCE = "vibevoice-asr-segment"
TIMING_NOTE = (
    "VibeVoice-ASR chỉ trả mốc thời gian theo từng đoạn nói; thời gian của từng từ "
    "được chia đều trong đoạn nên chưa đủ tin cậy để cắt dữ liệu train. "
    "Dùng tốt cho transcript và phụ đề theo câu."
)


class VibeVoiceAsrError(RuntimeError):
    """VibeVoice-ASR could not transcribe this audio."""


def segments_to_item(segments: list[dict[str, Any]], duration: float) -> dict[str, Any]:
    """The Studio-shaped STT item the rest of the app already reads.

    VibeVoice-ASR answers in utterances - start, end, speaker, text - not words.
    Words are spread across their utterance by length so Script and subtitles
    can show them, and every one is marked untrusted: a boundary guessed from
    character counts must never decide where a training clip is cut.
    """
    words: list[dict[str, Any]] = []
    texts: list[str] = []
    for index, segment in enumerate(segments):
        text = str(segment.get("text") or "").strip()
        tokens = text.split()
        try:
            start = max(0.0, float(segment.get("start_time", 0.0)))
            end = min(duration if duration > 0 else float("inf"), float(segment.get("end_time", start)))
        except (TypeError, ValueError):
            continue
        if not tokens or end <= start:
            continue
        texts.append(text)
        total = sum(len(token) for token in tokens)
        cursor = start
        for token in tokens:
            share = (end - start) * len(token) / total
            word = {
                "text": token,
                "start": round(cursor, 3),
                "end": round(cursor + share, 3),
                "timingSource": TIMING_SOURCE,
                "timingTrusted": False,
                "segmentIndex": index,
            }
            speaker = segment.get("speaker_id")
            if speaker is not None and str(speaker).strip() != "":
                # Kept apart from diarization labels: the Speaker Diarization
                # step owns those and would overwrite them anyway.
                word["asrSpeakerId"] = f"speaker-{int(speaker) + 1}" if str(speaker).isdigit() else str(speaker)
            words.append(word)
            cursor += share
    return {
        "text": " ".join(texts),
        "words": words,
        "duration": duration,
        "word_timing_quality": "needs-alignment",
        "word_timing_note": TIMING_NOTE,
        "engine": "vibevoice-asr",
        "segments": segments,
    }


class VibeVoiceAsrTranscriber:
    """Speech to Text through the VibeVoice checkout's own runtime."""

    def __init__(
        self,
        vibevoice_root: Path | None,
        gpu_lease: GpuLease,
        before_gpu_work: Callable[[], None] | None = None,
        worker: EngineWorkerProcess | None = None,
        max_new_tokens: int = 32768,
    ) -> None:
        self.repo = (vibevoice_root / "VibeVoice") if vibevoice_root else None
        models = (vibevoice_root / "VibeVoice_models") if vibevoice_root else None
        self.model_dir = models / "microsoft" / "VibeVoice-ASR" if models else None
        self.tokenizer_dir = models / "Qwen" / "Qwen2.5-7B" if models else None
        self.gpu_lease = gpu_lease
        self.before_gpu_work = before_gpu_work
        self.max_new_tokens = max_new_tokens
        self.worker = worker or self._default_worker(models)

    def unavailable_reason(self) -> str | None:
        if not self.repo or not (self.repo / "vibevoice" / "modular" / "modeling_vibevoice_asr.py").is_file():
            return "Chưa thấy repo VibeVoice (VibeVoice/vibevoice)."
        if not (self.repo / ".venv" / "Scripts" / "python.exe").is_file() and not (self.repo / ".venv" / "bin" / "python").is_file():
            return "Chưa thấy môi trường Python .venv của repo VibeVoice."
        if not self.model_dir or not (self.model_dir / "config.json").is_file():
            return "Chưa thấy weights VibeVoice_models/microsoft/VibeVoice-ASR."
        if not self.tokenizer_dir or not (self.tokenizer_dir / "tokenizer_config.json").is_file():
            return "Chưa thấy tokenizer VibeVoice_models/Qwen/Qwen2.5-7B."
        return None

    def transcribe(self, audio: Path, duration: float, context_info: str = "", adapter: Path | None = None) -> dict[str, Any]:
        reason = self.unavailable_reason()
        if reason:
            raise VibeVoiceAsrError(reason)
        if self.before_gpu_work is not None:
            self.before_gpu_work()
        lease = self.gpu_lease.acquire(f"stt-vibevoice:{audio.parent.name}")
        try:
            reply = self.worker.request(
                {
                    "model": str(self.model_dir),
                    "tokenizer": str(self.tokenizer_dir),
                    "audio": str(audio),
                    "context_info": context_info,
                    "max_new_tokens": self.max_new_tokens,
                    "lora_adapter": str(adapter) if adapter else None,
                }
            )
        except EngineWorkerError as exc:
            raise VibeVoiceAsrError(str(exc)) from exc
        finally:
            self.gpu_lease.release(lease.token)
        if not reply.get("ok"):
            raise VibeVoiceAsrError(reply.get("error") or "VibeVoice-ASR không trả kết quả.")
        return segments_to_item(list(reply.get("segments") or []), duration)

    def _default_worker(self, models: Path | None) -> EngineWorkerProcess:
        repo = self.repo or Path(".")
        python = repo / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        env = {
            # The checkout's editable install still points at the folder it was
            # installed from; putting the checkout first makes it importable
            # wherever it lives now, without touching that environment.
            "PYTHONPATH": str(repo),
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "HF_HUB_DISABLE_TELEMETRY": "1",
        }
        if models:
            env["HF_HOME"] = str(models / ".cache" / "huggingface")
        ffmpeg = repo / "tools" / "ffmpeg" / "bin"
        if ffmpeg.is_dir():
            env["PATH"] = str(ffmpeg) + os.pathsep + os.environ.get("PATH", "")
        # Two idle minutes, not five: this model holds about 17 GB of VRAM.
        return EngineWorkerProcess(python, WORKER_SCRIPT, env, label="VibeVoice-ASR", idle_seconds=120.0, request_timeout=14400.0)
