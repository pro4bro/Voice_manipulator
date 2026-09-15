"""The live streamer's device-free parts, against synthetic blocks.

These need numpy, which lives in the Voice Changer runtime rather than the API's
own environment; without it they are skipped, and they can be run directly with
that runtime's Python.
"""

from __future__ import annotations

import sys
import wave
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "workers"))

import voice_stream  # noqa: E402

RATE = 16000


def speech_like(seconds: float, seed: int = 1) -> "np.ndarray":
    """Noise bursts shaped like syllables: loud, quiet, loud, at uneven spacing."""
    rng = np.random.default_rng(seed)
    samples = np.zeros(int(seconds * RATE), dtype=np.float32)
    cursor = 0
    while cursor < samples.size:
        length = int(rng.integers(RATE // 10, RATE // 4))
        gap = int(rng.integers(RATE // 20, RATE // 5))
        burst = rng.standard_normal(min(length, samples.size - cursor)).astype(np.float32) * 0.3
        samples[cursor:cursor + burst.size] = burst * np.hanning(burst.size).astype(np.float32)
        cursor += length + gap
    return samples


def test_the_ring_buffer_counts_underruns_and_overruns_instead_of_hiding_them():
    ring = voice_stream.RingBuffer(8)
    ring.write(np.arange(6, dtype=np.float32))
    assert list(ring.read(4)) == [0, 1, 2, 3]
    assert list(ring.read(4)) == [4, 5, 0, 0] and ring.underruns == 1
    ring.write(np.arange(10, dtype=np.float32))
    assert ring.overruns == 1 and ring.available == 8


def test_levels_and_spectrum_follow_the_signal():
    tone = np.sin(2 * np.pi * 1000 * np.arange(2048) / RATE).astype(np.float32) * 0.5
    rms, peak = voice_stream.level_db(tone)
    assert -9.5 < rms < -8.5 and -6.5 < peak < -5.5
    bands = voice_stream.spectrum_bands(tone, RATE)
    assert len(bands) == 48 and bands.index(max(bands)) in range(20, 40)
    assert voice_stream.gate(np.zeros(512, dtype=np.float32), -60)
    assert not voice_stream.gate(tone, -60)


def test_the_recorder_removes_the_pipeline_delay_and_refines_it_from_the_audio(tmp_path):
    spoken = speech_like(3.0)
    known, hidden = 480, 800  # the pipeline says 30 ms; the engine really adds 50 ms more
    converted = np.concatenate([np.zeros(known + hidden, dtype=np.float32), spoken * 0.8])[: spoken.size + known + hidden]
    recorder = voice_stream.TwoChannelRecorder(RATE)
    for start in range(0, spoken.size, 640):
        recorder.append(spoken[start:start + 640], converted[start:start + 640])

    result = recorder.finish(tmp_path / "take.wav", delay_samples=known)

    assert result["delayMs"] == 30.0
    assert result["refinedMs"] is not None and abs(result["refinedMs"] - 50.0) <= 5.0
    with wave.open(str(tmp_path / "take.wav")) as handle:
        assert handle.getnchannels() == 2 and handle.getframerate() == RATE
        frames = np.frombuffer(handle.readframes(handle.getnframes()), dtype="<i2").reshape(-1, 2).astype(np.float32)
    left, right = frames[:, 0], frames[:, 1]
    assert np.corrcoef(left[: right.size], right)[0, 1] > 0.95


def test_passthrough_keeps_the_voice_and_applies_gain():
    engine = voice_stream.Passthrough(RATE, {"input_gain_db": 6})
    block = np.full(320, 0.1, dtype=np.float32)
    assert engine.delay_samples == 0
    assert abs(float(engine.process(block)[0]) - 0.1995) < 0.001


def test_output_resampling_keeps_duration():
    assert voice_stream.resample_linear(np.ones(480, dtype=np.float32), 48000, 44100).size == 441


if __name__ == "__main__":
    import tempfile

    for name, test in list(globals().items()):
        if name.startswith("test_"):
            with tempfile.TemporaryDirectory() as folder:
                test(Path(folder)) if "tmp_path" in test.__code__.co_varnames else test()
            print("passed", name)
