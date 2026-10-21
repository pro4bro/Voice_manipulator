import pytest

from app.domain.subtitle_alignment import propose_alignment


def samples(delta=.12):
    words = [{"text": "word", "start": .2 + i * .4, "end": .4 + i * .4, "segmentIndex": 1} for i in range(5)]
    aligned = [{**w, "start": w["start"] + delta, "end": w["end"] + delta, "score": .95} for w in words]
    return words, aligned


@pytest.mark.parametrize("mode", ["common-offset", "edge-offset", "group-offset", "ctc"])
def test_methods_are_separate_proposals_and_protect_manual_timing(mode):
    words, aligned = samples()
    result = propose_alignment(words, aligned, 3, mode=mode, rms=[.1] * 300)
    assert result["summary"]["ready"] > 0
    assert result["diagnostics"]["mode"] == mode
    words[2]["timingSource"] = "manual"
    result = propose_alignment(words, aligned, 3, mode=mode, rms=[.1] * 300)
    assert result["rows"][2]["status"] == "locked"
    assert result["rows"][2]["before"] == result["rows"][2]["after"]


def test_common_and_separate_edge_offsets_have_different_span_effects():
    words, aligned = samples()
    for row in aligned:
        row["end"] -= .04
    common = propose_alignment(words, aligned, 3, mode="common-offset")
    separate = propose_alignment(words, aligned, 3, mode="edge-offset")
    assert common["rows"][0]["after"] == pytest.approx({"start": .3, "end": .5})
    assert separate["rows"][0]["after"] == pytest.approx({"start": .32, "end": .48})
    for mode in ("common-offset", "edge-offset"):
        unavailable = propose_alignment(words, None, 3, mode=mode)
        assert unavailable["summary"]["ready"] == 0
        assert unavailable["diagnostics"]["drift"]["status"] == "insufficient-evidence"


def test_waveform_vector_is_a_real_review_proposal_and_never_auto_selected():
    words, aligned = samples()
    landmarks = [{"kind": "onset", "time": .33}, {"kind": "offset", "time": .53}]
    result = propose_alignment(words, aligned, 3, mode="waveform", waveform_landmarks=landmarks)
    assert result["rows"][0]["method"] == "waveform-vector"
    assert result["rows"][0]["after"] == {"start": .33, "end": .53}
    assert result["summary"]["ready"] == 0
    assert result["rows"][0]["status"] == "review"
    absent = propose_alignment(words, None, 3, mode="waveform")
    assert all(row["after"] == row["before"] for row in absent["rows"])


def test_drift_checks_include_manual_words_without_unlocking_them():
    words, aligned = samples(.7)
    words[0]["timingSource"] = "manual"
    result = propose_alignment(words, aligned, 4, mode="diagnose", rms=[.1] * 400)
    drift = result["diagnostics"]["drift"]
    assert drift["status"] == "large-drift"
    assert drift["comparedWords"] == 5
    assert drift["severeCount"] == 5
    assert drift["suspects"][0]["index"] == 0
    assert drift["suspects"][0]["ctcStart"] == pytest.approx(.9)
    assert result["rows"][0]["status"] == "locked"
    assert result["summary"]["ready"] == 0
    assert all(row["after"] == row["before"] for row in result["rows"])


def test_small_model_coverage_and_quiet_audio_do_not_claim_healthy_alignment():
    words, aligned = samples()
    for row in aligned[1:]:
        row["score"] = .1
    result = propose_alignment(words, aligned, 3, rms=[.1] * 300)
    assert result["diagnostics"]["drift"]["status"] == "insufficient-evidence"
    assert result["diagnostics"]["drift"]["unassessedCount"] == 4
    quiet = propose_alignment(words, None, 3, rms=[0] * 300)
    assert quiet["diagnostics"]["drift"]["quietCount"] == 5
    assert quiet["diagnostics"]["drift"]["status"] == "insufficient-evidence"
