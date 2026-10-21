"""Read source PCM and run an installed, offline CPU alignment comparator."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import wave

import numpy as np


MODEL_ID = "nguyenvulebinh/wav2vec2-base-vietnamese-250h"
REVISION = "69e9000591623e5a4fc2f502407860bcdc0de0b2"


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def pcm_envelope(path: Path) -> dict:
    with wave.open(str(path), "rb") as source:
        if (source.getnchannels(), source.getsampwidth(), source.getcomptype()) != (1, 2, "NONE"):
            raise ValueError("Căn subtitle cần analysis WAV PCM16 mono của project.")
        rate, count = source.getframerate(), source.getnframes()
        if rate <= 0 or count <= 0:
            raise ValueError("Analysis WAV chưa có audio.")
        hop = max(1, round(rate * .01))
        rms, peak, clipped, read_frames = [], 0, 0, 0
        while data := source.readframes(hop * 1000):
            samples = np.frombuffer(data, dtype="<i2").astype(np.float32)
            read_frames += len(samples)
            peak = max(peak, int(np.abs(samples).max()))
            clipped += int(np.count_nonzero(np.abs(samples) >= 32767))
            padding = (-len(samples)) % hop
            frames = np.pad(samples, (0, padding)).reshape(-1, hop)
            rms.extend(np.sqrt(np.mean((frames / 32768) ** 2, axis=1)).astype(float).tolist())
        if read_frames != count:
            raise ValueError("Analysis WAV bị thiếu PCM so với header.")
        return {"rms": rms, "frameSeconds": hop / rate, "sampleRate": rate,
                "duration": count / rate, "frames": count, "peak": peak / 32768,
                "clippedSamples": clipped}


class LocalSubtitleAligner:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        self.model = self.root / ".cache/huggingface/hub" / ("models--" + MODEL_ID.replace("/", "--")) / "snapshots" / REVISION
        candidates = [self.root / ".runtime/omnivoice-studio/.venv/Scripts/python.exe",
                      self.root / ".runtime/python/stt/python.exe"]
        self.python = next((p for p in candidates if p.is_file()), candidates[-1])
        self.worker = Path(__file__).resolve().parents[1] / "workers/subtitle_alignment_worker.py"

    def report(self) -> dict:
        available = self.python.is_file() and all((self.model / name).is_file()
            for name in ("pytorch_model.bin", "config.json", "vocab.json")) and self.worker.is_file()
        return {"status": "available" if available else "unavailable", "model": MODEL_ID,
                "revision": REVISION, "license": "CC-BY-NC-4.0 · mô hình local thử nghiệm",
                "reason": "" if available else "Chưa có runtime/mô hình căn âm học trên máy. Vẫn có thể bù offset và review bằng waveform."}

    def run(self, project_root: Path, audio: Path, words: list[dict], folder: Path, indexes: list[int] | None) -> dict:
        report = self.report()
        if report["status"] != "available":
            return {**report, "words": None}
        payload = {"audioPath": audio.resolve().relative_to(project_root.resolve()).as_posix(),
                   "audioSha256": sha256(audio), "words": words, "indexes": indexes}
        input_path, output_path = folder / "alignment-input.json", folder / "alignment-output.json"
        input_path.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        env = {**os.environ, "CUDA_VISIBLE_DEVICES": "", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
               "HF_HUB_DISABLE_TELEMETRY": "1", "OMP_NUM_THREADS": "4", "MKL_NUM_THREADS": "4",
               "NLTK_DATA": str(self.root / ".runtime/omnivoice-studio/nltk_data"), "PYTHONUTF8": "1"}
        command = [str(self.python), str(self.worker), str(input_path), str(output_path),
                   str(project_root.resolve()), str(self.model)]
        try:
            result = subprocess.run(command, env=env, capture_output=True, text=True, encoding="utf-8",
                errors="replace", timeout=600, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            (folder / "alignment.log").write_text(result.stdout + result.stderr, encoding="utf-8")
            if result.returncode or not output_path.is_file():
                raise ValueError("Mô hình căn âm học chưa tạo được artifact. Xem log của đề xuất.")
            output = json.loads(output_path.read_text(encoding="utf-8"))
            if output.get("audioSha256") != payload["audioSha256"] or len(output.get("words", [])) != len(words):
                raise ValueError("Artifact căn âm học không khớp nguồn.")
            return {**report, **output, "status": "complete"}
        except (subprocess.TimeoutExpired, ValueError, OSError) as exc:
            return {**report, "status": "failed", "reason": str(exc), "words": None}
