from __future__ import annotations

from app.adapters.sequential_diarization_queue import assign_spans_to_words


def test_assigns_stable_diarization_labels_by_word_overlap_without_replacing_profile() -> None:
    words = [
        {"text": "Xin", "start": 0.1, "end": 0.4, "speakerId": "profile-lan"},
        {"text": "chào", "start": 0.4, "end": 0.8},
        {"text": "bạn", "start": 1.1, "end": 1.6},
    ]
    spans = [
        {"speaker": "SPEAKER_01", "start": 1.0, "end": 2.0},
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 0.9},
    ]

    assigned = assign_spans_to_words(words, spans)

    assert [word["diarizationSpeakerId"] for word in assigned] == ["speaker-1", "speaker-1", "speaker-2"]
    assert assigned[0]["speakerId"] == "profile-lan"


def test_word_on_span_boundary_uses_midpoint_and_keeps_unmatched_words() -> None:
    words = [{"text": "Một", "start": 2.0, "end": 2.2}, {"text": "ngoài", "start": 3.0, "end": 3.1}]
    assigned = assign_spans_to_words(words, [{"speaker": "A", "start": 1.5, "end": 2.1}])

    assert assigned[0]["diarizationSpeakerId"] == "speaker-1"
    assert "diarizationSpeakerId" not in assigned[1]

def test_smooths_an_isolated_short_speaker_flip_but_preserves_word_timings() -> None:
    words = [
        {"text": "A", "start": 0.0, "end": 0.2},
        {"text": "lỗi", "start": 0.2, "end": 0.35},
        {"text": "B", "start": 0.35, "end": 0.6},
    ]
    spans = [
        {"speaker": "first", "start": 0.0, "end": 0.2},
        {"speaker": "second", "start": 0.2, "end": 0.35},
        {"speaker": "first", "start": 0.35, "end": 0.6},
    ]

    assigned = assign_spans_to_words(words, spans)

    assert [word["diarizationSpeakerId"] for word in assigned] == ["speaker-1", "speaker-1", "speaker-1"]
    assert [(word["start"], word["end"]) for word in assigned] == [(0.0, 0.2), (0.2, 0.35), (0.35, 0.6)]