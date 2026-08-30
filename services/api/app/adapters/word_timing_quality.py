from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median
from typing import Any, Literal

WordTimingQuality = Literal["source", "partial", "needs-alignment", "unverified"]
WORD_TIMING_TRUST_VERSION = 1

_PARTIAL_LIMIT = 0.05
_LEGACY_STRUCTURAL_NOTE_PREFIX = "Word timing chưa đáng tin ("


@dataclass(frozen=True)
class WordTimingInspection:
    """Structural validation only; it never invents or redistributes word timing."""

    quality: WordTimingQuality
    note: str | None
    words: list[dict[str, Any]]


def reconcile_word_timing_quality(
    declared_quality: WordTimingQuality | str,
    declared_note: str | None,
    raw_words: list[object],
    duration: float,
    *,
    trust_version: int = 0,
) -> WordTimingInspection:
    """Validate timing without upgrading provisional or legacy provenance.

    Old ``needs-alignment`` values produced by this module's former asset-wide
    structural check may be reclassified from their per-word flags. Other
    processor-declared failures remain untrusted even when their surviving
    intervals happen to look plausible.
    """
    inspection = inspect_word_timings(raw_words, duration)
    declared = (
        declared_quality
        if declared_quality in {"source", "partial", "needs-alignment", "unverified"}
        else "unverified"
    )
    words = [dict(word) for word in inspection.words]

    legacy_structural_inspection = (
        declared == "needs-alignment"
        and str(declared_note or "").startswith(_LEGACY_STRUCTURAL_NOTE_PREFIX)
    )
    may_reclassify = (
        declared in {"source", "partial"}
        or legacy_structural_inspection
        or trust_version >= WORD_TIMING_TRUST_VERSION
    )
    if not may_reclassify:
        # A processor failure or an unverified legacy payload is a provenance
        # failure, not something structural plausibility is allowed to promote.
        for word in words:
            word["timingTrusted"] = False
        if declared == "needs-alignment" or inspection.quality == "needs-alignment":
            return WordTimingInspection(
                "needs-alignment", declared_note or inspection.note, words
            )
        return WordTimingInspection("unverified", declared_note, words)

    missing_provenance = 0
    if (
        not legacy_structural_inspection
        and trust_version < WORD_TIMING_TRUST_VERSION
        and declared != "partial"
    ):
        for word in words:
            if word.get("timingTrusted") is True and not str(
                word.get("timingSource") or ""
            ).strip():
                word["timingTrusted"] = False
                missing_provenance += 1

    quality = _quality_from_flags(words)
    if missing_provenance:
        note = _trust_note(
            words,
            [f"{missing_provenance} từ không ghi nguồn timing"],
        )
    elif quality == "source":
        note = declared_note
    else:
        note = inspection.note
    return WordTimingInspection(quality, note, words)


def inspect_word_timings(raw_words: list[object], duration: float) -> WordTimingInspection:
    """Keep every word dict and mark whether its measured interval is usable.

    Exact boundaries still belong to an aligner or recognizer. This guard only
    records structural trust; it never stretches, clamps, drops, or fills a word
    interval to make the asset pass.
    """
    try:
        parsed_duration = float(duration)
    except (TypeError, ValueError):
        parsed_duration = 0.0
    safe_duration = (
        max(0.0, parsed_duration) if math.isfinite(parsed_duration) else 0.0
    )

    words: list[dict[str, Any]] = []
    candidates: list[tuple[int, float, float]] = []
    malformed = 0
    invalid = 0

    for raw in raw_words:
        if not isinstance(raw, dict):
            malformed += 1
            continue
        word = dict(raw)
        text = str(raw.get("text", "")).strip()
        word["text"] = text
        trusted = bool(text)
        try:
            start = float(raw.get("start"))
            end = float(raw.get("end"))
        except (TypeError, ValueError):
            start = math.nan
            end = math.nan

        finite = math.isfinite(start) and math.isfinite(end)
        if finite:
            # Preserve the source interval. Rounding only removes JSON noise and
            # matches the existing 0.1 ms persistence precision.
            word["start"] = round(start, 4)
            word["end"] = round(end, 4)
        in_bounds = finite and 0.0 <= start and end <= safe_duration
        positive = finite and end > start
        trusted = trusted and in_bounds and positive
        word["timingTrusted"] = trusted
        words.append(word)
        if trusted:
            candidates.append((len(words) - 1, start, end))
        else:
            invalid += 1

    spans = [end - start for _, start, end in candidates]
    typical = median(spans) if spans else 0.0
    long_limit = max(8.0, typical * 16.0)
    tiny = 0
    long = 0
    for index, start, end in candidates:
        span = end - start
        if span < 0.025:
            words[index]["timingTrusted"] = False
            tiny += 1
        if span > long_limit:
            words[index]["timingTrusted"] = False
            long += 1

    overlaps = 0
    previous_end: float | None = None
    for index, start, end in candidates:
        if previous_end is not None and start < previous_end - 0.003:
            words[index]["timingTrusted"] = False
            overlaps += 1
        previous_end = end if previous_end is None else max(previous_end, end)

    quality = _quality_from_flags(words, malformed)
    if quality == "source":
        return WordTimingInspection("source", None, words)

    issues: list[str] = []
    if invalid or malformed:
        issues.append(f"{invalid + malformed} từ thiếu timestamp hợp lệ")
    if overlaps:
        issues.append(f"{overlaps} timestamp chồng nhau")
    if tiny:
        issues.append(f"{tiny} từ ngắn dưới 25 ms")
    if long:
        issues.append(f"{long} từ kéo dài quá {long_limit:.2f} giây")
    if not words:
        return WordTimingInspection(
            "needs-alignment",
            "STT không trả về word timing hợp lệ; cần căn chỉnh trước khi sync subtitle.",
            [],
        )
    return WordTimingInspection(quality, _trust_note(words, issues, malformed), words)


def _quality_from_flags(
    words: list[dict[str, Any]], extra_untrusted: int = 0
) -> WordTimingQuality:
    trusted = sum(word.get("timingTrusted") is True for word in words)
    total = len(words) + extra_untrusted
    if not total or not trusted:
        return "needs-alignment"
    untrusted = total - trusted
    if untrusted == 0:
        return "source"
    if untrusted / total < _PARTIAL_LIMIT:
        return "partial"
    return "needs-alignment"


def _trust_note(
    words: list[dict[str, Any]], issues: list[str], extra_untrusted: int = 0
) -> str:
    total = len(words) + extra_untrusted
    untrusted = total - sum(word.get("timingTrusted") is True for word in words)
    detail = "; ".join(issues) if issues else "timestamp không đạt kiểm tra cấu trúc"
    return (
        f"{untrusted}/{total} từ cần căn chỉnh riêng ({detail}). "
        "Timeline vẫn hiển thị các từ này với cảnh báo; SRT sẽ bỏ qua dòng liên quan."
    )
