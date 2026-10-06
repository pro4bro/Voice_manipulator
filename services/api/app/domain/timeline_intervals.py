"""One source-time interval policy for playback and audio consumers."""
from __future__ import annotations

from app.domain.models import ProjectMediaAsset, TimelineEditRange


def excluded_intervals(asset: ProjectMediaAsset) -> list[TimelineEditRange]:
    ranges = list(asset.removed_ranges)
    working = getattr(asset, "working_range", None)
    if working:
        if working.start > 0:
            ranges.append(TimelineEditRange(id="outside-in", start=0, end=working.start))
        if working.end < asset.duration:
            ranges.append(TimelineEditRange(id="outside-out", start=working.end, end=asset.duration))
    merged: list[TimelineEditRange] = []
    for item in sorted(ranges, key=lambda item: item.start):
        start, end = max(0, item.start), min(asset.duration, item.end)
        if end <= start:
            continue
        if merged and start <= merged[-1].end:
            merged[-1] = merged[-1].model_copy(update={"end": max(merged[-1].end, end)})
        else:
            merged.append(TimelineEditRange(id=item.id, start=start, end=end))
    return merged


def included_intervals(asset: ProjectMediaAsset) -> list[tuple[float, float]]:
    result: list[tuple[float, float]] = []
    cursor = 0.0
    for item in excluded_intervals(asset):
        if item.start > cursor:
            result.append((cursor, item.start))
        cursor = item.end
    if cursor < asset.duration:
        result.append((cursor, asset.duration))
    return result


def restore_span(start: float, end: float, kept: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Split a compact processor span at every removed-source seam."""
    result = []
    offset = 0.0
    for source_start, source_end in kept:
        length = source_end - source_start
        a, b = max(start, offset), min(end, offset + length)
        if b > a:
            result.append((source_start + a - offset, source_start + b - offset))
        offset += length
    return result
