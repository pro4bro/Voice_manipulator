from __future__ import annotations

import math
import shutil
import wave
from array import array
from pathlib import Path

import pytest

from app.adapters.voice_stretch_audio import _fit_exact_frames, render_stretch


SAMPLE_RATE = 24_000


def write_tone(path: Path, frames: int, frequency: float = 440.0, amplitude: float = 0.25) -> None:
    samples = array(
        "h",
        (
            round(math.sin(2 * math.pi * frequency * frame / SAMPLE_RATE) * amplitude * 32767)
            for frame in range(frames)
        ),
    )
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(samples.tobytes())


def read_pcm(path: Path) -> tuple[bytes, int]:
    with wave.open(str(path), "rb") as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (1, 2, SAMPLE_RATE)
        frames = wav.getnframes()
        return wav.readframes(frames), frames


def require_atempo() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        pytest.skip("FFmpeg is not installed in this test environment")
    import subprocess

    result = subprocess.run([ffmpeg, "-hide_banner", "-filters"], capture_output=True, text=True, timeout=5)
    if result.returncode or "atempo" not in result.stdout:
        pytest.skip("FFmpeg atempo filter is unavailable in this test environment")


def estimate_tone_frequency(pcm: bytes, start_frame: int, end_frame: int) -> float:
    samples = array("h")
    samples.frombytes(pcm[start_frame * 2 : end_frame * 2])
    crossings = sum(1 for left, right in zip(samples, samples[1:]) if left <= 0 < right)
    duration = (len(samples) - 1) / SAMPLE_RATE
    return crossings / duration


def test_render_stretch_preserves_pitch_and_copies_untouched_pcm(tmp_path: Path) -> None:
    require_atempo()
    source = tmp_path / "source.wav"
    destination = tmp_path / "preview.wav"
    source_frames = 38_400
    start, end, target = 4_800, 28_800, 30_000
    write_tone(source, source_frames)
    original, _ = read_pcm(source)
    source_bytes = source.read_bytes()

    report = render_stretch(
        source,
        destination,
        [{"startFrame": start, "endFrame": end, "targetFrames": target}],
    )

    preview, frames = read_pcm(destination)
    assert frames == source_frames - (end - start) + target == 44_400
    assert preview[: start * 2] == original[: start * 2]
    assert preview[(start + target) * 2 :] == original[end * 2 :]
    measured = estimate_tone_frequency(preview, start + 2_400, start + target - 2_400)
    assert measured == pytest.approx(440.0, rel=0.02)
    assert report["method"] == "ffmpeg-atempo"
    assert report["targetFrames"] == report["actualFrames"] == frames
    assert report["clippedSamples"] == 0
    assert report["maxBoundaryStep"] <= 0.05
    assert report["processingSeconds"] >= 0
    assert source.read_bytes() == source_bytes


def test_render_stretch_applies_operations_in_current_frame_timeline(tmp_path: Path) -> None:
    require_atempo()
    source = tmp_path / "source.wav"
    destination = tmp_path / "preview.wav"
    write_tone(source, 72_000, frequency=330.0, amplitude=0)

    report = render_stretch(
        source,
        destination,
        [
            {"startFrame": 6_000, "endFrame": 30_000, "targetFrames": 19_200},
            # This interval is positioned after the first operation's -4,800 frame delta.
            {"startFrame": 36_000, "endFrame": 48_000, "targetFrames": 18_000},
        ],
    )

    _, frames = read_pcm(destination)
    assert frames == 72_000 - 4_800 + 6_000 == 73_200
    assert report["targetFrames"] == report["actualFrames"] == frames
    assert abs(report["paddingFrames"]) <= int(SAMPLE_RATE * 0.060)


def test_contracts_audible_tone_without_truncating_it_to_fit(tmp_path: Path) -> None:
    require_atempo()
    source = tmp_path / "tone.wav"
    destination = tmp_path / "contracted.wav"
    source_frames = 48_000
    start, end, target = 4_800, 28_800, 19_200
    write_tone(source, source_frames)
    original, _ = read_pcm(source)

    report = render_stretch(
        source,
        destination,
        [{"startFrame": start, "endFrame": end, "targetFrames": target}],
    )

    preview, frames = read_pcm(destination)
    assert frames == source_frames - (end - start) + target
    assert preview[: start * 2] == original[: start * 2]
    assert preview[(start + target) * 2 :] == original[end * 2 :]
    measured = estimate_tone_frequency(preview, start + 2_400, start + target - 2_400)
    assert measured == pytest.approx(440.0, rel=0.02)
    assert 0 < report["paddingFrames"] <= int(SAMPLE_RATE * 0.060)


def test_rejects_non_pcm16_mono_24khz_without_replacing_destination(tmp_path: Path) -> None:
    source = tmp_path / "stereo.wav"
    destination = tmp_path / "existing.wav"
    with wave.open(str(source), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(b"\0\0\0\0" * 10)
    destination.write_bytes(b"existing")

    with pytest.raises(ValueError, match="PCM16 mono at 24 kHz"):
        render_stretch(source, destination, [{"startFrame": 0, "endFrame": 1, "targetFrames": 2}])

    assert destination.read_bytes() == b"existing"


def test_silence_span_stretches_without_division_or_nan_edges(tmp_path: Path) -> None:
    require_atempo()
    source = tmp_path / "silence.wav"
    destination = tmp_path / "silence-preview.wav"
    with wave.open(str(source), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(b"\0\0" * 24_000)

    report = render_stretch(source, destination, [{"startFrame": 0, "endFrame": 24_000, "targetFrames": 30_000}])

    pcm, frames = read_pcm(destination)
    assert frames == 30_000
    assert not any(pcm)
    assert report["clippedSamples"] == 0
    assert report["maxBoundaryStep"] == 0


def test_frame_fit_removes_literal_edge_silence_but_never_quiet_audible_samples() -> None:
    fitted, adjustment = _fit_exact_frames(b"\0\0\x01\0\0\0", 2)
    assert fitted == b"\0\0\x01\0"
    assert adjustment == -1

    with pytest.raises(ValueError, match="remove audible samples"):
        _fit_exact_frames(b"\x01\0\x01\0\x01\0", 2)


def test_rejects_clipped_output_without_publishing_destination(tmp_path: Path) -> None:
    source = tmp_path / "clipped.wav"
    destination = tmp_path / "preview.wav"
    with wave.open(str(source), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(array("h", [32767, 0, 0, 0]).tobytes())

    with pytest.raises(ValueError, match="clipped PCM16 samples"):
        render_stretch(source, destination, [{"startFrame": 0, "endFrame": 4, "targetFrames": 4}])

    assert not destination.exists()


def test_rejects_click_boundary_without_publishing_destination(tmp_path: Path) -> None:
    require_atempo()
    source = tmp_path / "boundary.wav"
    destination = tmp_path / "preview.wav"
    with wave.open(str(source), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(array("h", [0] * 5 + [5000] * 6 + [0] * 5).tobytes())

    with pytest.raises(ValueError, match="boundary step .* exceeds 0.05"):
        render_stretch(source, destination, [{"startFrame": 5, "endFrame": 11, "targetFrames": 6}])

    assert not destination.exists()
