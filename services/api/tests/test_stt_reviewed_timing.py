import importlib.util
import json
from pathlib import Path
import sys

import pytest


path = Path(__file__).resolve().parents[3] / "scripts/profiling/stt_reviewed_timing.py"
spec = importlib.util.spec_from_file_location("reviewed_timing", path)
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)


def word(text, start, end, source="manual", trusted=True):
    return dict(text=text, start=start, end=end, timingSource=source, timingTrusted=trusted)


def test_inserted_word_does_not_shift_subsequent_pairing():
    pairs = score.lexical_pairs(["xin", "chào"], ["xin", "các", "chào"])
    assert pairs == [(0, 0), (1, 2)]


def test_ambiguous_repetition_cannot_choose_the_most_favourable_timing():
    assert score.lexical_pairs(["anh"], ["anh", "anh"]) == []
    assert score.lexical_pairs(["anh", "anh"], ["anh"]) == []
    assert score.lexical_pairs(["xin", "anh", "anh", "chào"], ["xin", "anh", "chào"]) == [(0, 0), (3, 2)]


def test_vietnamese_normalization_keeps_diacritics_and_numbers():
    assert score.token("Chào,") == score.token("cha\u0300o")
    assert score.token("má") != score.token("ma")
    assert score.token("2026.") == "2026"


def test_both_endpoints_and_duration_are_measured_without_constant_offset():
    reference = [word("xin", 1.2, 1.4), word("chào", 2.4, 2.6)]
    result = score.compare(reference, [word("xin", 1, 1.2), word("chào", 2, 2.4)], 3)
    assert result["matchedManualWords"] == 2
    assert result["startSignedMs"]["median"] == pytest.approx(-300)
    assert result["endSignedMs"]["median"] == pytest.approx(-200)
    assert result["durationSignedMs"]["median"] == pytest.approx(100)
    assert result["endToReferenceStartAbsMs"]["median"] == pytest.approx(0)
    assert result["endAbsMs"]["p95"] == pytest.approx(200)


def test_nonmanual_estimates_and_missing_words_stay_visible():
    reference = [word("xin", 1, 1.1), word("mới", 1.2, 1.3),
                 word("chào", 1.4, 1.5, "user-interpolated", False)]
    result = score.compare(reference, [word("xin", 1, 1.1), word("chào", 1.4, 1.5)], 2)
    assert result["manualReferenceWords"] == 2
    assert result["matchedManualWords"] == 1
    assert result["unmatchedManualIndices"] == [1]
    assert result["nonmanualReferenceIndices"] == [2]
    assert result["coverage"] == .5


@pytest.mark.parametrize("start,end", [(1, 1), (2, 1), (True, 2), (float("nan"), 2), (1, 4)])
def test_invalid_candidate_is_not_repaired_or_scored(start, end):
    result = score.compare([word("xin", 1, 2)], [word("xin", start, end)], 3)
    assert result["matchedManualWords"] == 0
    assert result["invalidCandidateIndices"] == [0]
    assert result["startAbsMs"] is None


def test_far_pair_is_reported_without_timing_based_filtering():
    result = score.compare([word("xin", 10, 10.1)], [word("xin", 0, .1)], 11)
    assert result["matchedManualWords"] == 1
    assert result["startAbsMs"]["max"] == pytest.approx(10000)


def test_overlaps_and_invalid_reference_are_counted():
    result = score.compare([word("xin", 1, 1.3), word("chào", 1.2, 1.4), word("ơi", 2, 2)],
                           [word("xin", 1, 1.3), word("chào", 1.2, 1.4), word("ơi", 2, 2.1)], 3)
    assert result["invalidManualIndices"] == [2]
    assert result["referenceOverlapPairs"] == [[0, 1]]
    assert result["candidateOverlapPairs"] == [[0, 1]]


def test_frozen_pair_comparison_cannot_remap_a_changed_candidate():
    with pytest.raises(ValueError, match="sequence"):
        score.compare([word("xin", 1, 2)], [word("khác", 1, 2)], 3, pairs=[(0, 0)])


@pytest.fixture
def probe(monkeypatch):
    monkeypatch.syspath_prepend(str(path.parent))
    spec = importlib.util.spec_from_file_location("conviction_probe", path.with_name("stt_conviction_timing_probe.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_raw_aligner_numpy_indexes_are_serializable_and_evidence_is_immutable(probe, tmp_path):
    import numpy as np
    target = tmp_path / "candidate.json"
    probe.save(target, {"wordIndex": np.int64(2), "score": np.float32(.5)})
    assert json.loads(target.read_text(encoding="utf-8")) == {"wordIndex": 2, "score": .5}
    frozen = target.read_bytes()
    with pytest.raises(FileExistsError):
        probe.save(target, {"replacement": True})
    assert target.read_bytes() == frozen


def test_probe_rejects_project_output_before_loading_models(probe, monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "argv", ["probe", str(tmp_path)])
    monkeypatch.setattr(probe, "configure_offline_cpu", lambda: pytest.fail("Unexpected model configuration"))
    with pytest.raises(ValueError, match="scratch"):
        probe.main()


def test_current_scoring_rejects_tampered_frozen_inputs_before_writing(monkeypatch, tmp_path):
    monkeypatch.syspath_prepend(str(path.parent))
    spec = importlib.util.spec_from_file_location("current_probe", path.with_name("stt_conviction_current_probe.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "ROOT", tmp_path)
    run = tmp_path / ".scratch/run"
    run.mkdir(parents=True)
    (run / "reviewed.json").write_text("changed", encoding="utf-8")
    (run / "inputs.json").write_text(json.dumps({"inputs": {"source": {
        "copy": "reviewed.json", "sha256": "frozen-original-hash"}}}), encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["probe", str(run), str(run.with_name("output")), "--score"])
    monkeypatch.setattr(module, "score_run", lambda *args: pytest.fail("Scoring began before input verification"))
    with pytest.raises(ValueError, match="Frozen input"):
        module.main()
