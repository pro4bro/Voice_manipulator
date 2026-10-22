import math

import pytest

from scripts.profiling.subtitle_engine_metrics import score_alignment


def test_selection_refuses_an_incomplete_sweep_before_freezing_winners(tmp_path, monkeypatch):
    from scripts.profiling import subtitle_engine_benchmark as benchmark

    monkeypatch.setattr(benchmark, "verify", lambda folder: {"configurations": [{"id": "active-run"}]})
    (tmp_path / "runs/active-run").mkdir(parents=True)
    with pytest.raises(ValueError, match="Sweep not complete"):
        benchmark.select(tmp_path)
    assert not (tmp_path / "selection.json").exists()
    assert not (tmp_path / "scoring-code").exists()


def test_resume_refuses_to_silently_skip_an_interrupted_directory(tmp_path, monkeypatch):
    from scripts.profiling import subtitle_engine_benchmark as benchmark

    monkeypatch.setattr(benchmark, "verify", lambda folder: {
        "configurations": [{"id": "interrupted"}], "audio": {"duration": 1}})
    monkeypatch.setattr(benchmark, "read", lambda path: {"words": []})
    (tmp_path / "runs/interrupted").mkdir(parents=True)
    with pytest.raises(ValueError, match="Incomplete run"):
        benchmark.run(tmp_path)
from scripts.profiling.subtitle_engine_benchmark import add_bias, effective, fit_bias, rank


def word(text, start, end):
    return {"text": text, "start": start, "end": end}


def test_recommendation_gate_rejects_a_better_median_with_new_tail_and_conflicts():
    from copy import deepcopy
    from scripts.profiling.subtitle_engine_benchmark import qualification_failures

    baseline = score_alignment([word("a", 0, .2)], [word("a", .01, .21)], [(0, 0)])
    assert qualification_failures(deepcopy(baseline), baseline) == []
    candidate = deepcopy(baseline)
    candidate["inAbsoluteMs"]["median"] = 0
    candidate["outAbsoluteMs"]["p95"] = 1000
    candidate["severeOver500Ms"]["count"] = 1
    candidate["candidateOverlapPairs"] = [[0, 1]]
    assert set(qualification_failures(candidate, baseline)) == {
        "outAbsoluteMs-p95-increased", "severe-count-increased", "whole-output-overlaps-increased"}


def test_known_bias_reports_signed_and_absolute_errors_in_milliseconds():
    reference = [word("Alpha", 1.0, 1.4), word("two!", 2.0, 2.5), word("thrée", 3.0, 3.2)]
    candidate = [word("alpha", .95, 1.35), word("TWO", 1.95, 2.45), word("tree", 3.0, 3.2)]

    result = score_alignment(reference, candidate, [(0, 0), (1, 1)], duration=4)

    assert result["referenceCount"] == 2
    assert result["pairedWords"] == 2
    assert result["measuredWords"] == 2
    assert result["coveragePaired"] == 1
    assert result["coverageReference"] == 1
    assert result["inSignedMs"] == {"median": -50, "biasMean": -50}
    assert result["outSignedMs"] == {"median": -50, "biasMean": -50}
    assert result["inAbsoluteMs"]["mae"] == 50
    assert result["outAbsoluteMs"]["mae"] == 50
    assert result["durationAbsoluteMs"]["mae"] == 0


def test_missing_and_invalid_words_remain_in_fixed_reference_denominators():
    reference = [word("a", 0, .2), word("b", .3, .5), word("c", .6, .8)]
    candidate = [word("a", 0, .2), word("b", None, None), word("c", None, None)]

    result = score_alignment(reference, candidate, [(0, 0), (1, 1), (2, 2)], total_reference_count=5)

    assert result["pairedWords"] == 3
    assert result["measuredWords"] == 1
    assert result["missingWords"] == 4
    assert result["coveragePaired"] == pytest.approx(1 / 3)
    assert result["coverageReference"] == pytest.approx(1 / 5)
    assert result["invalidCandidateIndexes"] == [1, 2]
    assert result["bothEdgesWithin50Ms"]["pairedPercent"] == pytest.approx(100 / 3)
    assert result["bothEdgesWithin50Ms"]["referencePercent"] == 20


def test_unknown_or_text_mismatch_is_never_paired_by_nearest_timestamp():
    reference = [word("again", 0, .2), word("again", .3, .5)]
    candidate = [word("again", .31, .51), word("else", .01, .21)]

    with pytest.raises(ValueError, match="text"):
        score_alignment(reference, candidate, [(0, 1)])
    assert score_alignment(reference, candidate, [(1, 0)])["measuredWords"] == 1


def test_lexical_pairs_are_unique_and_index_validated():
    reference = [word("same", 0, .2), word("same", .3, .5)]
    candidate = [word("same", 0, .2), word("same", .3, .5)]
    with pytest.raises(ValueError, match="(?i)duplicate"):
        score_alignment(reference, candidate, [(0, 0), (0, 1)])
    with pytest.raises(ValueError, match="index"):
        score_alignment(reference, candidate, [(0, 2)])


def test_candidate_overlap_includes_valid_unpaired_words_and_excludes_touching_edges():
    reference = [word("paired", 0, .2)]
    candidate = [word("paired", 0, .2), word("extra", .199999998, .3), word("touch", .3, .4)]

    result = score_alignment(reference, candidate, [(0, 0)], duration=1)

    assert result["candidateOverlapPairs"] == [[0, 1]]


def test_invalid_reference_and_out_of_bounds_candidates_are_reported_separately():
    reference = [word("bad", -.1, .2), word("good", .2, .4)]
    candidate = [word("bad", 0, .1), word("good", .9, 1.1)]

    result = score_alignment(reference, candidate, [(0, 0), (1, 1)], duration=1)

    assert result["invalidReferenceIndexes"] == [0]
    assert result["outOfBoundsCandidateIndexes"] == [1]
    assert result["measuredWords"] == 0
    assert result["inAbsoluteMs"]["mae"] is None
    assert result["missingWords"] == 2


def test_thresholds_use_fixed_paired_and_reference_denominators():
    reference = [word("a", 0, .2), word("b", .3, .5), word("c", .6, .8)]
    candidate = [word("a", .05, .25), word("b", .4, .6), word("c", None, None)]

    result = score_alignment(reference, candidate, [(0, 0), (1, 1), (2, 2)])

    metric = result["bothEdgesWithin50Ms"]
    assert metric["count"] == 1
    assert metric["pairedPercent"] == pytest.approx(100 / 3)
    assert metric["referencePercent"] == pytest.approx(100 / 3)
    assert result["severeOver500Ms"]["count"] == 0
    assert result["severeOver500Ms"]["pairedRate"] == 0


def test_baseline_comparison_counts_shared_valid_words_and_new_severe_errors():
    reference = [word("a", 0, .2), word("b", .3, .5), word("c", .6, .8), word("d", .9, 1.1)]
    baseline = [word("a", .02, .22), word("b", .32, .52), word("c", .6, .8), word("d", .9, 1.1)]
    candidate = [word("a", 0, .2), word("b", .33, .53), word("c", 1.2, 1.4), word("d", .9, 1.1)]

    result = score_alignment(reference, candidate, [(0, 0), (1, 1), (2, 2), (3, 3)],
                             baseline_words=baseline, duration=2)

    comparison = result["baselineComparison"]
    assert comparison["sharedValidWords"] == 4
    assert comparison["improvedWords"] == 1
    assert comparison["worsenedWords"] == 2
    assert comparison["unchangedWords"] == 1
    assert comparison["introducedSevereWords"] == 1
    assert math.isfinite(comparison["meanBothBoundaryErrorCandidateMs"])


def test_inputs_are_preserved_and_nonfinite_output_is_not_emitted():
    reference = [word("a", 0, .2)]
    candidate = [word("a", .01, .21)]
    before = (reference[0].copy(), candidate[0].copy())

    result = score_alignment(reference, candidate, [(0, 0)])

    assert (reference[0], candidate[0]) == before
    assert result["durationAbsoluteMs"]["mae"] == 0
    assert all(value is None or math.isfinite(value)
               for section in (result["inSignedMs"], result["outSignedMs"],
                               result["inAbsoluteMs"], result["outAbsoluteMs"],
                               result["durationAbsoluteMs"])
               for value in section.values())


def test_bias_fit_uses_calibration_signed_errors_and_does_not_mutate_metrics():
    metrics = {"perPair": [
        {"inSignedMs": 100, "outSignedMs": 300},
        {"inSignedMs": 200, "outSignedMs": 400},
        {"inSignedMs": 300, "outSignedMs": 500},
    ]}
    original = [row.copy() for row in metrics["perPair"]]

    assert fit_bias(metrics, "none") == [0., 0.]
    assert fit_bias(metrics, "scalar") == [-.3, -.3]
    assert fit_bias(metrics, "separate") == [-.2, -.4]
    assert metrics["perPair"] == original
    with pytest.raises(ValueError, match="Unknown bias"):
        fit_bias(metrics, "per-word")


def test_bias_application_clamps_valid_edges_and_falls_back_on_inversion_without_mutation():
    words = [word("clamp", .1, .3), word("invert", .1, .3), word("missing", None, None)]
    original = [row.copy() for row in words]

    adjusted = add_bias(words, [-1., 0.], duration=1)
    inverted = add_bias(words, [.5, -.5], duration=1)
    assert adjusted[0]["start"] == 0
    assert inverted[1] == words[1]
    assert adjusted[2] == words[2]
    assert words == original


def test_effective_preview_moves_stt_seed_and_respects_engine_move_limit():
    seed = [word("hello", 1., 1.2), word("there", 1.4, 1.6)]
    seed[0]["timingSource"] = seed[1]["timingSource"] = "stt"
    aligned = [word("hello", 1.04, 1.24), word("there", 1.44, 1.64)]
    original = [row.copy() for row in seed]

    moved, _ = effective(seed, aligned, 3, "stable-ts", 200)
    limited, _ = effective(seed, [word("hello", 1.5, 1.7), word("there", 1.4, 1.6)],
                           3, "stable-ts", 100)

    assert moved[0]["start"] == pytest.approx(1.04)
    assert moved[1]["start"] == pytest.approx(1.44)
    assert limited[0]["start"] == seed[0]["start"]
    assert limited[1]["start"] == seed[1]["start"]
    assert seed == original


def test_selection_rank_is_deterministic_when_missing_count_differs():
    complete = {"measuredWords": 2, "bothEdgesWithin100Ms": {"count": 2}, "severeOver500Ms": {"count": 0},
                "inAbsoluteMs": {"mae": 80}, "outAbsoluteMs": {"mae": 90}, "missingWords": 0}
    incomplete = {**complete, "missingWords": 20}

    assert rank(complete) == rank(incomplete)
    assert rank(complete) == (-2, 0, 170)


def test_selection_rank_does_not_treat_absent_calibration_metrics_as_zero_error():
    no_measurements = {"measuredWords": 0, "bothEdgesWithin100Ms": {"count": 0}, "severeOver500Ms": {"count": 0},
                       "inAbsoluteMs": {"mae": None}, "outAbsoluteMs": {"mae": None},
                       "missingWords": 8}
    measured_outside_threshold = {"measuredWords": 2, "bothEdgesWithin100Ms": {"count": 0}, "severeOver500Ms": {"count": 0},
                                  "inAbsoluteMs": {"mae": 80}, "outAbsoluteMs": {"mae": 90},
                                  "missingWords": 2}

    assert rank(measured_outside_threshold) < rank(no_measurements)
