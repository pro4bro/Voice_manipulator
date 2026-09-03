from __future__ import annotations

from app.adapters.script_validation import fold, normalize, validate_script

CARD = "Tôi đã nhắc chuyện đó ba lần rồi."


def test_a_clean_read_matches_every_word():
    result = validate_script(CARD, "Tôi đã nhắc chuyện đó ba lần rồi")

    assert result.match_ratio == 1.0
    assert result.omissions == []
    assert result.insertions == []
    assert result.substitutions == []


def test_dropped_tone_marks_are_not_a_misread():
    """Recognisers lose dấu constantly; reporting that as a failure is noise."""
    result = validate_script(CARD, "Toi da nhac chuyen do ba lan roi")

    assert result.match_ratio == 1.0
    assert result.substitutions == []


def test_a_skipped_word_is_named_rather_than_counted():
    result = validate_script(CARD, "Tôi đã nhắc chuyện đó lần rồi")

    assert result.omissions == ["ba"]
    assert result.match_ratio < 1.0


def test_a_repeated_word_shows_as_an_insertion():
    result = validate_script(CARD, "Tôi đã đã nhắc chuyện đó ba lần rồi")

    assert result.insertions == ["đã"]
    assert result.omissions == []


def test_a_wrong_word_is_paired_with_what_replaced_it():
    result = validate_script(CARD, "Tôi đã nhắc chuyện đó hai lần rồi")

    assert result.substitutions == [("ba", "hai")]


def test_punctuation_and_case_never_count_as_differences():
    result = validate_script("Thôi, con đi đây!", "thôi con đi đây")

    assert result.match_ratio == 1.0


def test_nothing_to_compare_is_not_a_failure():
    """A take nobody has recognised yet is unverified, not wrong."""
    assert validate_script(CARD, "") is None
    assert validate_script("", "bất cứ điều gì") is None


def test_a_completely_different_read_scores_near_zero():
    result = validate_script(CARD, "hôm nay trời nắng đẹp quá")

    assert result.match_ratio < 0.2
    assert result.omissions or result.substitutions


def test_fold_removes_tone_marks_and_folds_the_vietnamese_d():
    assert fold("đặt") == "dat"
    assert fold("phẳng") == "phang"
    assert normalize("Bước hai, mở nắp.") == ["bước", "hai", "mở", "nắp"]
