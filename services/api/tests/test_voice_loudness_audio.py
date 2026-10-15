import math
import struct
import wave
from pathlib import Path

import pytest

from app.adapters.voice_loudness_audio import render_loudness


RATE = 24000


def write_pcm(path: Path, samples: list[int], *, rate: int = RATE, channels: int = 1, width: int = 2):
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(width)
        wav.setframerate(rate)
        if width == 2:
            wav.writeframes(struct.pack(f"<{len(samples)}h", *samples))
        else:
            wav.writeframes(bytes(samples))


def read_pcm(path: Path) -> tuple[int, list[int]]:
    with wave.open(str(path), "rb") as wav:
        return wav.getframerate(), list(struct.unpack(f"<{wav.getnframes()}h", wav.readframes(wav.getnframes())))


def dbfs(value: float) -> float:
    return 20 * math.log10(value / 32768) if value else -math.inf


def test_global_gain_preserves_frames_prefix_and_suffix_and_reports_measured_levels(tmp_path):
    source = tmp_path / "source.wav"
    destination = tmp_path / "plus-6.wav"
    samples = [4000] * 100 + [8000] * 400 + [2000] * 100
    write_pcm(source, samples)
    original = source.read_bytes()

    report = render_loudness(source, destination, [], global_gain_db=6)

    rate, result = read_pcm(destination)
    assert rate == RATE and len(result) == len(samples)
    assert source.read_bytes() == original
    assert result[:100] == [round(sample * 10 ** (6 / 20)) for sample in samples[:100]]
    assert result[-100:] == [round(sample * 10 ** (6 / 20)) for sample in samples[-100:]]
    assert report["frames"] == len(samples)
    assert report["source"]["rmsDbfs"] == pytest.approx(dbfs(math.sqrt(sum(sample * sample for sample in samples) / len(samples))))
    assert report["output"]["peakDbfs"] == pytest.approx(dbfs(max(map(abs, result))))
    assert report["global"]["requestedGainDb"] == 6
    assert report["global"]["appliedGainDb"] == pytest.approx(6)


def test_region_gain_is_scalar_inside_ramped_boundaries_and_regions_are_reported(tmp_path):
    source = tmp_path / "source.wav"
    destination = tmp_path / "minus-6.wav"
    samples = [6000] * 1000
    write_pcm(source, samples)

    report = render_loudness(source, destination, [{"rowId": "row-1", "startFrame": 200, "endFrame": 800, "gainDb": -6}])

    _, result = read_pcm(destination)
    assert result[:200] == samples[:200]
    assert result[320:680] == [round(6000 * 10 ** (-6 / 20))] * 360
    assert result[800:] == samples[800:]
    region = report["regions"][0]
    assert region["rowId"] == "row-1"
    assert region["requestedGainDb"] == -6
    assert region["appliedRowGainDb"] == pytest.approx(-6)
    assert region["rampStartFrames"] == region["rampEndFrames"] == 120
    assert region["headroomLimited"] is False


def test_positive_gain_is_clamped_to_one_db_headroom_without_limiter_compression(tmp_path):
    source = tmp_path / "source.wav"
    destination = tmp_path / "clamped.wav"
    peak = round(32768 * 10 ** (-3 / 20))
    samples = [peak] * 2000
    write_pcm(source, samples)

    report = render_loudness(source, destination, [{"rowId": "row", "startFrame": 0, "endFrame": len(samples), "gainDb": 12}])

    _, result = read_pcm(destination)
    region = report["regions"][0]
    assert region["requestedGainDb"] == 12
    assert region["appliedTotalGainDb"] == pytest.approx(2, abs=.1)
    assert region["headroomLimited"] is True
    assert max(map(abs, result)) <= round(32768 * 10 ** (-1 / 20)) + 1
    assert len(set(result[120:-120])) == 1  # uniform scalar gain, no hidden dynamic compression


def test_net_zero_row_override_still_obeys_headroom(tmp_path):
    source, destination = tmp_path / "hot.wav", tmp_path / "rendered.wav"
    samples = [30000] * 1000
    write_pcm(source, samples)

    report = render_loudness(source, destination, [{"rowId": "row", "startFrame": 0, "endFrame": len(samples), "gainDb": 1}], global_gain_db=-1)

    _, result = read_pcm(destination)
    region = report["regions"][0]
    assert region["requestedTotalGainDb"] == 0
    assert region["appliedTotalGainDb"] == pytest.approx(-0.23, abs=.1)
    assert region["headroomLimited"] is True
    assert max(map(abs, result)) <= round(32768 * 10 ** (-1 / 20)) + 1


def test_gain_region_shorter_than_boundary_policy_is_rejected(tmp_path):
    source, destination = tmp_path / "source.wav", tmp_path / "short.wav"
    samples = [16000] * 1000
    write_pcm(source, samples)

    with pytest.raises(ValueError, match="too short"):
        render_loudness(source, destination, [{"rowId": "row", "startFrame": 500, "endFrame": 501, "gainDb": -12}])

    assert not destination.exists()


def test_silence_is_stable_and_reports_undefined_dbfs(tmp_path):
    source, destination = tmp_path / "silence.wav", tmp_path / "rendered.wav"
    write_pcm(source, [0] * 240)

    report = render_loudness(source, destination, [{"rowId": "quiet", "startFrame": 0, "endFrame": 240, "gainDb": 12}])

    _, result = read_pcm(destination)
    assert result == [0] * 240
    assert report["source"]["rmsDbfs"] is None and report["source"]["peakDbfs"] is None
    assert report["output"]["rmsDbfs"] is None and report["output"]["peakDbfs"] is None
    assert report["regions"][0]["appliedTotalGainDb"] == 12


@pytest.mark.parametrize("regions", [
    [{"rowId": "a", "startFrame": 0, "endFrame": 5, "gainDb": 1}, {"rowId": "b", "startFrame": 4, "endFrame": 8, "gainDb": 1}],
    [{"rowId": "a", "startFrame": 5, "endFrame": 4, "gainDb": 1}],
    [{"rowId": "a", "startFrame": 0, "endFrame": 11, "gainDb": 1}],
    [{"rowId": "a", "startFrame": 0, "endFrame": 5, "gainDb": float("nan")}],
    [{"rowId": "a", "startFrame": 0, "endFrame": 5, "gainDb": 13}],
])
def test_invalid_regions_are_rejected_before_destination_creation(tmp_path, regions):
    source, destination = tmp_path / "source.wav", tmp_path / "bad.wav"
    write_pcm(source, [1000] * 10)

    with pytest.raises(ValueError):
        render_loudness(source, destination, regions)

    assert not destination.exists()


def test_source_destination_alias_and_non_pcm_input_are_rejected(tmp_path):
    source = tmp_path / "source.wav"
    write_pcm(source, [1000] * 10)
    original = source.read_bytes()
    with pytest.raises(ValueError, match="không được ghi đè"):
        render_loudness(source, source, [], global_gain_db=1)
    assert source.read_bytes() == original

    stereo = tmp_path / "stereo.wav"
    write_pcm(stereo, [1000] * 20, channels=2)
    with pytest.raises(ValueError, match="mono"):
        render_loudness(stereo, tmp_path / "rejected.wav", [])

