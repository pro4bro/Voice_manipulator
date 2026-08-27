from __future__ import annotations

import struct
import wave
from pathlib import Path

from app.adapters.audio_waveform_envelope import AudioWaveformEnvelope


def _write_pcm16_wave(path: Path) -> None:
    samples = [0, 4096, -8192, 16384, -24576, 8192, 0, -1024]
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(8)
        output.writeframes(struct.pack(f"<{len(samples)}h", *samples))


def test_waveform_envelope_builds_min_max_points_and_reuses_matching_cache(tmp_path):
    audio_path = tmp_path / "analysis.wav"
    cache_path = tmp_path / "cache" / "waveforms" / "asset.json"
    _write_pcm16_wave(audio_path)
    envelope = AudioWaveformEnvelope(density_per_second=4, min_points=4, max_points=4)

    first = envelope.read(audio_path, cache_path)
    second = envelope.read(audio_path, cache_path)

    assert cache_path.is_file()
    assert first == second
    assert first["duration"] == 1
    assert first["sampleRate"] == 8
    assert len(first["points"]) == 4
    assert min(point["min"] for point in first["points"]) < -0.7
    assert max(point["max"] for point in first["points"]) > 0.45

def test_waveform_detail_reads_source_peak_cache_for_requested_window(tmp_path):
    audio_path = tmp_path / "analysis.wav"
    cache_path = tmp_path / "cache" / "waveforms" / "asset.json"
    _write_pcm16_wave(audio_path)
    envelope = AudioWaveformEnvelope(density_per_second=4, min_points=4, max_points=4)

    detail = envelope.read_detail(audio_path, cache_path, start=0.25, end=0.75, points=64)
    envelope.MIN_DETAIL_POINTS = 1
    reduced = envelope.read_detail(audio_path, cache_path, start=0.25, end=0.75, points=2)

    assert cache_path.with_suffix(".peaks.bin").is_file()
    assert cache_path.with_suffix(".peaks.json").is_file()
    assert detail["start"] == 0.25
    assert detail["end"] == 0.75
    assert detail["resolution"] == 0.125
    assert detail["points"] == [
        {"min": -0.25, "max": -0.25},
        {"min": 0.5, "max": 0.5},
        {"min": -0.75, "max": -0.75},
        {"min": 0.25, "max": 0.25},
    ]
    assert len(reduced["points"]) == 2
    assert reduced["points"][0]["max"] == 0.5
    assert reduced["points"][1]["min"] == -0.75
