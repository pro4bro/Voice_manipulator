import math

import pytest

from app.domain.script_word_alignment import align_script_words


def test_split_and_substituted_recognition_never_promote_estimates_to_measured():
    words, quality = align_script_words("xin chào anh", [
        {"text": "xin chào", "start": .1, "end": .6},
        {"text": "em", "start": .7, "end": .9},
    ], 1)
    assert not any(word["timingTrusted"] for word in words)
    assert quality == "needs-alignment"


@pytest.mark.parametrize("interval", [(-.1, .3), (.1, 1.1), (.1, math.inf), (math.nan, .3)])
def test_invalid_recognition_does_not_become_trusted_after_clamping(interval):
    words, _ = align_script_words("xin", [{"text": "xin", "start": interval[0], "end": interval[1]}], 1)
    assert not words[0]["timingTrusted"]
    assert 0 <= words[0]["start"] <= words[0]["end"] <= 1


def test_explicit_untrusted_and_overlapping_recognizer_words_stay_untrusted():
    words, _ = align_script_words("xin chào", [
        {"text": "xin", "start": .1, "end": .4, "timingTrusted": False},
        {"text": "chào", "start": .3, "end": .5},
    ], 1)
    assert not any(word["timingTrusted"] for word in words)


def test_short_valid_measured_word_and_processor_provenance_are_preserved():
    words, _ = align_script_words("xin", [{"text": "xin", "start": .1, "end": .11,
        "timingSource": "faster-whisper-dtw+silero-edge", "timingTrusted": True}], 1)
    assert words[0]["timingTrusted"] is True
    assert words[0]["timingSource"] == "faster-whisper-dtw+silero-edge"
    assert (words[0]["start"], words[0]["end"]) == (.1, .11)


def test_short_audio_never_spills_proportional_words_past_pcm():
    words, _ = align_script_words("one two three", [], .01)
    assert all(0 <= word["start"] <= word["end"] <= .01 for word in words)
