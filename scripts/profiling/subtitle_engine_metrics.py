"""Score subtitle-engine boundaries against an explicitly paired reference.

Pairing is supplied by the caller; this module never matches by timestamps or
chooses among repeated words. All reported timing errors are milliseconds.
"""
from __future__ import annotations

import math
import statistics
import unicodedata


def _token(text: str) -> str:
    normalized = unicodedata.normalize("NFC", text.casefold())
    return "".join(char for char in normalized if unicodedata.category(char)[0] in "LN")


def _valid_bounds(word: dict, duration: float | None) -> tuple[float, float] | None:
    if not isinstance(word, dict):
        return None
    start, end = word.get("start"), word.get("end")
    if (not isinstance(start, (int, float)) or isinstance(start, bool)
            or not isinstance(end, (int, float)) or isinstance(end, bool)):
        return None
    start, end = float(start), float(end)
    if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
        return None
    if duration is not None and end > duration:
        return None
    return start, end


def _absolute_distribution(values: list[float], include_p90: bool = True) -> dict:
    if not values:
        return {key: None for key in (("mae", "median", "p90", "p95") if include_p90 else ("mae", "median", "p95"))}
    ordered = sorted(abs(value) for value in values)
    result = {"mae": statistics.mean(ordered), "median": statistics.median(ordered),
              "p95": ordered[math.ceil(.95 * len(ordered)) - 1]}
    if include_p90:
        result["p90"] = ordered[math.ceil(.90 * len(ordered)) - 1]
    return result


def _signed_distribution(values: list[float]) -> dict:
    if not values:
        return {"median": None, "biasMean": None}
    return {"median": statistics.median(values), "biasMean": statistics.mean(values)}


def _validate_pairs(reference_words: list[dict], candidate_words: list[dict], pairs: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not isinstance(pairs, list):
        raise ValueError("pairs must be a list of index pairs")
    validated = []
    reference_indexes, candidate_indexes = set(), set()
    for pair in pairs:
        if not isinstance(pair, (tuple, list)) or len(pair) != 2:
            raise ValueError("Each pair must contain a reference and candidate index")
        reference_index, candidate_index = pair
        if (type(reference_index) is not int or type(candidate_index) is not int
                or not 0 <= reference_index < len(reference_words)
                or not 0 <= candidate_index < len(candidate_words)):
            raise ValueError("Pair index is invalid")
        if reference_index in reference_indexes or candidate_index in candidate_indexes:
            raise ValueError("Duplicate pair index")
        reference_indexes.add(reference_index)
        candidate_indexes.add(candidate_index)
        reference_text = reference_words[reference_index].get("text")
        candidate_text = candidate_words[candidate_index].get("text")
        if (not isinstance(reference_text, str) or not isinstance(candidate_text, str)
                or not _token(reference_text) or _token(reference_text) != _token(candidate_text)):
            raise ValueError("Paired word text does not match")
        validated.append((reference_index, candidate_index))
    return validated


def _overlaps(words: list[dict], duration: float | None, tolerance: float = 1e-9) -> list[list[int]]:
    intervals = sorted((bounds[0], bounds[1], index)
                       for index, word in enumerate(words)
                       if (bounds := _valid_bounds(word, duration)) is not None)
    pairs = []
    active: list[tuple[float, int]] = []
    for start, end, index in intervals:
        active = [(other_end, other_index) for other_end, other_index in active
                  if other_end > start + tolerance]
        pairs.extend([other_index, index] for _, other_index in active)
        active.append((end, index))
    return sorted(pairs)


def score_alignment(reference_words: list[dict], candidate_words: list[dict], pairs: list[tuple[int, int]], *,
                    total_reference_count: int | None = None, duration: float | None = None,
                    baseline_words: list[dict] | None = None) -> dict:
    """Score explicitly paired measured boundaries without changing inputs.

    `coveragePaired` and threshold `pairedPercent` use every supplied pair as
    their denominator. `coverageReference` and `referencePercent` use the fixed
    eligible-reference denominator. Missing, invalid, and unpaired words count
    against coverage; invalid reference rows are reported and never scored.
    Percentiles use nearest rank. Overlaps scan all valid candidate words,
    including words absent from the pairing table.
    """
    if not isinstance(reference_words, list) or not isinstance(candidate_words, list):
        raise ValueError("Reference and candidate words must be lists")
    if duration is not None:
        if (not isinstance(duration, (int, float)) or isinstance(duration, bool)
                or not math.isfinite(float(duration)) or float(duration) <= 0):
            raise ValueError("duration must be a positive finite number")
        duration = float(duration)
    paired = _validate_pairs(reference_words, candidate_words, pairs)
    if total_reference_count is None:
        total_reference_count = len(paired)
    if (type(total_reference_count) is not int or total_reference_count < len(paired)):
        raise ValueError("total_reference_count must be an integer at least as large as pairs")
    if baseline_words is not None:
        if not isinstance(baseline_words, list) or len(baseline_words) != len(candidate_words):
            raise ValueError("baseline_words must have the same count and order as candidate_words")
        if any(not isinstance(current, dict) or not isinstance(baseline, dict)
               or not isinstance(current.get("text"), str) or not isinstance(baseline.get("text"), str)
               or _token(current["text"]) != _token(baseline["text"])
               for current, baseline in zip(candidate_words, baseline_words)):
            raise ValueError("baseline_words text order does not match candidate_words")

    invalid_reference = [index for index, word in enumerate(reference_words)
                         if _valid_bounds(word, duration) is None]
    invalid_candidate, out_of_bounds_candidate = [], []
    candidate_bounds = []
    for index, word in enumerate(candidate_words):
        any_duration_bounds = _valid_bounds(word, None)
        bounded = _valid_bounds(word, duration)
        candidate_bounds.append(bounded)
        if any_duration_bounds is None:
            invalid_candidate.append(index)
        elif duration is not None and bounded is None:
            out_of_bounds_candidate.append(index)

    rows = []
    for reference_index, candidate_index in paired:
        ref = _valid_bounds(reference_words[reference_index], duration)
        cand = candidate_bounds[candidate_index]
        if ref is None or cand is None:
            continue
        in_error = round((cand[0] - ref[0]) * 1000, 9)
        out_error = round((cand[1] - ref[1]) * 1000, 9)
        duration_error = round(abs((cand[1] - cand[0]) - (ref[1] - ref[0])) * 1000, 9)
        rows.append({"referenceIndex": reference_index, "candidateIndex": candidate_index,
                     "inSignedMs": in_error, "outSignedMs": out_error,
                     "durationAbsoluteMs": duration_error})

    measured = len(rows)
    paired_count, reference_count = len(paired), total_reference_count
    in_values = [row["inSignedMs"] for row in rows]
    out_values = [row["outSignedMs"] for row in rows]
    duration_values = [row["durationAbsoluteMs"] for row in rows]

    def within(threshold_ms: float) -> dict:
        count = sum(abs(row["inSignedMs"]) <= threshold_ms and abs(row["outSignedMs"]) <= threshold_ms
                    for row in rows)
        return {"count": count,
                "pairedPercent": count / paired_count * 100 if paired_count else None,
                "referencePercent": count / reference_count * 100 if reference_count else None}

    severe = sum(max(abs(row["inSignedMs"]), abs(row["outSignedMs"])) > 500 for row in rows)
    result = {"units": "milliseconds", "percentileMethod": "nearest-rank",
              "referenceCount": reference_count, "pairedWords": paired_count,
              "measuredWords": measured, "missingWords": reference_count - measured,
              "coveragePaired": measured / paired_count if paired_count else None,
              "coverageReference": measured / reference_count if reference_count else None,
              "invalidReferenceWords": len(invalid_reference), "invalidReferenceIndexes": invalid_reference,
              "invalidCandidateWords": len(invalid_candidate), "invalidCandidateIndexes": invalid_candidate,
              "outOfBoundsCandidateWords": len(out_of_bounds_candidate),
              "outOfBoundsCandidateIndexes": out_of_bounds_candidate,
              "inSignedMs": _signed_distribution(in_values),
              "outSignedMs": _signed_distribution(out_values),
              "inAbsoluteMs": _absolute_distribution(in_values),
              "outAbsoluteMs": _absolute_distribution(out_values),
              "durationAbsoluteMs": _absolute_distribution(duration_values, include_p90=False),
              "bothEdgesWithin50Ms": within(50), "bothEdgesWithin100Ms": within(100),
              "bothEdgesWithin200Ms": within(200),
              "severeOver500Ms": {"count": severe,
                                   "pairedRate": severe / paired_count if paired_count else None,
                                   "referenceRate": severe / reference_count if reference_count else None},
              "candidateOverlapPairs": _overlaps(candidate_words, duration),
              "perPair": rows, "baselineComparison": None}

    if baseline_words is not None:
        shared = []
        for reference_index, candidate_index in paired:
            ref = _valid_bounds(reference_words[reference_index], duration)
            cand = candidate_bounds[candidate_index]
            base = _valid_bounds(baseline_words[candidate_index], duration)
            if ref is None or cand is None or base is None:
                continue
            candidate_error = (abs(cand[0] - ref[0]) + abs(cand[1] - ref[1])) * 500
            baseline_error = (abs(base[0] - ref[0]) + abs(base[1] - ref[1])) * 500
            shared.append((candidate_error, baseline_error,
                           max(abs(cand[0] - ref[0]), abs(cand[1] - ref[1])) * 1000,
                           max(abs(base[0] - ref[0]), abs(base[1] - ref[1])) * 1000))
        improved = sum(candidate_error < baseline_error - 1 for candidate_error, baseline_error, _, _ in shared)
        worsened = sum(candidate_error > baseline_error + 1 for candidate_error, baseline_error, _, _ in shared)
        introduced_severe = sum(candidate_max > 500 and baseline_max <= 500
                                for _, _, candidate_max, baseline_max in shared)
        result["baselineComparison"] = {
            "sharedValidWords": len(shared),
            "meanBothBoundaryErrorCandidateMs": statistics.mean(row[0] for row in shared) if shared else None,
            "meanBothBoundaryErrorBaselineMs": statistics.mean(row[1] for row in shared) if shared else None,
            "improvedWords": improved, "worsenedWords": worsened,
            "unchangedWords": len(shared) - improved - worsened,
            "introducedSevereWords": introduced_severe,
        }
    return result
