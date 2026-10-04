import importlib.util
from pathlib import Path

import pytest


path = Path(__file__).resolve().parents[3] / "scripts/profiling/livelink_stt_19a_score.py"
spec = importlib.util.spec_from_file_location("quality_score", path)
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)


def test_nfc_case_punctuation_normalize_but_tones_and_numbers_remain():
    assert score.normalize(" XIN, cha\u0300o! 26 ") == "xin chào 26"
    assert score.text_score("ma", "má")["cer"] == 0.5
    assert score.text_score("AI 26", "ai 26")["cer"] == 0


def test_silence_hallucination_is_not_a_zero_error_score():
    heard = score.text_score("", "Đăng ký kênh")
    assert heard["cer"] is None and heard["wer"] is None
    assert heard["silenceInsertions"] == 3


def test_micro_average_does_not_overweight_short_reference():
    result = score.score_tracks([
        {"track": 1, "reference": "a", "text": "x", "duration": 1},
        {"track": 2, "reference": "abcdefghij", "text": "abcdefghij", "duration": 1},
    ], "detailed")
    assert result["cer"] == pytest.approx(1 / 11)
    assert result["wer"] == 0.5
    assert result["textBudgetPassed"] is False
    assert result["timingAccuracyPassed"] is None


@pytest.mark.parametrize("words", [[], [{"start": 0, "end": 0}],
    [{"start": 0, "end": float("nan")}], [{"start": -1, "end": 1}],
    [{"start": 0, "end": 2}], [{"start": 0.5, "end": 0.7}, {"start": 0.2, "end": 0.4}], [{}]])
def test_missing_or_invalid_word_time_never_passes_structure(words):
    assert score.timing_structure(words, 1)["structurallyValid"] is False


def test_valid_source_times_do_not_claim_acoustic_accuracy():
    result = score.timing_structure([{"start": 0.1, "end": 0.3}], 1)
    assert result["structurallyValid"] is True
    assert result["accuracy"] == "unmeasured-without-reviewed-word-anchors"
