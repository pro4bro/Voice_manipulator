import pytest

from app.adapters.subtitle_waveform_anchors import vector_landmarks
from app.domain.subtitle_alignment import propose_alignment


def test_peak_vectors_find_steps_in_seconds_without_display_zoom():
    points = [{"min": -.6 if 300 <= i < 700 else -.001,
               "max": .6 if 300 <= i < 700 else .001} for i in range(1000)]
    result = vector_landmarks(points, 2, 3)
    assert len(result) == 2
    assert [(row["kind"], row["time"]) for row in result] == [("onset", 2.3), ("offset", 2.7)]
    assert all(row["spreadMs"] <= 20 for row in result)
    assert vector_landmarks([{"min": 0, "max": 0}] * 1000, 0, 1) == []
    assert vector_landmarks([{"min": -.4, "max": .4}] * 1000, 0, 1) == []


def test_waveform_corner_cannot_identify_or_move_a_word_without_acoustic_alignment():
    words = [{"text": "xin", "start": .1, "end": .3, "timingSource": "stt"}]
    result = propose_alignment(words, None, 1, waveform_landmarks=[{"kind": "onset", "time": .4}])
    assert result["rows"][0]["after"] == result["rows"][0]["before"]
    assert result["summary"]["ready"] == 0


def test_matching_waveform_corners_strengthen_a_group_anchor_without_relaxing_consensus():
    words = [{"text": str(i), "start": i * .3, "end": i * .3 + .2} for i in range(5)]
    aligned = [{**word, "start": word["start"] + .1, "end": word["end"] + .1, "score": .95} for word in words]
    landmarks = [{"kind": kind, "time": aligned[2][edge]} for kind, edge in (("onset", "start"), ("offset", "end"))]
    result = propose_alignment(words, aligned, 2, waveform_landmarks=landmarks)
    assert result["diagnostics"]["waveform_anchor_count"] == 2
    assert result["summary"]["ready"] == 5
    assert all(row["after"]["start"] == pytest.approx(words[row["index"]]["start"] + .1) for row in result["rows"])
    for i, row in enumerate(aligned):
        row["start"] += i * .15
        row["end"] += i * .15
    unstable = propose_alignment(words, aligned, 3, waveform_landmarks=landmarks)
    assert unstable["diagnostics"]["translation_groups"] == []
