"""The engine-agnostic half of live voice conversion.

Imported by `voice_changer_worker.py` under a runtime Python with numpy; it
must not import `app`. Nothing here touches a device, so all of it can be
checked against recorded blocks: the ring buffers the devices read from, the
meters the Sound Reactors draw, the silence gate, and the two-channel recorder
that lines the converted voice up with the voice that was spoken.
"""

from __future__ import annotations

import threading
import wave
from pathlib import Path

import numpy as np

SILENCE_DB = -120.0


class RingBuffer:
    """Mono float32 samples between the processing thread and one device callback.

    A read that finds too little plays silence for the missing part and counts
    one underrun; a write that would overflow drops the oldest audio and counts
    one overrun. Neither is hidden: both reach the status the UI shows.
    """

    def __init__(self, capacity: int) -> None:
        self._data = np.zeros(max(1, capacity), dtype=np.float32)
        self._start = 0
        self._size = 0
        self._lock = threading.Lock()
        self.underruns = 0
        self.overruns = 0

    @property
    def available(self) -> int:
        with self._lock:
            return self._size

    def write(self, samples: np.ndarray) -> None:
        samples = np.asarray(samples, dtype=np.float32).reshape(-1)
        capacity = self._data.size
        with self._lock:
            if samples.size >= capacity:
                samples = samples[-capacity:]
                self.overruns += 1
                self._start, self._size = 0, 0
            overflow = self._size + samples.size - capacity
            if overflow > 0:
                self._start = (self._start + overflow) % capacity
                self._size -= overflow
                self.overruns += 1
            end = (self._start + self._size) % capacity
            first = min(samples.size, capacity - end)
            self._data[end:end + first] = samples[:first]
            self._data[: samples.size - first] = samples[first:]
            self._size += samples.size

    def read(self, count: int) -> np.ndarray:
        out = np.zeros(count, dtype=np.float32)
        capacity = self._data.size
        with self._lock:
            take = min(count, self._size)
            first = min(take, capacity - self._start)
            out[:first] = self._data[self._start:self._start + first]
            out[first:take] = self._data[: take - first]
            self._start = (self._start + take) % capacity
            self._size -= take
            if take < count:
                self.underruns += 1
        return out


def level_db(samples: np.ndarray) -> tuple[float, float]:
    """RMS and peak of a block, in dBFS."""
    if samples.size == 0:
        return SILENCE_DB, SILENCE_DB
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    peak = float(np.max(np.abs(samples)))
    to_db = lambda value: max(SILENCE_DB, 20.0 * float(np.log10(value))) if value > 0 else SILENCE_DB  # noqa: E731
    return round(to_db(rms), 1), round(to_db(peak), 1)


def spectrum_bands(samples: np.ndarray, sample_rate: int, bands: int = 48, low: float = 60.0, high: float = 12000.0, floor_db: float = -90.0) -> list[float]:
    """Log-spaced band energies scaled to 0..1, what a Sound Reactor draws."""
    if samples.size < 64:
        return [0.0] * bands
    window = np.hanning(samples.size).astype(np.float32)
    power = np.abs(np.fft.rfft(samples * window)) ** 2
    freqs = np.fft.rfftfreq(samples.size, 1.0 / sample_rate)
    edges = np.geomspace(low, min(high, sample_rate / 2), bands + 1)
    values: list[float] = []
    norm = (np.sum(window) / 2) ** 2
    for lower, upper in zip(edges[:-1], edges[1:]):
        mask = (freqs >= lower) & (freqs < upper)
        energy = float(np.mean(power[mask])) / norm if np.any(mask) else 0.0
        db = 10.0 * np.log10(energy) if energy > 0 else floor_db
        values.append(round(float(np.clip((db - floor_db) / -floor_db, 0.0, 1.0)), 3))
    return values


def gate(samples: np.ndarray, threshold_db: float) -> bool:
    """True when the block is quiet enough to pass as silence, not through the engine."""
    rms_db, _ = level_db(samples)
    return rms_db < threshold_db


def resample_linear(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate or samples.size == 0:
        return samples.astype(np.float32, copy=False)
    count = max(1, int(round(samples.size * target_rate / source_rate)))
    positions = np.linspace(0, samples.size - 1, count)
    return np.interp(positions, np.arange(samples.size), samples).astype(np.float32)


def envelope(samples: np.ndarray, sample_rate: int, hop_ms: float = 5.0) -> tuple[np.ndarray, int]:
    hop = max(1, int(sample_rate * hop_ms / 1000))
    frames = samples.size // hop
    if frames == 0:
        return np.zeros(0, dtype=np.float32), hop
    shaped = np.abs(samples[: frames * hop]).reshape(frames, hop).mean(axis=1)
    shaped = shaped - shaped.mean()
    return shaped.astype(np.float32), hop


def estimate_lag(spoken: np.ndarray, converted: np.ndarray, sample_rate: int, max_ms: float = 250.0) -> int | None:
    """How many samples `converted` trails `spoken`, from their loudness envelopes.

    A converted voice keeps the performer's syllable rhythm while its timbre
    changes, so the envelopes still line up where the waveforms do not. Returns
    None when there is too little speech to say.
    """
    first, hop = envelope(spoken, sample_rate)
    second, _ = envelope(converted, sample_rate)
    length = min(first.size, second.size)
    if length < 40 or float(np.std(first[:length])) < 1e-4 or float(np.std(second[:length])) < 1e-4:
        return None
    first, second = first[:length], second[:length]
    span = max(1, int(max_ms / 1000 * sample_rate / hop))
    best_lag, best_score = 0, -np.inf
    for lag in range(-span, span + 1):
        if lag >= 0:
            a, b = first[: length - lag], second[lag:]
        else:
            a, b = first[-lag:], second[: length + lag]
        if a.size < 20:
            continue
        score = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
        if score > best_score:
            best_lag, best_score = lag, score
    return best_lag * hop if best_score > 0.3 else None


class TwoChannelRecorder:
    """The spoken voice and the converted voice, kept block for block.

    Both are captured at the processing step, before any device, so the only
    offset between them is the pipeline's own delay: known exactly, and
    refined from the audio for an engine whose delay moves.
    """

    def __init__(self, sample_rate: int) -> None:
        self.sample_rate = sample_rate
        self._spoken: list[np.ndarray] = []
        self._converted: list[np.ndarray] = []
        self._lock = threading.Lock()

    @property
    def seconds(self) -> float:
        with self._lock:
            return sum(block.size for block in self._spoken) / self.sample_rate

    def append(self, spoken: np.ndarray, converted: np.ndarray) -> None:
        with self._lock:
            self._spoken.append(np.array(spoken, dtype=np.float32, copy=True))
            self._converted.append(np.array(converted, dtype=np.float32, copy=True))

    def finish(self, path: Path, delay_samples: int, refine: bool = True) -> dict:
        with self._lock:
            spoken = np.concatenate(self._spoken) if self._spoken else np.zeros(0, dtype=np.float32)
            converted = np.concatenate(self._converted) if self._converted else np.zeros(0, dtype=np.float32)
            self._spoken, self._converted = [], []
        delay = max(0, int(delay_samples))
        refined = None
        if refine and spoken.size and converted.size > delay:
            extra = estimate_lag(spoken, converted[delay:], self.sample_rate)
            if extra is not None and delay + extra >= 0:
                refined = extra
                delay += extra
        aligned = converted[delay:]
        length = min(spoken.size, aligned.size)
        stereo = np.stack([spoken[:length], aligned[:length]], axis=1)
        pcm = (np.clip(stereo, -1.0, 1.0) * 32767.0).astype("<i2")
        path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), "wb") as handle:
            handle.setnchannels(2)
            handle.setsampwidth(2)
            handle.setframerate(self.sample_rate)
            handle.writeframes(pcm.tobytes())
        return {
            "path": str(path),
            "seconds": round(length / self.sample_rate, 3),
            "sampleRate": self.sample_rate,
            "delayMs": round(delay_samples / self.sample_rate * 1000, 1),
            "refinedMs": round(refined / self.sample_rate * 1000, 1) if refined is not None else None,
        }


class Passthrough:
    """Keeps the voice as it is: checks devices, the virtual mic, latency and recording."""

    delay_samples = 0

    def __init__(self, sample_rate: int, parameters: dict, target: dict | None = None) -> None:
        self.gain = float(10 ** (float(parameters.get("input_gain_db") or 0.0) / 20))

    def process(self, block: np.ndarray) -> np.ndarray:
        return np.clip(block * self.gain, -1.0, 1.0).astype(np.float32)


ENGINES = {"passthrough": Passthrough}
