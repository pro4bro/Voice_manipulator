from __future__ import annotations

import array
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
import wave
from functools import lru_cache
from pathlib import Path
from typing import Any


SAMPLE_RATE = 24_000
MAX_FRAMES = SAMPLE_RATE * 60 * 10
MAX_ADJUSTMENT_FRAMES = int(SAMPLE_RATE * 0.060)
REQUEST_TIMEOUT_SECONDS = 30.0


def _pcm_samples(data: bytes) -> array.array[int]:
    samples = array.array("h")
    samples.frombytes(data)
    if samples.itemsize != 2:
        raise ValueError("PCM16 is not supported on this platform.")
    if samples.typecode != "h":  # pragma: no cover - typecode is stable in CPython
        raise ValueError("Could not decode signed PCM16 samples.")
    if os.sys.byteorder != "little":
        samples.byteswap()
    return samples


def _pcm_bytes(samples: array.array[int]) -> bytes:
    result = array.array("h", samples)
    if os.sys.byteorder != "little":
        result.byteswap()
    return result.tobytes()


def _read_wav(path: Path) -> tuple[bytes, int]:
    try:
        with wave.open(str(path), "rb") as wav:
            channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            sample_rate = wav.getframerate()
            frame_count = wav.getnframes()
            compression = wav.getcomptype()
            data = wav.readframes(frame_count)
    except (wave.Error, OSError) as exc:
        raise ValueError(f"Could not read PCM WAV: {exc}") from exc
    if channels != 1 or sample_width != 2 or sample_rate != SAMPLE_RATE or compression != "NONE":
        raise ValueError("Source must be uncompressed PCM16 mono at 24 kHz.")
    if len(data) != frame_count * 2:
        raise ValueError("Source WAV has an incomplete PCM frame.")
    if frame_count > MAX_FRAMES:
        raise ValueError("Source exceeds the 10 minute stretch limit.")
    return data, frame_count


def _write_wav(path: Path, pcm: bytes) -> None:
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)


def _resolve_ffmpeg() -> str:
    configured = os.getenv("PRO4BRO_FFMPEG_PATH")
    project_root = Path(__file__).resolve().parents[4]
    portable_name = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"
    portable = project_root / ".tools" / "ffmpeg" / portable_name
    executable = configured or (str(portable) if portable.is_file() else None) or shutil.which("ffmpeg")
    if not executable:
        raise RuntimeError("FFmpeg is required for pitch-preserving stretch preview.")
    if configured and not Path(configured).is_file():
        raise RuntimeError("PRO4BRO_FFMPEG_PATH does not point to a file.")
    return executable


def _remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Stretch preview exceeded its 30 second request limit.")
    return remaining


@lru_cache(maxsize=8)
def _inspect_atempo(ffmpeg: str) -> None:
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-filters"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5.0,
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError("Timed out checking FFmpeg atempo support.") from exc
    if result.returncode != 0:
        raise RuntimeError("Could not inspect the configured FFmpeg filters.")
    if not re.search(r"(?m)^\s*[A-Z.]{3}\s+atempo\s+A->A\s", result.stdout):
        raise RuntimeError("Configured FFmpeg does not provide the atempo audio filter.")


def _require_atempo(ffmpeg: str, deadline: float) -> None:
    _remaining(deadline)
    _inspect_atempo(ffmpeg)


def _silence_prefix(samples: array.array[int], limit: int) -> int:
    count = 0
    while count < min(limit, len(samples)) and samples[count] == 0:
        count += 1
    return count


def _silence_suffix(samples: array.array[int], limit: int) -> int:
    count = 0
    while count < min(limit, len(samples)) and samples[len(samples) - count - 1] == 0:
        count += 1
    return count


def _fit_exact_frames(pcm: bytes, target_frames: int) -> tuple[bytes, int]:
    samples = _pcm_samples(pcm)
    difference = target_frames - len(samples)
    if difference == 0:
        return pcm, 0
    if abs(difference) > MAX_ADJUSTMENT_FRAMES:
        raise ValueError("FFmpeg output differs from target by more than 60 ms.")
    if difference > 0:
        return pcm + (b"\0\0" * difference), difference

    remove = -difference
    trailing = min(remove, _silence_suffix(samples, remove))
    remaining = remove - trailing
    leading = min(remaining, _silence_prefix(samples, remaining))
    if trailing + leading != remove:
        raise ValueError("Stretch output is too long; fitting would remove audible samples.")
    end = len(pcm) - trailing * 2
    return pcm[leading * 2 : end], -remove


def _boundary_step(before: bytes, region: bytes, after: bytes) -> float:
    region_samples = _pcm_samples(region)
    before_samples = _pcm_samples(before)
    after_samples = _pcm_samples(after)
    steps: list[int] = []
    if before_samples and region_samples:
        steps.append(abs(region_samples[0] - before_samples[-1]))
    if after_samples and region_samples:
        steps.append(abs(after_samples[0] - region_samples[-1]))
    return max(steps, default=0) / 32768.0


def _run_atempo(ffmpeg: str, source: Path, destination: Path, tempo: float, deadline: float) -> bytes:
    command = [
        ffmpeg,
        "-y",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source),
        "-af",
        f"atempo={tempo:.12g}",
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        str(destination),
    ]
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=min(REQUEST_TIMEOUT_SECONDS, _remaining(deadline)),
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError("FFmpeg stretch exceeded its 30 second request limit.") from exc
    if result.returncode != 0:
        detail = result.stderr.strip()[-800:]
        raise RuntimeError(f"FFmpeg atempo failed: {detail or 'unknown error'}")
    pcm, _ = _read_wav(destination)
    return pcm


def _render_exact_region(
    ffmpeg: str,
    input_path: Path,
    output_path: Path,
    target_frames: int,
    tempo: float,
    deadline: float,
) -> tuple[bytes, int]:
    stretched = _run_atempo(ffmpeg, input_path, output_path, tempo, deadline)
    try:
        return _fit_exact_frames(stretched, target_frames)
    except ValueError as exc:
        if "fitting would remove audible samples" not in str(exc):
            raise

    # FFmpeg's WSOLA window can emit a few audible frames beyond its nominal
    # tempo duration. Re-render slightly faster and pad its short tail, rather
    # than discard those frames. Bound the correction to 80% of the allowed
    # 60 ms fit window even for long selected spans.
    correction_fraction = min(0.006, MAX_ADJUSTMENT_FRAMES * 0.8 / target_frames)
    corrected_tempo = max(
        tempo * (1 + correction_fraction),
        tempo * (len(stretched) / 2) / target_frames * 1.001,
    )
    if corrected_tempo > 2.0:
        raise ValueError("Stretch output is too long to fit without audible truncation.")
    corrected = _run_atempo(ffmpeg, input_path, output_path, corrected_tempo, deadline)
    return _fit_exact_frames(corrected, target_frames)


def render_stretch(source: Path, destination: Path, operations: list[dict[str, Any]]) -> dict[str, Any]:
    """Render ordered preview stretches while preserving the immutable source.

    Operations use half-open frame intervals on the timeline produced by all
    prior operations. PCM outside each interval is copied byte-for-byte.
    """
    started = time.monotonic()
    deadline = started + REQUEST_TIMEOUT_SECONDS
    source = Path(source)
    destination = Path(destination)
    try:
        if source.resolve() == destination.resolve():
            raise ValueError("Stretch destination must not overwrite its source.")
    except OSError as exc:
        raise ValueError(f"Could not resolve source/destination paths: {exc}") from exc
    if not operations:
        raise ValueError("At least one stretch operation is required.")

    pcm, source_frames = _read_wav(source)
    ffmpeg = _resolve_ffmpeg()
    _require_atempo(ffmpeg, deadline)
    destination.parent.mkdir(parents=True, exist_ok=True)
    total_padding = 0
    max_boundary_step = 0.0

    with tempfile.TemporaryDirectory(prefix=".voice-stretch-", dir=destination.parent) as temp_name:
        temp_dir = Path(temp_name)
        for index, operation in enumerate(operations):
            if not isinstance(operation, dict):
                raise ValueError("Each stretch operation must be an object.")
            start = operation.get("startFrame")
            end = operation.get("endFrame")
            target_frames = operation.get("targetFrames")
            values = (start, end, target_frames)
            if any(isinstance(value, bool) or not isinstance(value, int) for value in values):
                raise ValueError("startFrame, endFrame, and targetFrames must be integers.")
            if start < 0 or end <= start or end > len(pcm) // 2:
                raise ValueError("Stretch range must be a non-empty in-bounds frame interval.")
            if target_frames <= 0:
                raise ValueError("targetFrames must be positive.")

            source_frames_in_region = end - start
            tempo = source_frames_in_region / target_frames
            if not 0.5 <= tempo <= 2.0:
                raise ValueError("Stretch ratio is outside the supported 0.5–2.0 range.")
            resulting_total = len(pcm) // 2 - source_frames_in_region + target_frames
            if resulting_total > MAX_FRAMES:
                raise ValueError("Stretch output exceeds the 10 minute limit.")

            prefix = pcm[: start * 2]
            region = pcm[start * 2 : end * 2]
            suffix = pcm[end * 2 :]
            if math.isclose(tempo, 1.0, rel_tol=0, abs_tol=1e-12):
                stretched = region
            else:
                input_path = temp_dir / f"input-{index}.wav"
                output_path = temp_dir / f"output-{index}.wav"
                _write_wav(input_path, region)
                stretched, padding = _render_exact_region(
                    ffmpeg, input_path, output_path, target_frames, tempo, deadline
                )
            if math.isclose(tempo, 1.0, rel_tol=0, abs_tol=1e-12):
                padding = 0
            total_padding += padding
            operation_boundary_step = _boundary_step(prefix, stretched, suffix)
            max_boundary_step = max(max_boundary_step, operation_boundary_step)
            if operation_boundary_step > 0.05:
                raise ValueError(
                    f"Stretch boundary step {operation_boundary_step:.6f} exceeds 0.05 full scale."
                )
            pcm = prefix + stretched + suffix

        actual_frames = len(pcm) // 2
        if actual_frames > MAX_FRAMES:
            raise ValueError("Stretch output exceeds the 10 minute limit.")
        samples = _pcm_samples(pcm)
        clipped_samples = sum(sample in (-32768, 32767) for sample in samples)
        if clipped_samples:
            raise ValueError(f"Stretch output contains {clipped_samples} clipped PCM16 samples.")
        output_temp = temp_dir / "result.wav"
        _write_wav(output_temp, pcm)
        # Re-read the completed artifact before publishing it.
        verified_pcm, verified_frames = _read_wav(output_temp)
        if verified_frames != actual_frames or verified_pcm != pcm:
            raise RuntimeError("Rendered WAV did not retain its exact PCM frames.")
        os.replace(output_temp, destination)

    target_frames = source_frames + sum(
        int(operation["targetFrames"]) - (int(operation["endFrame"]) - int(operation["startFrame"]))
        for operation in operations
    )
    return {
        "processingSeconds": time.monotonic() - started,
        "targetFrames": target_frames,
        "actualFrames": actual_frames,
        "paddingFrames": total_padding,
        "method": "ffmpeg-atempo",
        "clippedSamples": clipped_samples,
        "maxBoundaryStep": max_boundary_step,
        "boundariesWithinLimit": max_boundary_step <= 0.05,
    }
