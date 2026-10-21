"""Read-only timing discrepancy evidence. CTC scores are not accuracy guarantees."""
import math
import statistics


def _interval(row, duration):
    start, end = row.get("start"), row.get("end")
    if not all(type(v) in (int, float) and math.isfinite(v) for v in (start, end)):
        return None
    return (start, end) if 0 <= start < end <= duration and end - start >= .025 else None


def inspect_drift(words, aligned, duration, indexes, rms=None, frame=.01, landmarks=None):
    suspects, starts, ends = [], [], []
    compared, quiet, invalid, large, severe = 0, 0, 0, 0, 0
    threshold = max(.0001, max(rms or [0]) * .01)
    for index in indexes:
        word = words[index]
        old = _interval(word, duration)
        flags = []
        candidate = aligned[index] if aligned is not None else {}
        measured = _interval(candidate, duration)
        score = candidate.get("score")
        qualified = measured is not None and type(score) in (int, float) and math.isfinite(score) and score >= .8
        delta_start = delta_end = None
        if old is None:
            invalid += 1
            flags.append("invalid-source")
        else:
            if rms is not None:
                samples = rms[max(0, int(old[0] / frame)):min(len(rms), math.ceil(old[1] / frame))]
                if samples and max(samples) <= threshold:
                    quiet += 1
                    flags.append("quiet-source")
            if qualified:
                delta_start, delta_end = measured[0] - old[0], measured[1] - old[1]
                starts.append(delta_start * 1000)
                ends.append(delta_end * 1000)
                compared += 1
                movement = max(abs(delta_start), abs(delta_end))
                if movement >= .250 - 1e-9:
                    large += 1
                    flags.append("large-displacement")
                if movement >= .500 - 1e-9:
                    severe += 1
                    flags.append("severe-displacement")
        if flags:
            support = bool(measured and any(mark["kind"] == kind and abs(mark["time"] - bound) <= .030
                for kind, bound in zip(("onset", "offset"), measured) for mark in (landmarks or [])))
            suspects.append({"index": index, "text": str(word.get("text", "")),
                "start": old[0] if old else None, "end": old[1] if old else None,
                "ctcStart": measured[0] if measured else None, "ctcEnd": measured[1] if measured else None,
                "startOffsetMs": delta_start * 1000 if delta_start is not None else None,
                "endOffsetMs": delta_end * 1000 if delta_end is not None else None,
                "flags": flags, "waveformSupport": support})
    coverage = compared / len(indexes) if indexes else 0
    status = "large-drift" if large else "possible-drift" if quiet or invalid else "no-large-drift-found" if compared >= 3 and coverage >= .6 else "insufficient-evidence"
    # Quiet PCM alone does not locate speech; it cannot replace absent phonetic evidence.
    if not compared:
        status = "insufficient-evidence"
    return {"status": status, "scopeWords": len(indexes), "comparedWords": compared,
        "evidenceCoverage": coverage, "unassessedCount": len(indexes) - compared,
        "largeCount": large, "severeCount": severe, "quietCount": quiet, "invalidCount": invalid,
        "largeThresholdMs": 250, "severeThresholdMs": 500,
        "medianStartOffsetMs": statistics.median(starts) if starts else None,
        "medianEndOffsetMs": statistics.median(ends) if ends else None, "suspects": suspects}
