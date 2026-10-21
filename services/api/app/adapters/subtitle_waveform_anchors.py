"""Find scale-stable corners in the same PCM peak vectors used by Timeline.

These are acoustic landmarks, not recognized words. Pixel angle and UI zoom
never enter the calculation; token identity must come from the transcript/CTC.
"""
from __future__ import annotations

import numpy as np


def vector_landmarks(points, start, end):
    if len(points) < 80 or end <= start:
        return []
    amplitude = np.array([max(abs(p["min"]), abs(p["max"])) for p in points], dtype=float)
    if not np.isfinite(amplitude).all():
        raise ValueError("Waveform peaks must be finite.")
    peak = float(amplitude.max())
    if peak < .004:
        return []
    step = (end - start) / len(points)
    prefix = np.concatenate(([0.0], np.cumsum(amplitude)))
    slopes = []
    positions = np.arange(len(points))
    for seconds in (.010, .020, .040):
        width = max(1, round(seconds / step))
        left, right = np.maximum(0, positions - width), np.minimum(len(points), positions + width)
        past = (prefix[positions] - prefix[left]) / np.maximum(1, positions - left)
        future = (prefix[right] - prefix[positions]) / np.maximum(1, right - positions)
        difference = future - past
        contrast = difference / np.maximum(np.maximum(past, future), peak * .02)
        slopes.append((difference, contrast))
    candidates = []
    radius = max(1, round(.020 / step))
    boundary = max(1, round(.040 / step))
    for sign, kind in ((1, "onset"), (-1, "offset")):
        differences, contrasts = slopes[0]
        for pos in range(boundary, len(points) - boundary):
            if contrasts[pos] * sign < .6 or differences[pos] * sign < peak * .02:
                continue
            low, high = max(boundary, pos - radius), min(len(points) - boundary, pos + radius + 1)
            if pos != low + int(np.argmax(sign * differences[low:high])):
                continue
            matched = [low + int(np.argmax(sign * diff[low:high])) for diff, _ in slopes]
            strength = min(float(contrast[p] * sign) for (_, contrast), p in zip(slopes, matched))
            if max(matched) - min(matched) > radius or strength < .6:
                continue
            candidates.append({"time": round(start + float(np.median(matched)) * step, 6),
                               "kind": kind, "strength": round(strength, 4),
                               "spreadMs": round((max(matched) - min(matched)) * step * 1000, 3)})
    # Stable strongest events win within 40ms, without inventing an event in quiet audio.
    chosen = []
    for candidate in sorted(candidates, key=lambda row: row["strength"], reverse=True):
        if all(abs(candidate["time"] - old["time"]) >= .040 for old in chosen):
            chosen.append(candidate)
    return sorted(chosen, key=lambda row: row["time"])


def pcm_vector_landmarks(reader, audio, cache_path, duration):
    landmarks = []
    cursor = 0.0
    while cursor < duration:
        lower, upper = max(0, cursor - .08), min(duration, cursor + 8.08)
        detail = reader.read_detail(audio, cache_path, lower, upper, round((upper - lower) * 1000))
        for landmark in vector_landmarks(detail["points"], detail["start"], detail["end"]):
            if cursor <= landmark["time"] < min(duration, cursor + 8):
                landmarks.append(landmark)
        cursor += 8
    return landmarks
