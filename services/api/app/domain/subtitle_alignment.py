"""Pure, conservative subtitle timing proposals for finalized source audio."""

from __future__ import annotations

import math
import statistics
from typing import Any

_MIN_DURATION = 0.025
_MAX_READY_MOVE = 0.150
_LOCKED_STATES = {"manual", "user", "user-corrected", "user-edited"}


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _manual(word: dict[str, Any]) -> bool:
    timing_source = str(word.get("timingSource") or "").lower()
    if timing_source.startswith("manual"):
        return True
    for key in ("reviewState", "selectedVariant"):
        if str(word.get(key) or "").lower() in _LOCKED_STATES:
            return True
    source_timing = word.get("sourceTiming")
    return isinstance(source_timing, dict) and str(source_timing.get("source") or "").lower().startswith("manual")


def _valid_interval(interval: tuple[float, float], duration: float) -> bool:
    start, end = interval
    return 0 <= start < end <= duration and end - start >= _MIN_DURATION


def _local_timing_outliers(words: list[dict[str, Any]], intervals: list[tuple[float, float] | None]) -> dict[int, dict[str, float | str]]:
    """Find local duration-per-character outliers without changing intervals."""
    rates: dict[int, float] = {}
    for index, (word, interval) in enumerate(zip(words, intervals)):
        if interval is None or interval[1] <= interval[0]:
            continue
        characters = sum(character.isalnum() for character in str(word.get("text", "")))
        if characters:
            rates[index] = math.log((interval[1] - interval[0]) / characters)
    outliers: dict[int, dict[str, float | str]] = {}
    for index, rate in rates.items():
        nearby = [value for other, value in rates.items() if other != index and abs(other - index) <= 4]
        if len(nearby) < 3:
            continue
        center = statistics.median(nearby)
        mad = statistics.median(abs(value - center) for value in nearby)
        scale = max(1.4826 * mad, 0.15)
        if abs(rate - center) > 3.5 * scale:
            outliers[index] = {
                "reason": "speaking-rate-outlier" if rate < center else "duration-outlier",
                "log_duration_per_character": rate,
                "local_median_log_duration_per_character": center,
                "local_mad_log_duration_per_character": mad,
                "robust_deviation": abs(rate - center) / scale,
            }
    return outliers


def _waveform_support(interval: tuple[float, float], rms: list[float], frame_seconds: float) -> bool:
    """Require local activity near both proposed edges; never move edges to peaks."""
    peak = max(rms, default=0.0)
    if peak <= 0:
        return False
    threshold = max(peak * 0.03, 1e-8)
    start, end = interval
    inward = min(0.10, (end - start) / 3)
    edge_windows = ((start, min(end, start + inward)), (max(start, end - inward), end))
    for left, right in edge_windows:
        first = max(0, int(math.floor(left / frame_seconds)))
        stop = min(len(rms), int(math.ceil(right / frame_seconds)) + 1)
        if not any(rms[pos] >= threshold for pos in range(first, stop)):
            return False
    return True


def _group_translations(words, before, aligned, selected, duration, rms, frame, landmarks):
    """Infer one translation per short, fully scoped speech group, never its pace."""
    groups: list[list[int]] = []
    for i, word in enumerate(words):
        old = before[i]
        if old is None:
            groups.append([i])
            continue
        if groups and before[groups[-1][0]] is not None and before[groups[-1][-1]] is not None:
            first, last = groups[-1][0], groups[-1][-1]
            same_segment = (word.get("segmentIndex") == words[last].get("segmentIndex"))
            if same_segment and old[1] - before[first][0] <= 7 and 0 <= old[0] - before[last][1] <= .35:
                groups[-1].append(i)
                continue
        groups.append([i])
    translations, diagnostics = {}, []
    for group in groups:
        if any(i not in selected or _manual(words[i]) or before[i] is None or
               not _valid_interval(before[i], duration) for i in group):
            continue
        anchors = []
        for i in group:
            measured, old = aligned[i], before[i]
            start, end, score = (_number(measured.get(k)) for k in ("start", "end", "score"))
            if start is None or end is None or score is None or score < .8:
                continue
            if not _valid_interval((start, end), duration) or not .5 <= (end - start) / (old[1] - old[0]) <= 2:
                continue
            anchors.append((i, (old[0] + old[1]) / 2, start - old[0], end - old[1]))
        if len(anchors) < 3:
            continue
        span = (sum(before[group[-1]]) - sum(before[group[0]])) / 2
        coverage = (anchors[-1][1] - anchors[0][1]) / span if span > 0 else 0
        start_offset = statistics.median(a[2] for a in anchors)
        end_offset = statistics.median(a[3] for a in anchors)
        mad_start = statistics.median(abs(a[2] - start_offset) for a in anchors)
        mad_end = statistics.median(abs(a[3] - end_offset) for a in anchors)
        offset = statistics.median([d for a in anchors for d in a[2:]])
        if coverage < .6 or max(mad_start, mad_end) > .030 or abs(start_offset - end_offset) > .060 or abs(offset) > .5:
            continue
        # Each CTC edge corroborated by a scale-stable waveform corner receives
        # one extra vote. It cannot certify an unstable group or move its
        # consensus by more than 30ms. A corner alone never identifies a word.
        waveform_anchors = [a[position] for a in anchors for kind, edge, position in
            (("onset", "start", 2), ("offset", "end", 3)) if any(
                mark["kind"] == kind and abs(mark["time"] - aligned[a[0]][edge]) <= .030 for mark in landmarks)]
        weighted = statistics.median([d for a in anchors for d in a[2:]] + waveform_anchors)
        if abs(weighted - offset) <= .030:
            offset = weighted
        proposed = [(before[i][0] + offset, before[i][1] + offset) for i in group]
        if not all(_valid_interval(bounds, duration) for bounds in proposed):
            continue
        if rms is not None and sum(_waveform_support(bounds, rms, frame) for bounds in proposed) / len(group) < .8:
            continue
        translations.update({i: offset for i in group})
        diagnostics.append({"indexes": group, "offset": offset, "anchor_count": len(anchors),
                            "waveform_anchor_count": len(waveform_anchors),
                            "coverage": coverage, "start_mad": mad_start, "end_mad": mad_end})
    return translations, diagnostics


def propose_alignment(
    words: list[dict[str, Any]],
    aligned: list[dict[str, Any]] | None,
    duration: float,
    *,
    rms: list[float] | None = None,
    frame_seconds: float = 0.01,
    mode: str = "auto",
    start_offset: float = 0,
    end_offset: float = 0,
    indexes: list[int] | None = None,
    waveform_landmarks: list[dict] | None = None,
) -> dict[str, Any]:
    """Return reviewable timing changes without changing words or source data.

    CTC is treated as a proposal source. Automatic rows become ready only when
    their endpoint offsets are corroborated by a stable local group of measured
    anchors, the individual move is modest, and the default-selected
    output remains structurally valid.
    """
    source_duration = _number(duration)
    if source_duration is None or source_duration < 0:
        raise ValueError("Audio duration must be finite and nonnegative.")
    if mode not in {"auto", "offset"}:
        raise ValueError("mode must be 'auto' or 'offset'.")
    in_offset, out_offset = _number(start_offset), _number(end_offset)
    if in_offset is None or out_offset is None:
        raise ValueError("Offsets must be finite seconds.")
    frame = _number(frame_seconds)
    if frame is None or frame <= 0:
        raise ValueError("frame_seconds must be finite and positive.")
    rms_values = None
    if rms is not None:
        rms_values = [_number(value) for value in rms]
        if any(value is None or value < 0 for value in rms_values):
            raise ValueError("RMS values must be finite and nonnegative.")
        rms_values = [float(value) for value in rms_values]
    if aligned is not None:
        if len(aligned) != len(words) or any(str(a.get("text", "")) != str(w.get("text", "")) for w, a in zip(words, aligned)):
            raise ValueError("Aligned words must match the source text count and order.")
    if indexes is not None:
        if any(type(index) is not int for index in indexes):
            raise ValueError("Word indexes must be integers.")
        if len(set(indexes)) != len(indexes):
            raise ValueError("Word indexes must not contain duplicates.")
    selected = set(range(len(words))) if indexes is None else set(indexes)
    if any(type(index) is not int or index < 0 or index >= len(words) for index in selected):
        raise ValueError("Word indexes must refer to existing words.")

    before: list[tuple[float, float] | None] = []
    for word in words:
        start, end = _number(word.get("start")), _number(word.get("end"))
        before.append((start, end) if start is not None and end is not None else None)
    raw_conflicts: set[int] = set()
    for index in range(1, len(before)):
        previous, current = before[index - 1], before[index]
        if previous is not None and current is not None and current[0] < previous[1]:
            raw_conflicts.update((index - 1, index))
    outliers = _local_timing_outliers(words, before)

    # Stable global endpoint-offset consensus: a minimum of three independent
    # high-score anchors, with low median absolute deviation on both edges.
    anchor_records: list[tuple[float, float, float]] = []
    if mode == "auto" and aligned is not None:
        for measured, interval in zip(aligned, before):
            score = _number(measured.get("score"))
            new_start, new_end = _number(measured.get("start")), _number(measured.get("end"))
            if interval is None or score is None or score < 0.80 or new_start is None or new_end is None:
                continue
            old_start, old_end = interval
            if not _valid_interval(interval, source_duration) or not _valid_interval((new_start, new_end), source_duration):
                continue
            if not 0.5 <= (new_end - new_start) / (old_end - old_start) <= 2.0:
                continue
            anchor_records.append(((old_start + old_end) / 2, new_start - old_start, new_end - old_end))
    anchor_deltas = [(record[1], record[2]) for record in anchor_records]
    median_start = statistics.median(d[0] for d in anchor_deltas) if anchor_deltas else None
    median_end = statistics.median(d[1] for d in anchor_deltas) if anchor_deltas else None
    mad_start = statistics.median(abs(d[0] - median_start) for d in anchor_deltas) if anchor_deltas else None
    mad_end = statistics.median(abs(d[1] - median_end) for d in anchor_deltas) if anchor_deltas else None
    stable_local_centers = 0
    for center, _, _ in anchor_records:
        local = [record for record in anchor_records if abs(record[0] - center) <= 5.0]
        if len(local) < 3:
            continue
        local_start_values = [record[1] for record in local]
        local_end_values = [record[2] for record in local]
        local_start_mad = statistics.median(abs(value - statistics.median(local_start_values)) for value in local_start_values)
        local_end_mad = statistics.median(abs(value - statistics.median(local_end_values)) for value in local_end_values)
        if max(local_start_mad, local_end_mad) <= 0.030:
            stable_local_centers += 1
    stable_group = stable_local_centers > 0

    translations, translation_groups = ({}, [])
    landmarks = waveform_landmarks or []
    if any(mark.get("kind") not in {"onset", "offset"} or _number(mark.get("time")) is None or
           not 0 <= mark["time"] <= source_duration for mark in landmarks):
        raise ValueError("Invalid source waveform landmark.")
    if mode == "auto" and aligned is not None:
        translations, translation_groups = _group_translations(words, before, aligned, selected, source_duration, rms_values, frame, landmarks)

    rows: list[dict[str, Any]] = []
    row_local_anchor_counts: dict[int, int] = {}
    for index, (word, old) in enumerate(zip(words, before)):
        original = {"start": old[0], "end": old[1]} if old else {"start": None, "end": None}
        method = "unchanged"
        reasons: list[str] = []
        status = "unchanged"
        candidate = old
        if _manual(word):
            status, method = "locked", "manual"
            reasons.append("manual-timing-locked")
        elif index not in selected:
            status, method = "locked", "scope"
            reasons.append("outside-selected-scope")
        elif old is None or not _valid_interval(old, source_duration):
            status, method = "review", "source"
            reasons.append("invalid-source-interval")
        elif mode == "offset":
            method = "explicit-offset"
            candidate = (old[0] + in_offset, old[1] + out_offset)
            reasons.append("user-specified-offset-seconds")
            if _valid_interval(candidate, source_duration):
                status = "ready"
            else:
                status = "review"
                reasons.append("offset-would-break-source-or-duration-bounds")
        elif index in translations:
            offset = translations[index]
            candidate = (old[0] + offset, old[1] + offset)
            status, method = "ready", "automatic-offset"
            reasons.append("stable-group-translation")
        elif aligned is None:
            reasons.append("local-ctc-unavailable")
        else:
            measured = aligned[index]
            new_start, new_end = _number(measured.get("start")), _number(measured.get("end"))
            score = _number(measured.get("score"))
            method = "ctc"
            if new_start is None or new_end is None or not _valid_interval((new_start, new_end), source_duration):
                status = "review"
                reasons.append("invalid-ctc-interval")
            else:
                candidate = (new_start, new_end)
                if index in raw_conflicts:
                    status = "review"
                    reasons.append("existing-source-overlap")
                if score is None or score < 0.80:
                    status = "review"
                    reasons.append("ctc-confidence-uncertain")
                else:
                    d_start, d_end = new_start - old[0], new_end - old[1]
                    duration_ratio = (new_end - new_start) / (old[1] - old[0])
                    local = [record for record in anchor_records if abs(record[0] - (old[0] + old[1]) / 2) <= 5.0]
                    row_local_anchor_counts[index] = len(local)
                    local_start = statistics.median(item[1] for item in local) if local else None
                    local_end = statistics.median(item[2] for item in local) if local else None
                    local_mad_start = statistics.median(abs(item[1] - local_start) for item in local) if local else None
                    local_mad_end = statistics.median(abs(item[2] - local_end) for item in local) if local else None
                    local_stable = len(local) >= 3 and local_mad_start is not None and local_mad_end is not None and max(local_mad_start, local_mad_end) <= 0.030
                    corroborated = local_stable and abs(d_start - local_start) <= 0.040 and abs(d_end - local_end) <= 0.040
                    if not corroborated:
                        status = "review"
                        reasons.append("ctc-offset-not-corroborated")
                    elif max(abs(d_start), abs(d_end)) > _MAX_READY_MOVE:
                        status = "review"
                        reasons.append("ctc-move-large")
                    elif not 0.5 <= duration_ratio <= 2.0:
                        status = "review"
                        reasons.append("duration-outlier")
                    elif score < 0.85:
                        status = "review"
                        reasons.append("ctc-confidence-uncertain")
                    else:
                        status = "ready"
                        reasons.append("ctc-measured-and-offset-corroborated")
        if index in outliers and status not in {"locked"}:
            reasons.append(str(outliers[index]["reason"]))
            # A common translation does not alter a questionable span. Keep the
            # span warning visible without vetoing an independently supported
            # offset correction. Span-changing refinements still need review.
            translation_only = method == "automatic-offset" or (method == "explicit-offset" and in_offset == out_offset)
            if not translation_only:
                status = "review"
        if status == "ready" and mode == "auto" and method != "automatic-offset" and rms_values is not None:
            if candidate is None or not _waveform_support(candidate, rms_values, frame):
                status = "review"
                reasons.append("waveform-activity-uncorroborated")
        if candidate is None:
            after = original.copy()
        else:
            after = {"start": candidate[0], "end": candidate[1]}
        rows.append({
            "index": index,
            "text": str(word.get("text", "")),
            "before": original,
            "after": after,
            "status": status,
            "method": method,
            "reasons": reasons,
            "score": _number(aligned[index].get("score")) if aligned is not None and mode == "auto" else None,
        })

    # Validate the candidate as a batch. Existing defects on untouched rows do
    # not veto unrelated changes; only changed intervals and edges they touch
    # can downgrade a ready row. Keep the proposed interval visible for review.
    while True:
        ready = {row["index"] for row in rows if row["status"] == "ready"}
        rejected: set[int] = set()
        for index in ready:
            interval = (rows[index]["after"]["start"], rows[index]["after"]["end"])
            if not _valid_interval(interval, source_duration):
                rejected.add(index)
        effective = []
        for row in rows:
            interval = row["after"] if row["status"] == "ready" else row["before"]
            start, end = interval["start"], interval["end"]
            if start is not None and end is not None and start < end:
                effective.append((start, end, row["index"]))
        active: list[tuple[float, int]] = []
        for start, end, index in sorted(effective):
            active = [(active_end, active_index) for active_end, active_index in active if active_end > start]
            if active:
                rejected.update(active_index for _, active_index in active if active_index in ready)
                if index in ready:
                    rejected.add(index)
            active.append((end, index))
        if not rejected:
            break
        for index in rejected:
            rows[index]["status"] = "review"
            if "whole-output-interval-conflict" not in rows[index]["reasons"]:
                rows[index]["reasons"].append("whole-output-interval-conflict")

    summary = {key: sum(row["status"] == key for row in rows) for key in ("ready", "review", "locked", "unchanged")}
    sorted_anchors = sorted(anchor_records)
    groups: list[list[tuple[float, float, float]]] = []
    for record in sorted_anchors:
        if not groups or record[0] - groups[-1][-1][0] > 10.0:
            groups.append([record])
        else:
            groups[-1].append(record)
    local_groups = []
    for group in groups:
        start_values = [record[1] for record in group]
        end_values = [record[2] for record in group]
        center_start, center_end = statistics.median(start_values), statistics.median(end_values)
        local_groups.append({
            "start_time": group[0][0],
            "end_time": group[-1][0],
            "anchor_count": len(group),
            "median_start_offset": center_start,
            "median_end_offset": center_end,
            "start_offset_mad": statistics.median(abs(value - center_start) for value in start_values),
            "end_offset_mad": statistics.median(abs(value - center_end) for value in end_values),
        })
    diagnostics = {
        "mode": mode,
        "duration": source_duration,
        "ctc_available": aligned is not None,
        "ctc_anchor_count": len(anchor_deltas),
        "ctc_offsets_stable": stable_group,
        "translation_groups": translation_groups,
        "waveform_landmarks": landmarks,
        "waveform_anchor_count": sum(g["waveform_anchor_count"] for g in translation_groups),
        "stable_local_anchor_centers": stable_local_centers,
        "median_start_offset": median_start,
        "median_end_offset": median_end,
        "start_offset_mad": mad_start,
        "end_offset_mad": mad_end,
        "waveform_frames": len(rms_values) if rms_values is not None else 0,
        "existing_overlap_word_count": len(raw_conflicts),
        "invalid_source_interval_count": sum(interval is None or not _valid_interval(interval, source_duration) for interval in before),
        "local_timing_outlier_count": len(outliers),
        "local_timing_outliers": [{"index": index, **details} for index, details in sorted(outliers.items())],
        "local_offset_group": {"anchor_count": len(anchor_deltas), "median_start_offset": median_start, "median_end_offset": median_end, "start_offset_mad": mad_start, "end_offset_mad": mad_end},
        "local_offset_groups": local_groups,
        "row_local_anchor_counts": row_local_anchor_counts,
        "frame_seconds": frame,
        "waveform_used_for_selection": rms_values is not None and mode == "auto",
    }
    return {"rows": rows, "summary": summary, "diagnostics": diagnostics}
