from app.adapters.word_timing_quality import inspect_word_timings, space_recognized_words


def test_editable_gap_preserves_raw_measurement_and_never_moves_starts():
    words = [{"text": "xin", "start": 0, "end": .3, "timingSource": "dtw"},
             {"text": "chào", "start": .3, "end": .7, "timingSource": "dtw"}]
    result = space_recognized_words(words)
    assert result[0]["end"] == .29
    assert result[0]["sourceTiming"] == {"start": 0, "end": .3, "source": "dtw"}
    assert result[1] == words[1]
    assert words[0]["end"] == .3
    assert space_recognized_words(result) == result


def test_tiny_intervals_and_real_silence_are_not_stretched():
    words = [{"text": "a", "start": 0, "end": .001}, {"text": "b", "start": .001, "end": .3},
             {"text": "c", "start": 1, "end": 2}]
    result = space_recognized_words(words)
    assert result[0]["end"] > result[0]["start"]
    assert result[0]["end"] < result[1]["start"]
    assert result[1] == words[1]


def test_interpolated_word_is_not_promoted_to_trusted_by_structural_check():
    result = inspect_word_timings([{"text": "mới", "start": 1, "end": 1.5,
                                    "timingSource": "user-interpolated", "timingTrusted": False}], 2)
    assert result.words[0]["timingTrusted"] is False
    assert result.quality == "needs-alignment"
