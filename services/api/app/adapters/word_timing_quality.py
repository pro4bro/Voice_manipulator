from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median
from typing import Any, Literal

WordTimingQuality = Literal["source", "needs-alignment", "unverified"]


@dataclass(frozen=True)
class WordTimingInspection:
    """Structural validation only; it never invents or redistributes word timing."""

    quality: WordTimingQuality
    note: str | None
    words: list[dict[str, Any]]


def inspect_word_timings(raw_words: list[object], duration: float) -> WordTimingInspection:
    """Keep recognizer timestamps verbatim when plausible, flag them otherwise.

    Exact word boundaries must come from an aligner/recognizer.  This guard only
    rejects malformed timings rather than stretching short tokens or filling gaps.
    """
    try:
        parsed_duration = float(duration)
    except (TypeError, ValueError):
        parsed_duration = 0.0
    safe_duration = max(0.0, parsed_duration) if math.isfinite(parsed_duration) else 0.0
    words: list[dict[str, Any]] = []
    invalid = 0
    overlaps = 0
    previous_end = 0.0

    for raw in raw_words:
        if not isinstance(raw, dict):
            invalid += 1
            continue
        text = str(raw.get("text", "")).strip()
        try:
            start = float(raw.get("start"))
            end = float(raw.get("end"))
        except (TypeError, ValueError):
            invalid += 1
            continue
        if not text or not math.isfinite(start) or not math.isfinite(end) or end <= start:
            invalid += 1
            continue
        if start < -0.001 or end > safe_duration + 0.02:
            invalid += 1
            continue
        if start < previous_end - 0.003:
            overlaps += 1
        word = dict(raw)
        word["text"] = text
        # Rounding preserves the sidecar's 0.1 ms precision while removing no time.
        word["start"] = round(max(0.0, start), 4)
        word["end"] = round(min(safe_duration, end), 4)
        words.append(word)
        previous_end = max(previous_end, end)

    if not words:
        return WordTimingInspection("needs-alignment", "STT không trả về word timing hợp lệ; cần căn chỉnh trước khi sync subtitle.", [])

    spans = [float(word["end"]) - float(word["start"]) for word in words]
    typical = median(spans)
    tiny_count = sum(span < 0.025 for span in spans)
    long_limit = max(8.0, typical * 16.0)
    long_count = sum(span > long_limit for span in spans)

    issues: list[str] = []
    if invalid:
        issues.append(f"{invalid} từ thiếu timestamp hợp lệ")
    if overlaps:
        issues.append(f"{overlaps} timestamp chồng nhau")
    if len(words) >= 12 and tiny_count >= max(6, math.ceil(len(words) * 0.12)):
        issues.append(f"{tiny_count} từ ngắn bất thường")
    if long_count:
        issues.append(f"{long_count} từ kéo dài bất thường")

    if issues:
        return WordTimingInspection(
            "needs-alignment",
            "Word timing chưa đáng tin (" + "; ".join(issues) + "). Timeline và SRT từng từ cần căn chỉnh lại.",
            words,
        )
    return WordTimingInspection("source", None, words)