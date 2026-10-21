import pytest

from app.domain.subtitle_alignment import propose_alignment


def word(text, start, end, **extra):
    return {"text": text, "start": start, "end": end, **extra}


def test_manual_and_unselected_words_are_locked_unchanged():
    words = [word("one", 0.0, 0.4, timingSource="manual"), word("two", 0.5, 0.9)]
    result = propose_alignment(words, None, 1.0, mode="offset", start_offset=0.1, indexes=[1])
    assert result["rows"][0]["status"] == "locked"
    assert result["rows"][0]["after"] == {"start": 0.0, "end": 0.4}
    assert result["rows"][1]["status"] == "ready"
    assert result["rows"][1]["after"] == {"start": 0.6, "end": 0.9}


@pytest.mark.parametrize("metadata", [
    {"reviewState": "manual"},
    {"selectedVariant": "manual"},
    {"sourceTiming": {"source": "manual-import"}},
])
def test_all_manual_provenance_forms_are_locked(metadata):
    result = propose_alignment([word("fixed", 0.1, 0.4, **metadata)], None, 1.0,
                               mode="offset", start_offset=0.1, end_offset=0.1)
    assert result["rows"][0]["status"] == "locked"
    assert result["rows"][0]["after"] == {"start": 0.1, "end": 0.4}


def test_offsets_are_independent_and_safe_at_source_edges():
    result = propose_alignment([word("a", 0.1, 0.4)], None, 1.0, mode="offset", start_offset=-0.1, end_offset=0.2)
    assert result["rows"][0]["after"]["start"] == 0.0
    assert result["rows"][0]["after"]["end"] == pytest.approx(0.6)
    assert result["rows"][0]["status"] == "ready"
    assert any(reason.startswith("user-specified") for reason in result["rows"][0]["reasons"])


def test_coherent_batch_offset_can_be_ready_while_partial_scope_conflict_is_review():
    words = [word("a", 0.0, 0.4), word("b", 0.4, 0.8)]
    batch = propose_alignment(words, None, 1.2, mode="offset", start_offset=0.1, end_offset=0.1)
    assert [row["status"] for row in batch["rows"]] == ["ready", "ready"]
    partial = propose_alignment(words, None, 1.2, mode="offset", start_offset=0.1, end_offset=0.1, indexes=[0])
    assert partial["rows"][0]["status"] == "review"
    assert partial["rows"][0]["after"] == {"start": 0.1, "end": 0.5}
    assert partial["rows"][1]["status"] == "locked"


def test_unrelated_preexisting_bad_timing_does_not_veto_safe_correction():
    words = [word("bad", -0.2, 0.1), word("a", 0.2, 0.4), word("b", 0.6, 0.8)]
    result = propose_alignment(words, None, 1.0, mode="offset", start_offset=0.02, indexes=[1])
    assert result["rows"][0]["status"] == "locked"
    assert result["rows"][1]["status"] == "ready"
    assert result["diagnostics"]["invalid_source_interval_count"] == 1


def test_invalid_offset_intervals_remain_review_without_clamping():
    words = [word("outside", -0.1, 0.3), word("zero", 0.5, 0.5), word("reverse", 0.8, 0.7)]
    result = propose_alignment(words, None, 1.0, mode="offset", start_offset=0.1, end_offset=0.1)
    assert [row["status"] for row in result["rows"]] == ["review"] * 3
    assert result["rows"][0]["after"] == {"start": -0.1, "end": 0.3}


def test_no_ctc_and_silent_waveform_never_propose_automatic_changes():
    words = [word("a", 0.0, 0.4)]
    silent = [0.0] * 100
    result = propose_alignment(words, None, 1.0, rms=silent, mode="auto")
    assert result["rows"][0]["status"] == "unchanged"
    assert result["summary"]["ready"] == 0


def test_low_confidence_ctc_stays_review_even_when_it_matches_word_order():
    result = propose_alignment(
        [word("a", 0.0, 0.3)],
        [word("a", 0.02, 0.32, score=0.2)],
        1.0,
    )
    assert result["rows"][0]["status"] == "review"
    assert "ctc-confidence-uncertain" in result["rows"][0]["reasons"]


def test_alignment_text_order_and_count_must_match():
    words = [word("hello", 0.0, 0.4), word("world", 0.5, 0.9)]
    for aligned in ([word("world", 0.0, 0.4), word("hello", 0.5, 0.9)], [word("hello", 0.0, 0.4)]):
        try:
            propose_alignment(words, aligned, 1.0)
        except ValueError:
            pass
        else:
            raise AssertionError("mismatched CTC alignment must fail")


def test_uncertain_ctc_is_review_and_auto_candidates_are_globally_consistent():
    words = [word("a", 0.0, 0.4), word("b", 0.5, 0.9)]
    aligned = [word("a", 0.45, 0.75, score=0.99), word("b", 0.7, 0.95, score=0.99)]
    result = propose_alignment(words, aligned, 1.0)
    assert result["rows"][0]["status"] == "review"  # conflicts with unchanged neighbor
    assert result["rows"][1]["status"] in {"ready", "review"}
    chosen = {row["index"]: row["after"] for row in result["rows"] if row["status"] == "ready"}
    output = [chosen.get(i, {"start": w["start"], "end": w["end"]}) for i, w in enumerate(words)]
    assert all(a["start"] < a["end"] and a["start"] >= 0 and a["end"] <= 1.0 for a in output)
    assert all(output[i]["start"] >= output[i - 1]["end"] for i in range(1, len(output)))


def test_corroborated_small_ctc_changes_can_be_ready_as_a_safe_full_output():
    words = [word("a", 0.0, 0.2), word("b", 0.3, 0.5), word("c", 0.6, 0.8)]
    aligned = [word(token, start + 0.01, end + 0.01, score=0.95)
               for token, start, end in (("a", 0.0, 0.2), ("b", 0.3, 0.5), ("c", 0.6, 0.8))]
    result = propose_alignment(words, aligned, 1.0)
    assert [row["status"] for row in result["rows"]] == ["ready", "ready", "ready"]
    assert result["diagnostics"]["ctc_offsets_stable"] is True
    with_activity = propose_alignment(words, aligned, 1.0, rms=[0.5] * 100)
    assert [row["status"] for row in with_activity["rows"]] == ["ready", "ready", "ready"]
    assert with_activity["diagnostics"]["waveform_used_for_selection"] is True


def test_stable_segment_anchor_group_applies_one_shared_translation_including_low_score_word():
    words = [word(str(i), i * 0.22, i * 0.22 + 0.2, segmentIndex=4) for i in range(5)]
    aligned = [word(str(i), i * 0.22 + 0.12, i * 0.22 + 0.32, score=0.95) for i in range(5)]
    aligned[2]["score"] = 0.2
    result = propose_alignment(words, aligned, 2.0)
    assert [row["status"] for row in result["rows"]] == ["ready"] * 5
    assert [row["method"] for row in result["rows"]] == ["automatic-offset"] * 5
    for index, row in enumerate(result["rows"]):
        assert row["after"]["start"] == pytest.approx(words[index]["start"] + 0.12)
        assert row["after"]["end"] == pytest.approx(words[index]["end"] + 0.12)
    assert result["diagnostics"]["translation_groups"][0]["anchor_count"] == 4


def test_offset_can_correct_position_while_preserving_and_flagging_an_existing_span_outlier():
    words, cursor = [], 0.0
    for i in range(7):
        span = 2.5 if i == 3 else .2
        words.append(word("word", cursor, cursor + span, segmentIndex=4))
        cursor += span + .02
    aligned = [{**item, "start": item["start"] + .1, "end": item["end"] + .1, "score": .95} for item in words]
    result = propose_alignment(words, aligned, cursor + 1)
    assert all(row["status"] == "ready" for row in result["rows"])
    unusual = result["rows"][3]
    assert "duration-outlier" in unusual["reasons"]
    assert unusual["after"]["end"] - unusual["after"]["start"] == pytest.approx(2.5)


def test_manual_member_and_partial_segment_scope_fence_shared_translation():
    words = [word(str(i), i * 0.22, i * 0.22 + 0.2, segmentIndex=8) for i in range(5)]
    aligned = [word(str(i), i * 0.22 + 0.1, i * 0.22 + 0.3, score=0.95) for i in range(5)]
    manual_words = [dict(item) for item in words]
    manual_words[2]["timingSource"] = "manual"
    manual = propose_alignment(manual_words, aligned, 2.0)
    assert manual["rows"][2]["status"] == "locked"
    assert manual["rows"][2]["after"] == manual["rows"][2]["before"]
    assert not any(row["method"] == "automatic-offset" for row in manual["rows"])
    partial = propose_alignment(words, aligned, 2.0, indexes=[0, 1, 2, 3])
    assert partial["rows"][4]["status"] == "locked"
    assert all(row["status"] == "review" for row in partial["rows"][:4])
    assert not any(row["method"] == "automatic-offset" for row in partial["rows"])


@pytest.mark.parametrize("deltas", [
    [0.6, 0.6, 0.6, 0.6],
    [0.0, 0.1, 0.2, 0.3],
])
def test_large_or_unstable_group_translation_abstains(deltas):
    words = [word(str(i), i * 0.22, i * 0.22 + 0.2, segmentIndex=10) for i in range(4)]
    aligned = [word(str(i), i * 0.22 + delta, i * 0.22 + 0.2 + delta, score=0.95)
               for i, delta in enumerate(deltas)]
    result = propose_alignment(words, aligned, 2.0)
    assert not any(row["method"] == "automatic-offset" and row["status"] == "ready" for row in result["rows"])


def test_early_anchor_group_does_not_certify_distant_words():
    words = [word("a", 0.0, 0.2), word("b", 0.3, 0.5), word("c", 0.6, 0.8), word("distant", 20.0, 20.2)]
    aligned = [word("a", 0.01, 0.21, score=0.95), word("b", 0.31, 0.51, score=0.95),
               word("c", 0.61, 0.81, score=0.95), word("distant", 20.01, 20.21, score=0.95)]
    result = propose_alignment(words, aligned, 21.0)
    assert all(row["status"] == "ready" for row in result["rows"][:3])
    assert result["rows"][3]["status"] == "review"
    assert result["diagnostics"]["row_local_anchor_counts"][3] == 1


def test_review_ctc_candidate_does_not_intrude_on_accepted_default_intervals():
    words = [word("a", 0.0, 0.2), word("review", 0.3, 0.5), word("c", 0.6, 0.8), word("d", 0.9, 1.1)]
    # Distinct speech segments exercise individual refinement, not shared offset.
    words = [{**item, "segmentIndex": i} for i, item in enumerate(words)]
    aligned = [word("a", 0.01, 0.21, score=0.95), word("review", 0.15, 0.35, score=0.2),
               word("c", 0.61, 0.81, score=0.95), word("d", 0.91, 1.11, score=0.95)]
    result = propose_alignment(words, aligned, 1.5)
    assert result["rows"][1]["status"] == "review"
    assert result["rows"][1]["after"] == {"start": 0.15, "end": 0.35}
    assert result["rows"][0]["status"] == "ready"


def test_rejected_proposal_uses_before_interval_and_catches_nested_nonadjacent_overlap():
    words = [word("ready", 0.0, 0.2), word("middle", 0.5, 0.6), word("nested", 0.1, 0.3)]
    result = propose_alignment(words, None, 1.0, mode="offset", start_offset=0.02, indexes=[0, 2])
    assert result["rows"][2]["status"] == "review"
    assert result["rows"][2]["after"]["start"] == pytest.approx(0.12)
    assert result["rows"][2]["after"]["end"] == 0.3
    assert result["rows"][0]["status"] == "review"


def test_review_candidate_that_looks_safe_does_not_hide_before_overlap():
    words = [word("ready", 0.0, 0.2), word("review", 0.15, 0.35), word("c", 0.6, 0.8), word("d", 0.9, 1.1)]
    aligned = [word("ready", 0.01, 0.21, score=0.95), word("review", 0.3, 0.5, score=0.2),
               word("c", 0.61, 0.81, score=0.95), word("d", 0.91, 1.11, score=0.95)]
    result = propose_alignment(words, aligned, 1.5)
    assert result["rows"][1]["status"] == "review"
    assert result["rows"][1]["after"] == {"start": 0.3, "end": 0.5}
    assert result["rows"][0]["status"] == "review"


def test_silent_rms_blocks_ctc_readiness_and_timing_outlier_stays_review():
    words = [word("a", 0.0, 0.2), word("b", 0.25, 0.45), word("c", 0.5, 0.7), word("long", 0.75, 0.95)]
    # Separate groups exercise the CTC refinement gate; shared translations have
    # their own test for retaining (rather than changing) unusual spans.
    words = [{**item, "segmentIndex": i} for i, item in enumerate(words)]
    aligned = [word(token, start + 0.01, end + 0.01, score=0.95)
               for token, start, end in (("a", 0.0, 0.2), ("b", 0.25, 0.45), ("c", 0.5, 0.7), ("long", 0.75, 0.95))]
    silent = propose_alignment(words[:3], aligned[:3], 1.2, rms=[0.0] * 120)
    assert all(row["status"] == "review" for row in silent["rows"])
    anomalous = propose_alignment(words, aligned, 1.2)
    assert any(reason in anomalous["rows"][3]["reasons"] for reason in ("duration-outlier", "speaking-rate-outlier"))
    assert anomalous["rows"][3]["status"] == "review"


@pytest.mark.parametrize("kwargs", [
    {"duration": True},
    {"start_offset": False},
    {"frame_seconds": 0},
    {"frame_seconds": float("nan")},
    {"indexes": [0, 0]},
])
def test_rejects_boolean_numeric_values_invalid_frames_and_duplicate_indexes(kwargs):
    args = {"duration": 1.0}
    args.update(kwargs)
    with pytest.raises(ValueError):
        propose_alignment([word("a", 0.0, 0.4)], None, **args)


def test_abnormal_duration_is_not_redistributed_or_approved():
    words = [word("short", 0.0, 0.02), word("long", 0.1, 0.9)]
    aligned = [word("short", 0.0, 0.02, score=0.99), word("long", 0.1, 0.9, score=0.99)]
    result = propose_alignment(words, aligned, 1.0)
    assert [row["after"] for row in result["rows"]] == [
        {"start": 0.0, "end": 0.02}, {"start": 0.1, "end": 0.9}
    ]
    assert not any(row["status"] == "ready" for row in result["rows"])
