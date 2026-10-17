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


def test_detail_bins_follow_uniform_clock_instead_of_a_short_tail_bucket():
    # 10 peaks over ten seconds, requested as four display bins. A peak at
    # second5 belongs at the midpoint, not the preceding ceil-sized bucket.
    peaks = [(0, 0)] * 10
    peaks[5] = (-16000, 16000)
    grouped = AudioWaveformEnvelope._group_peaks(peaks, 4)
    assert len(grouped) == 4
    assert [index for index, point in enumerate(grouped) if point["max"]] == [2]
    assert max(point["max"] for point in grouped) == 16000 / 32768


def test_overview_bins_use_actual_source_frames_and_invalidate_old_geometry(tmp_path):
    import json
    audio = tmp_path / "pulse.wav"
    cache = tmp_path / "overview.json"
    samples = [0] * 10
    samples[5] = 16000
    with wave.open(str(audio), "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(1)
        writer.writeframes(struct.pack("<10h", *samples))
    stat = audio.stat()
    cache.write_text(json.dumps({"sourceSize": stat.st_size, "sourceMtimeNs": stat.st_mtime_ns,
        "duration": 10, "points": [{"min": 0, "max": 1}]}), encoding="utf-8")
    overview = AudioWaveformEnvelope(min_points=4, max_points=4).read(audio, cache)
    assert len(overview["points"]) == 4
    assert [index for index, point in enumerate(overview["points"]) if point["max"]] == [2]
    assert AudioWaveformEnvelope(min_points=4, max_points=4).read(audio, cache) == overview
