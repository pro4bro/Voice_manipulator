from __future__ import annotations

import audioop
import json
import math
import re
import wave
from pathlib import Path
from typing import Any, Iterable


DEFAULT_WAVEFORM_POINTS = 7_200


def _source_signature(audio_path: Path) -> dict[str, int]:
    stat = audio_path.stat()
    return {"source_size": stat.st_size, "source_mtime_ns": stat.st_mtime_ns}


def _cache_path(project_root: Path, asset_id: str, point_count: int) -> Path:
    safe_asset_id = re.sub(r"[^A-Za-z0-9_-]", "_", asset_id)
    return project_root / "cache" / "waveforms" / f"{safe_asset_id}-{point_count}.json"


def project_waveform(
    project_root: Path, asset_id: str, audio_path: Path, point_count: int = DEFAULT_WAVEFORM_POINTS
) -> dict[str, Any]:
    """Return a compact, cached waveform without decoding the source in the browser."""
    point_count = max(180, min(DEFAULT_WAVEFORM_POINTS, int(point_count)))
    signature = _source_signature(audio_path)
    cache_path = _cache_path(project_root, asset_id, point_count)
    try:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if (
            cached.get("source_size") == signature["source_size"]
            and cached.get("source_mtime_ns") == signature["source_mtime_ns"]
            and cached.get("point_count") == point_count
        ):
            return {"duration": cached["duration"], "points": cached["points"]}
    except (FileNotFoundError, ValueError, KeyError, OSError):
        pass

    with wave.open(str(audio_path), "rb") as stream:
        channels = stream.getnchannels()
        sample_width = stream.getsampwidth()
        sample_rate = stream.getframerate()
        frame_count = stream.getnframes()
        if channels <= 0 or sample_width not in {1, 2, 3, 4} or sample_rate <= 0:
            raise ValueError("Unsupported WAV format for waveform preview")
        actual_points = min(point_count, max(1, frame_count))
        frames_per_point = max(1, math.ceil(frame_count / actual_points))
        scale = float(1 << (sample_width * 8 - 1))
        points: list[dict[str, float]] = []
        while len(points) < actual_points:
            chunk = stream.readframes(frames_per_point)
            if not chunk:
                break
            minimum, maximum = audioop.minmax(chunk, sample_width)
            points.append({"min": round(minimum / scale, 6), "max": round(maximum / scale, 6)})

    result = {
        "duration": round(frame_count / sample_rate, 6),
        "points": points,
    }
    payload = {**signature, "point_count": point_count, **result}
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = cache_path.with_suffix(".tmp")
    temporary_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    temporary_path.replace(cache_path)
    return result


def _srt_timestamp(seconds: float) -> str:
    milliseconds = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds_part, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02}:{minutes:02}:{seconds_part:02},{milliseconds:03}"


def _subtitle_lines(words: Iterable[dict[str, Any]]) -> list[tuple[float, float, str]]:
    lines: list[tuple[float, float, str]] = []
    current: list[str] = []
    line_start = 0.0
    line_end = 0.0
    for word in words:
        text = str(word.get("text") or "").strip()
        if not text:
            continue
        try:
            start = max(0.0, float(word.get("start", 0)))
            end = max(start, float(word.get("end", start)))
        except (TypeError, ValueError):
            continue
        if not current:
            line_start = start
        candidate = " ".join([*current, text])
        current.append(text)
        line_end = max(line_end, end)
        punctuation = text.endswith((".", "!", "?", "…"))
        if len(current) >= 10 or len(candidate) >= 48 or line_end - line_start >= 4.8 or punctuation:
            lines.append((line_start, max(line_end, line_start + 0.08), candidate))
            current = []
    if current:
        lines.append((line_start, max(line_end, line_start + 0.08), " ".join(current)))
    return lines


def render_srt(words: Iterable[dict[str, Any]]) -> str:
    lines = _subtitle_lines(words)
    return "\n\n".join(
        f"{index}\n{_srt_timestamp(start)} --> {_srt_timestamp(end)}\n{text}"
        for index, (start, end, text) in enumerate(lines, start=1)
    ) + ("\n" if lines else "")


def subtitle_export_path(project_root: Path, asset_id: str, asset_name: str) -> Path:
    stem = re.sub(r"[^A-Za-z0-9._-]", "_", Path(asset_name).stem).strip("._") or "subtitle"
    safe_asset_id = re.sub(r"[^A-Za-z0-9_-]", "_", asset_id)
    return project_root / "exports" / "subtitles" / f"{stem}-{safe_asset_id}.srt"