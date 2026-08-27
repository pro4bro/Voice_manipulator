from __future__ import annotations

import struct
import wave
from pathlib import Path

from app.adapters.media_presentation import project_waveform, render_srt, subtitle_export_path


def write_wave(path: Path) -> None:
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(4)
        stream.writeframes(struct.pack("<hhhhhhhh", -32768, -1000, 0, 1000, 32767, 0, -2000, 2000))


def test_project_waveform_is_compact_and_cached(tmp_path: Path) -> None:
    audio_path = tmp_path / "analysis.wav"
    write_wave(audio_path)

    waveform = project_waveform(tmp_path, "asset-1", audio_path, point_count=4)

    assert waveform["duration"] == 2.0
    assert len(waveform["points"]) == 8
    assert waveform["points"][0]["min"] <= -0.99
    assert max(point["max"] for point in waveform["points"]) >= 0.99
    assert (tmp_path / "cache" / "waveforms" / "asset-1-180.json").is_file()
    assert project_waveform(tmp_path, "asset-1", audio_path, point_count=4) == waveform


def test_render_srt_groups_timestamped_words_and_stays_project_relative(tmp_path: Path) -> None:
    content = render_srt([
        {"text": "Xin", "start": 0, "end": 0.3},
        {"text": "chào.", "start": 0.3, "end": 0.7},
        {"text": "Tạm", "start": 1.0, "end": 1.2},
        {"text": "biệt!", "start": 1.2, "end": 1.5},
    ])

    assert "00:00:00,000 --> 00:00:00,700" in content
    assert "Xin chào." in content
    assert "Tạm biệt!" in content
    assert subtitle_export_path(tmp_path, "asset-1", "Interview 01.wav") == tmp_path / "exports" / "subtitles" / "Interview_01-asset-1.srt"