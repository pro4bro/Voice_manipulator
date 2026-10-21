"""Compare a heard, manually edited Script with STT without changing either.

Pair only exact normalized tokens that have the same partner in every minimum
edit-distance alignment. Timestamps never choose partners or remove outliers.
This is an approximate owner reference, not exhaustive lexical ground truth.
"""
from __future__ import annotations

import math
import statistics
import unicodedata


def token(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFC", text.casefold())
                   if unicodedata.category(c)[0] in "LN")


def lexical_pairs(source: list[str], reference: list[str]) -> list[tuple[int, int]]:
    """Return only unambiguous equal-token edges across all optimal edit paths."""
    a, b = [token(t) for t in source], [token(t) for t in reference]
    n, m = len(a), len(b)
    forward = [[0] * (m + 1) for _ in range(n + 1)]
    backward = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        forward[i][0], backward[i][m] = i, n - i
    for j in range(m + 1):
        forward[0][j], backward[n][j] = j, m - j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            forward[i][j] = min(forward[i - 1][j] + 1, forward[i][j - 1] + 1,
                                forward[i - 1][j - 1] + (a[i - 1] != b[j - 1]))
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            backward[i][j] = min(backward[i + 1][j] + 1, backward[i][j + 1] + 1,
                                 backward[i + 1][j + 1] + (a[i] != b[j]))
    distance = forward[n][m]
    partners = [set() for _ in a]
    reverse = [set() for _ in b]
    for i in range(n + 1):
        for j in range(m + 1):
            cost = forward[i][j]
            if i < n and cost + 1 + backward[i + 1][j] == distance:
                partners[i].add(None)
            if j < m and cost + 1 + backward[i][j + 1] == distance:
                reverse[j].add(None)
            if i < n and j < m and cost + (a[i] != b[j]) + backward[i + 1][j + 1] == distance:
                equal = bool(a[i]) and a[i] == b[j]
                partners[i].add(j if equal else None)
                reverse[j].add(i if equal else None)
    return [(i, j) for i, options in enumerate(partners) if len(options) == 1
            for j in options if j is not None and reverse[j] == {i}]


def bounds(word: dict, duration: float) -> tuple[float, float] | None:
    values = [word.get("start"), word.get("end")]
    if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) for v in values):
        return None
    start, end = values
    return (start, end) if 0 <= start < end <= duration else None


def describe(values: list[float]) -> dict | None:
    if not values:
        return None
    ordered = sorted(v * 1000 for v in values)
    return {"count": len(values), "mean": statistics.mean(ordered), "median": statistics.median(ordered),
            "p90": ordered[math.ceil(.90 * len(ordered)) - 1],
            "p95": ordered[math.ceil(.95 * len(ordered)) - 1], "max": ordered[-1]}


def overlaps(words: list[dict], duration: float) -> list[list[int]]:
    intervals = [(i, bounds(w, duration)) for i, w in enumerate(words)]
    valid = sorted((t[0], t[1], i) for i, t in intervals if t)
    return [[i, j] for k, (start, end, i) in enumerate(valid)
            for next_start, _, j in valid[k + 1:] if next_start < end - .0001]


def compare(reference: list[dict], candidate: list[dict], duration: float,
            *, pairs: list[tuple[int, int]] | None = None) -> dict:
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Expected positive finite source duration")
    if pairs is None:
        pairs = lexical_pairs([w["text"] for w in candidate], [w["text"] for w in reference])
    if len({i for i, _ in pairs}) != len(pairs) or len({j for _, j in pairs}) != len(pairs):
        raise ValueError("Duplicate comparison pair")
    if any(not token(candidate[i]["text"]) or token(candidate[i]["text"]) != token(reference[j]["text"])
           for i, j in pairs):
        raise ValueError("Frozen candidate token sequence changed")
    manual = {i for i, w in enumerate(reference) if w.get("timingSource") == "manual"
              and w.get("timingTrusted") is True}
    invalid_reference = sorted(i for i in manual if bounds(reference[i], duration) is None)
    invalid_candidate = [i for i, w in enumerate(candidate) if bounds(w, duration) is None]
    rows = []
    for i, j in pairs:
        src, ref = bounds(candidate[i], duration), bounds(reference[j], duration)
        if j not in manual or src is None or ref is None:
            continue
        rows.append({"candidateIndex": i, "referenceIndex": j, "text": reference[j]["text"],
                     "start": src[0] - ref[0], "end": src[1] - ref[1],
                     "duration": src[1] - src[0] - (ref[1] - ref[0]),
                     "endToReferenceStart": src[1] - ref[0]})
    matched = {r["referenceIndex"] for r in rows}
    result = {"referenceWords": len(reference), "candidateWords": len(candidate),
              "manualReferenceWords": len(manual), "matchedManualWords": len(rows),
              "coverage": len(rows) / len(manual) if manual else None,
              "unmatchedManualIndices": sorted(manual - matched),
              "nonmanualReferenceIndices": sorted(set(range(len(reference))) - manual),
              "invalidManualIndices": invalid_reference, "invalidCandidateIndices": invalid_candidate,
              "referenceOverlapPairs": overlaps(reference, duration),
              "candidateOverlapPairs": overlaps(candidate, duration),
              "lexicalPairs": pairs, "perWord": rows,
              "units": "milliseconds; signed=candidate-reference; nearest-rank percentiles",
              "referenceCaveat": "Approximate owner-heard boundaries; incomplete overlapping speech. No WER or general acceptance claim."}
    for key in ("start", "end", "duration", "endToReferenceStart"):
        result[key + "SignedMs"] = describe([r[key] for r in rows])
        result[key + "AbsMs"] = describe([abs(r[key]) for r in rows])
    result["bothWithin250Ms"] = sum(abs(r["start"]) <= .25 and abs(r["end"]) <= .25 for r in rows)
    return result
