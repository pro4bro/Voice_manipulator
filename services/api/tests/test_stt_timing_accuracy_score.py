import importlib.util
from pathlib import Path

import pytest


path = Path(__file__).resolve().parents[3] / "scripts/profiling/stt_timing_accuracy_score.py"
spec = importlib.util.spec_from_file_location("timing_score", path)
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)


def fixture():
    protocol = {
        "cases": [{"id": "one", "startSeconds": 10, "duration": 5}],
        "targets": [{"id": "one-000", "case": "one", "text": "xin"},
                    {"id": "one-001", "case": "one", "text": "chào"}],
        "budgets": {"humanWordP95Seconds": .25},
    }
    review = {"protocolSha256": "frozen", "reviewer": "Owner",
              "independentlyHeard": True, "anchors": [
                  {"id": "one-000", "status": "heard", "text": "xin", "start": 10.1, "end": 10.3},
                  {"id": "one-001", "status": "heard", "text": "chào", "start": 11, "end": 11.3}]}
    variants = {"native": {"one": [
        {"id": "one-000", "text": "xin", "start": 10.2, "end": 10.4},
        {"id": "one-001", "text": "chào", "start": 11.1, "end": 11.7}]}}
    return protocol, review, variants


def test_end_tail_failure_cannot_be_hidden_by_good_starts():
    protocol, review, variants = fixture()
    result = score.evaluate(protocol, "frozen", review, variants)
    row = result["variants"]["native"]
    assert row["startError"]["p95"] == pytest.approx(.1)
    assert row["endError"]["p95"] == pytest.approx(.4)
    assert row["timingBudgetPassed"] is False


def test_complete_bound_independent_review_can_pass_both_endpoint_budgets():
    protocol, review, variants = fixture()
    variants["native"]["one"][1]["end"] = 11.4
    result = score.evaluate(protocol, "frozen", review, variants)
    assert result["reviewComplete"] is True
    assert result["variants"]["native"]["timingBudgetPassed"] is True


def test_not_spoken_word_is_reported_instead_of_excluded_to_pass():
    protocol, review, variants = fixture()
    review["anchors"][1]["status"] = "not-spoken"
    result = score.evaluate(protocol, "frozen", review, variants)
    assert result["notSpokenIds"] == ["one-001"]
    assert result["variants"]["native"]["matchedAnchors"] == 1
    assert result["variants"]["native"]["timingBudgetPassed"] is False


def test_pending_review_has_no_zero_error_or_pass():
    protocol, review, variants = fixture()
    review["independentlyHeard"] = False
    review["reviewer"] = None
    review["anchors"] = []
    result = score.evaluate(protocol, "frozen", review, variants)
    assert result["unreviewedTargets"] == 2
    assert result["variants"]["native"]["startError"] is None
    assert result["variants"]["native"]["timingBudgetPassed"] is None


@pytest.mark.parametrize("change", ["hash", "reviewer", "independent", "duplicate", "nonfinite", "outside"])
def test_invalid_or_unbound_ground_truth_is_rejected(change):
    protocol, review, variants = fixture()
    if change == "hash": review["protocolSha256"] = "other"
    if change == "reviewer": review["reviewer"] = None
    if change == "independent": review["independentlyHeard"] = False
    if change == "duplicate": review["anchors"].append(dict(review["anchors"][0]))
    if change == "nonfinite": review["anchors"][0]["start"] = float("nan")
    if change == "outside": review["anchors"][0]["end"] = 16
    with pytest.raises(ValueError):
        score.evaluate(protocol, "frozen", review, variants)


def test_omission_is_reported_and_does_not_shift_repeated_words():
    protocol, review, variants = fixture()
    variants["aligned"] = {"one": [variants["native"]["one"][1]]}
    result = score.evaluate(protocol, "frozen", review, variants)
    aligned = result["variants"]["aligned"]
    assert aligned["matchedAnchors"] == 1
    assert aligned["unmatchedAnchorIds"] == ["one-000"]
    assert aligned["timingBudgetPassed"] is False
    assert result["pairedAnchorIds"] == ["one-001"]


def test_unmapped_outputs_remain_unmatched_instead_of_positional_pairing():
    protocol, review, variants = fixture()
    variants["aligned"] = {"one": [{"id": None, "text": "xin", "start": 10.1, "end": 10.3},
                                      {"id": None, "text": "chào", "start": 11, "end": 11.3}]}
    result = score.evaluate(protocol, "frozen", review, variants)
    row = result["variants"]["aligned"]
    assert row["matchedAnchors"] == 0
    assert row["unassignedModelWords"] == 2
    assert row["unmatchedAnchorIds"] == ["one-000", "one-001"]
    assert row["timingBudgetPassed"] is False


def test_partial_review_retains_errors_but_cannot_select_a_winner():
    protocol, review, variants = fixture()
    review["anchors"] = review["anchors"][:1]
    result = score.evaluate(protocol, "frozen", review, variants)
    assert result["variants"]["native"]["matchedAnchors"] == 1
    assert result["variants"]["native"]["timingBudgetPassed"] is None


def test_corrected_lexical_identity_is_not_timed_as_the_wrong_word():
    protocol, review, variants = fixture()
    review["anchors"][0]["text"] = "xinh"
    result = score.evaluate(protocol, "frozen", review, variants)
    assert result["lexicalMismatchIds"] == ["one-000"]
    assert result["variants"]["native"]["unmatchedAnchorIds"] == ["one-000"]


def test_finite_reversed_candidate_interval_cannot_pass():
    protocol, review, variants = fixture()
    variants["native"]["one"][0]["end"] = 10
    result = score.evaluate(protocol, "frozen", review, variants)
    assert result["variants"]["native"]["unmatchedAnchorIds"] == ["one-000"]
