from __future__ import annotations

import hashlib
import math
import os
import sys
import tempfile
import wave
from array import array
from pathlib import Path
from typing import Any


SAMPLE_RATE = 24_000
HEADROOM_DBFS = -1.0
BOUNDARY_RAMP_FRAMES = 120  # 5 ms at 24 kHz; linear amplitude envelope.
MIN_GAIN_DB = -60.0
MAX_GAIN_DB = 12.0
_PCM_SCALE = 32768.0


def _finite_gain(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} phải là số hữu hạn.")
    result = float(value)
    if not MIN_GAIN_DB <= result <= MAX_GAIN_DB:
        raise ValueError(f"{name} phải nằm trong khoảng {MIN_GAIN_DB:g} đến {MAX_GAIN_DB:g} dB.")
    return result


def _dbfs(amplitude: float) -> float | None:
    return 20 * math.log10(amplitude / _PCM_SCALE) if amplitude > 0 else None


def _measure(samples: array, start: int = 0, end: int | None = None) -> dict[str, float | None]:
    end = len(samples) if end is None else end
    count = end - start
    if count <= 0:
        return {"rmsDbfs": None, "peakDbfs": None}
    square_mean = sum(samples[index] * samples[index] for index in range(start, end)) / count
    rms = math.sqrt(square_mean)
    peak = max(abs(samples[index]) for index in range(start, end))
    return {"rmsDbfs": _dbfs(rms), "peakDbfs": _dbfs(float(peak))}


def _headroom_gain(requested_db: float, peak: int, *, allow_unity_bypass: bool = False) -> tuple[float, bool]:
    # An explicit no-op preserves source PCM, including existing hot audio.
    # A non-zero row override can net to 0 dB with global gain; that is still
    # a changed region and must obey the headroom ceiling.
    if (allow_unity_bypass and requested_db == 0) or peak == 0:
        return requested_db, False
    safe_gain = HEADROOM_DBFS - float(_dbfs(float(peak)))
    applied = min(requested_db, safe_gain)
    return applied, not math.isclose(applied, requested_db, abs_tol=1e-9)


def _read_source(source: Path) -> tuple[array, dict[str, int]]:
    try:
        with wave.open(str(source), "rb") as wav:
            info = {
                "sampleRate": wav.getframerate(),
                "channels": wav.getnchannels(),
                "sampleWidth": wav.getsampwidth(),
                "frames": wav.getnframes(),
            }
            if wav.getcomptype() != "NONE" or info["sampleWidth"] != 2:
                raise ValueError("Nguồn phải là WAV PCM16 không nén.")
            if info["sampleRate"] != SAMPLE_RATE or info["channels"] != 1:
                raise ValueError("Nguồn phải là WAV PCM16 mono 24 kHz.")
            if info["frames"] <= 0:
                raise ValueError("WAV nguồn không có frame audio.")
            raw = wav.readframes(info["frames"])
            if len(raw) != info["frames"] * 2:
                raise ValueError("WAV nguồn bị thiếu frame.")
    except (wave.Error, EOFError, OSError) as exc:
        raise ValueError("Không đọc được WAV nguồn.") from exc
    samples = array("h")
    if samples.itemsize != 2:
        raise ValueError("Python runtime không có kiểu PCM16 tương thích.")
    samples.frombytes(raw)
    if sys.byteorder != "little":
        samples.byteswap()
    return samples, info


def _validate_regions(regions: list[dict[str, Any]], frames: int) -> list[dict[str, Any]]:
    if not isinstance(regions, list):
        raise ValueError("Regions phải là danh sách.")
    validated = []
    previous_end = 0
    for index, region in enumerate(regions):
        if not isinstance(region, dict):
            raise ValueError(f"Region {index + 1} không hợp lệ.")
        row_id = region.get("rowId")
        start, end = region.get("startFrame"), region.get("endFrame")
        if not isinstance(row_id, str) or not row_id.strip():
            raise ValueError(f"Region {index + 1} cần rowId.")
        if isinstance(start, bool) or not isinstance(start, int) or isinstance(end, bool) or not isinstance(end, int):
            raise ValueError(f"Region {index + 1} cần startFrame/endFrame dạng số nguyên.")
        if start < 0 or end <= start or end > frames:
            raise ValueError(f"Region {index + 1} vượt ngoài frame audio hoặc rỗng.")
        if index and start < previous_end:
            raise ValueError("Regions phải được sắp theo thời gian và không chồng lấn.")
        gain = _finite_gain(region.get("gainDb"), f"Region {index + 1} gainDb")
        validated.append({"rowId": row_id, "startFrame": start, "endFrame": end, "gainDb": gain})
        previous_end = end
    return validated


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def render_loudness(
    source: Path,
    destination: Path,
    regions: list[dict[str, Any]],
    global_gain_db: float = 0,
) -> dict[str, Any]:
    """Render non-destructive PCM16 gain automation without dynamic compression.

    Each region's requested gain is added to the global request in dB. A scalar
    gain is used per region; a 5 ms linear-amplitude ramp transitions to/from
    the global gain only when nonzero samples occur near a region boundary.
    Positive or near-zero gains are reduced as needed to keep changed regions
    at or below -1 dBFS. Existing PCM is never rewritten in place.
    """
    source, destination = Path(source), Path(destination)
    if not source.is_file():
        raise ValueError("WAV nguồn không tồn tại.")
    if source.resolve() == destination.resolve():
        raise ValueError("Đường dẫn đích không được ghi đè WAV nguồn.")
    global_requested = _finite_gain(global_gain_db, "Global gain")
    samples, info = _read_source(source)
    validated = _validate_regions(regions, info["frames"])
    source_metrics = _measure(samples)
    global_peak = max(abs(sample) for sample in samples)
    global_applied, global_limited = _headroom_gain(global_requested, global_peak, allow_unity_bypass=True)
    global_factor = 10 ** (global_applied / 20)
    rendered = array("h")
    clipped_samples = 0
    for sample in samples:
        value = int(round(sample * global_factor))
        if value < -32768 or value > 32767:
            clipped_samples += 1
        rendered.append(max(-32768, min(32767, value)))
    region_reports: list[dict[str, Any]] = []

    for region in validated:
        start, end = region["startFrame"], region["endFrame"]
        region_peak = max(abs(samples[index]) for index in range(start, end))
        requested_total = global_requested + region["gainDb"]
        if region["gainDb"] == 0:
            applied_total, limited = global_applied, global_limited
        else:
            applied_total, limited = _headroom_gain(requested_total, region_peak)
        target_factor = 10 ** (applied_total / 20)
        needs_transition = not math.isclose(target_factor, global_factor, rel_tol=1e-12, abs_tol=1e-12)
        has_boundary_signal = bool(
            any(samples[start:min(end, start + BOUNDARY_RAMP_FRAMES)])
            or any(samples[max(start, end - BOUNDARY_RAMP_FRAMES):end])
        )
        if needs_transition and has_boundary_signal and end - start < 2 * BOUNDARY_RAMP_FRAMES:
            raise ValueError("Gain region too short for the 5 ms boundary ramp; no artifact was published.")
        ramp_start = min(BOUNDARY_RAMP_FRAMES, (end - start) // 2) if needs_transition and any(samples[start:min(end, start + BOUNDARY_RAMP_FRAMES)]) else 0
        ramp_end = min(BOUNDARY_RAMP_FRAMES, (end - start) // 2) if needs_transition and any(samples[max(start, end - BOUNDARY_RAMP_FRAMES):end]) else 0

        for frame in range(start, end):
            weight = 1.0
            if ramp_start and frame - start < ramp_start:
                weight = min(weight, (frame - start) / ramp_start)
            if ramp_end and end - 1 - frame < ramp_end:
                weight = min(weight, (end - 1 - frame) / ramp_end)
            factor = global_factor + (target_factor - global_factor) * weight
            value = int(round(samples[frame] * factor))
            if value < -32768 or value > 32767:
                clipped_samples += 1
            rendered[frame] = max(-32768, min(32767, value))

        region_reports.append({
            "rowId": region["rowId"],
            "startFrame": start,
            "endFrame": end,
            "requestedGainDb": region["gainDb"],
            "requestedTotalGainDb": requested_total,
            "appliedRowGainDb": applied_total - global_applied,
            "appliedTotalGainDb": applied_total,
            "headroomLimited": limited,
            "source": _measure(samples, start, end),
            "output": _measure(rendered, start, end),
            "rampStartFrames": ramp_start,
            "rampEndFrames": ramp_end,
        })

    if clipped_samples:
        raise ValueError("Headroom không đủ để bảo đảm output PCM không clipping; chưa ghi artifact.")
    if sys.byteorder == "little":
        raw = rendered.tobytes()
    else:
        output_samples = rendered.copy()
        output_samples.byteswap()
        raw = output_samples.tobytes()
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent)
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        with wave.open(str(temporary), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(raw)
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    return {
        "version": 1,
        "sourceSha256": _hash(source),
        "outputSha256": _hash(destination),
        "sampleRate": SAMPLE_RATE,
        "channels": 1,
        "sampleWidth": 2,
        "frames": len(samples),
        "durationSeconds": len(samples) / SAMPLE_RATE,
        "headroomDbfs": HEADROOM_DBFS,
        "clippedSamples": clipped_samples,
        "global": {
            "requestedGainDb": global_requested,
            "appliedGainDb": global_applied,
            "headroomLimited": global_limited,
        },
        "regions": region_reports,
        "source": source_metrics,
        "output": _measure(rendered),
        "method": "region-scalar-with-conditional-5ms-linear-amplitude-boundary-ramp",
    }
