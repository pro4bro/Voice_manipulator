from app.adapters.word_timing_quality import inspect_word_timings, reconcile_word_timing_quality


def test_keeps_plausible_source_word_boundaries_without_redistributing_them():
    result = inspect_word_timings(
        [
            {"text": "Nói", "start": 0.125, "end": 0.205},
            {"text": "nhanh", "start": 0.205, "end": 0.372},
            {"text": "hơn", "start": 0.372, "end": 0.640},
        ],
        2.0,
    )

    assert result.quality == "source"
    assert result.note is None
    assert [(word["start"], word["end"]) for word in result.words] == [
        (0.125, 0.205), (0.205, 0.372), (0.372, 0.64)
    ]
    assert [word["timingTrusted"] for word in result.words] == [True, True, True]


def test_flags_squeezed_and_overlong_sidecar_timestamps_for_alignment():
    result = inspect_word_timings(
        [{"text": "Hãy", "start": 0, "end": 9.9}]
        + [
            {"text": f"từ-{index}", "start": 10 + index * 0.01, "end": 10 + (index + 1) * 0.01}
            for index in range(12)
        ],
        30.0,
    )

    assert result.quality == "needs-alignment"
    assert result.note is not None
    assert "kéo dài" in result.note
    assert "ngắn" in result.note
    assert result.words[0]["end"] == 9.9
    assert all(word["timingTrusted"] is False for word in result.words)


def test_keeps_invalid_word_dicts_and_marks_them_untrusted_without_inventing_an_interval():
    result = inspect_word_timings(
        [{"text": "Thiếu", "start": 0.2}, {"text": "Hợp lệ", "start": 0.4, "end": 0.7}],
        1.0,
    )

    assert result.quality == "needs-alignment"
    assert [word["text"] for word in result.words] == ["Thiếu", "Hợp lệ"]
    assert [word["timingTrusted"] for word in result.words] == [False, True]


def test_never_promotes_provisional_timing_just_because_it_is_structurally_plausible():
    result = reconcile_word_timing_quality(
        "needs-alignment",
        "Aligner thất bại; đây là timing tạm.",
        [{"text": "Xin", "start": 0.0, "end": 0.3}, {"text": "chào", "start": 0.3, "end": 0.7}],
        1.0,
    )

    assert result.quality == "needs-alignment"
    assert result.note == "Aligner thất bại; đây là timing tạm."
    assert all(word["timingTrusted"] is False for word in result.words)


def test_never_promotes_legacy_unverified_timing_without_processor_provenance():
    result = reconcile_word_timing_quality(
        "unverified",
        None,
        [{"text": "Cũ", "start": 0.1, "end": 0.4}],
        1.0,
    )

    assert result.quality == "unverified"
    assert result.words[0]["timingTrusted"] is False


def test_downgrades_legacy_source_label_when_words_do_not_name_a_timing_processor():
    result = reconcile_word_timing_quality(
        "source",
        None,
        [{"text": "Cũ", "start": 0.1, "end": 0.4}],
        1.0,
    )

    assert result.quality == "needs-alignment"
    assert "không ghi nguồn timing" in result.note
    assert result.words[0]["timingTrusted"] is False


def _words_with_one_tiny(total: int) -> list[dict]:
    words = [
        {"text": f"từ-{index}", "start": index * 0.1, "end": index * 0.1 + 0.08}
        for index in range(total - 1)
    ]
    words.append(
        {
            "text": "ngắn",
            "start": (total - 1) * 0.1,
            "end": (total - 1) * 0.1 + 0.01,
        }
    )
    return words


def test_classifies_less_than_five_percent_untrusted_words_as_partial():
    result = inspect_word_timings(_words_with_one_tiny(21), 3.0)

    assert result.quality == "partial"
    assert sum(word["timingTrusted"] is False for word in result.words) == 1


def test_classifies_exactly_five_percent_untrusted_words_as_needs_alignment():
    result = inspect_word_timings(_words_with_one_tiny(20), 3.0)

    assert result.quality == "needs-alignment"
    assert sum(word["timingTrusted"] is False for word in result.words) == 1


def test_marks_each_structurally_bad_interval_without_hiding_valid_neighbors():
    result = inspect_word_timings(
        [
            {"text": "đúng", "start": 0.0, "end": 0.1},
            {"text": "ngược", "start": 0.2, "end": 0.2},
            {"text": "ngoài", "start": -0.1, "end": 0.05},
            {"text": "chồng", "start": 0.095, "end": 0.2},
            {"text": "ngắn", "start": 0.3, "end": 0.32},
            {"text": "dài", "start": 0.5, "end": 9.0},
        ],
        10.0,
    )

    assert [word["timingTrusted"] for word in result.words] == [
        True,
        False,
        False,
        False,
        False,
        False,
    ]
