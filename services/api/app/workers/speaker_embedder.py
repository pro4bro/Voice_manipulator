"""One-shot pyannote speaker similarity worker for the Studio ML runtime."""

from __future__ import annotations

import json
import math
import sys
import wave
from pathlib import Path

REPLY_PREFIX = "PRO4BRO_SPEAKER_EMBEDDER="
MIN_SECONDS = 3.0
TARGET_SAMPLE_RATE = 16000


def _duration(path: Path) -> float:
    try:
        with wave.open(str(path), "rb") as audio:
            return audio.getnframes() / audio.getframerate()
    except (EOFError, wave.Error, ZeroDivisionError) as exc:
        raise ValueError(f"Speaker gate requires a readable PCM WAV: {path.name}") from exc


def _cosine(left, right) -> float:
    import numpy as np

    a = np.asarray(left, dtype=np.float64).reshape(-1)
    b = np.asarray(right, dtype=np.float64).reshape(-1)
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denominator == 0 or a.shape != b.shape:
        raise ValueError("Speaker embedder returned incompatible zero-length vectors.")
    return max(-1.0, min(1.0, float(np.dot(a, b) / denominator)))


def _read_pcm16(path: Path):
    """Decode and downmix PCM WAV without TorchCodec."""
    import numpy as np

    try:
        with wave.open(str(path), "rb") as audio:
            channels = audio.getnchannels()
            sample_width = audio.getsampwidth()
            sample_rate = audio.getframerate()
            frames = audio.readframes(audio.getnframes())
    except (EOFError, wave.Error) as exc:
        raise ValueError(f"Speaker gate requires a readable PCM WAV: {path.name}") from exc
    if sample_width != 2 or channels < 1:
        raise ValueError(f"Speaker gate requires 16-bit PCM WAV: {path.name}")
    samples = np.frombuffer(frames, dtype="<i2").reshape(-1, channels).astype(np.float32)
    mono = samples.mean(axis=1) / 32768.0
    return mono, sample_rate


def _audio_input(path: Path) -> dict:
    """Build pyannote's documented in-memory waveform input."""
    import torch

    mono, sample_rate = _read_pcm16(path)
    waveform = torch.from_numpy(mono).unsqueeze(0)
    if sample_rate != TARGET_SAMPLE_RATE:
        import torchaudio

        waveform = torchaudio.functional.resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
        sample_rate = TARGET_SAMPLE_RATE
    return {"waveform": waveform, "sample_rate": sample_rate}


def main() -> None:
    request = json.loads(sys.stdin.read())
    reference = Path(request["reference"])
    candidates = {str(key): Path(value) for key, value in request["candidates"].items()}
    for path in [reference, *candidates.values()]:
        if _duration(path) < MIN_SECONDS:
            raise ValueError(f"Speaker gate clips must be at least {MIN_SECONDS:.0f} seconds: {path.name}")

    import torch
    from pyannote.audio import Inference, Model

    model = Model.from_pretrained(request["model"])
    if model is None:
        raise RuntimeError("Speaker embedding model could not be loaded.")
    inference = Inference(model, window="whole")
    if torch.cuda.is_available():
        inference.to(torch.device("cuda"))
    reference_embedding = inference(_audio_input(reference))
    scores = {key: _cosine(reference_embedding, inference(_audio_input(path))) for key, path in candidates.items()}
    if any(not math.isfinite(score) for score in scores.values()):
        raise RuntimeError("Speaker embedding produced a non-finite score.")
    print(REPLY_PREFIX + json.dumps({"scores": scores}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr, flush=True)
        raise SystemExit(1)
