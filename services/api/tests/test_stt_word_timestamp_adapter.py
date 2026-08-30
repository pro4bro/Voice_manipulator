from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path


STT_SOURCE_ROOT = Path(__file__).resolve().parents[2] / "stt_studio"
if str(STT_SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(STT_SOURCE_ROOT))

from studio_app.server import (  # noqa: E402
    _merge_speech_spans,
    _native_transcription_item,
    _refine_word_boundaries,
)


@dataclass
class FakeWord:
    word: str
    start: float | None
    end: float | None
    probability: float


@dataclass
class FakeSegment:
    text: str
    start: float
    end: float
    words: list[FakeWord]


def test_native_dtw_words_keep_measured_boundaries_and_confidence():
    item = _native_transcription_item(
        [
            FakeSegment(
                " Xin chào",
                1.0,
                1.8,
                [FakeWord(" Xin", 1.02, 1.31, 0.91), FakeWord(" chào", 1.35, 1.78, 0.83)],
            )
        ],
        duration=3.0,
        sample_rate=24000,
        language_code="vi",
        model_name="large-v3",
    )

    assert item["word_timing_quality"] == "source"
    assert item["transcription_engine"] == "faster-whisper-native-dtw"
    assert item["words"] == [
        {
            "text": "Xin",
            "start": 1.02,
            "end": 1.31,
            "timingSource": "faster-whisper-dtw",
            "segmentIndex": 0,
            "confidence": 0.91,
        },
        {
            "text": "chào",
            "start": 1.35,
            "end": 1.78,
            "timingSource": "faster-whisper-dtw",
            "segmentIndex": 0,
            "confidence": 0.83,
        },
    ]


def test_native_adapter_never_distributes_segment_time_when_words_are_missing():
    item = _native_transcription_item(
        [FakeSegment(" Có transcript nhưng không có timing", 2.0, 4.0, [])],
        duration=5.0,
        sample_rate=24000,
        language_code="vi",
        model_name="large-v3",
    )

    assert item["text"] == "Có transcript nhưng không có timing"
    assert item["words"] == []
    assert item["word_timing_quality"] == "needs-alignment"
    assert "không tạo timestamp chia đều" in item["word_timing_note"]


def test_speech_spans_merge_only_short_acoustic_pauses():
    assert _merge_speech_spans(
        [(13.568, 14.1), (14.25, 15.328), (16.352, 18.4)]
    ) == [(13.568, 15.328), (16.352, 18.4)]


def test_acoustic_refinement_snaps_only_phrase_edges_without_warping_middle_words():
    words = [
        {"text": "Thì", "start": 13.24, "end": 13.64, "timingSource": "faster-whisper-dtw"},
        {"text": "nó", "start": 13.64, "end": 13.80, "timingSource": "faster-whisper-dtw"},
        {"text": "phải", "start": 13.80, "end": 14.90, "timingSource": "faster-whisper-dtw"},
        {"text": "tiên", "start": 14.90, "end": 15.22, "timingSource": "faster-whisper-dtw"},
        {"text": "Đầu", "start": 16.06, "end": 16.46, "timingSource": "faster-whisper-dtw"},
        {"text": "tiên", "start": 16.46, "end": 17.98, "timingSource": "faster-whisper-dtw"},
        {"text": "được", "start": 17.98, "end": 18.24, "timingSource": "faster-whisper-dtw"},
    ]

    refined = _refine_word_boundaries(
        words,
        [(13.568, 15.328), (16.352, 18.4)],
    )

    assert refined == 2
    assert words[0]["start"] == 13.568
    assert words[3]["end"] == 15.328
    assert words[4]["start"] == 16.352
    assert words[6]["end"] == 18.4
    assert [word["timingSource"] for word in words] == [
        "faster-whisper-dtw+silero-edge",
        "faster-whisper-dtw",
        "faster-whisper-dtw",
        "faster-whisper-dtw+silero-edge",
        "faster-whisper-dtw+silero-edge",
        "faster-whisper-dtw",
        "faster-whisper-dtw+silero-edge",
    ]


def test_acoustic_refinement_snaps_a_single_word_without_a_group_warp():
    words = [
        {"text": "SEO", "start": 19.88, "end": 20.28, "timingSource": "faster-whisper-dtw"}
    ]

    refined = _refine_word_boundaries(words, [(19.808, 20.576)])

    assert refined == 1
    assert words[0] == {
        "text": "SEO",
        "start": 19.808,
        "end": 20.576,
        "timingSource": "faster-whisper-dtw+silero-edge",
    }


def test_acoustic_refinement_splits_groups_at_whisper_segment_boundaries_before_gap():
    words = [
        {"text": "một", "start": 1.0, "end": 1.3, "segmentIndex": 0, "timingSource": "faster-whisper-dtw"},
        {"text": "hai", "start": 1.31, "end": 1.6, "segmentIndex": 0, "timingSource": "faster-whisper-dtw"},
        {"text": "ba", "start": 1.61, "end": 1.9, "segmentIndex": 1, "timingSource": "faster-whisper-dtw"},
        {"text": "bốn", "start": 1.91, "end": 2.2, "segmentIndex": 1, "timingSource": "faster-whisper-dtw"},
    ]

    refined = _refine_word_boundaries(
        words,
        [(1.08, 1.55), (1.68, 2.12)],
    )

    assert refined == 2
    assert [(word["start"], word["end"]) for word in words] == [
        (1.08, 1.3),
        (1.31, 1.55),
        (1.68, 1.9),
        (1.91, 2.12),
    ]
