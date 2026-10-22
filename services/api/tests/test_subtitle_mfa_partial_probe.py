from scripts.profiling.subtitle_mfa_partial_probe import build_partial_probe


def raw(labels):
    return {"start": 0, "end": 20, "tiers": {"words": {"entries": [
        [float(index), float(index) + .5, label] for index, label in enumerate(labels)
    ]}}}


def seed(*texts):
    return [{"text": text, "start": None, "end": None, "timingSource": "stt"} for text in texts]


def test_unknown_between_repeated_words_stays_null_without_shifting_known_neighbors():
    result = build_partial_probe(raw(["đi", "<unk>", "đi"]), seed("đi", "xíu", "đi"), "abc")

    assert result["status"] == "diagnostic-only-product-rejected"
    assert [(pair["measuredIndex"], pair["seedIndex"]) for pair in result["mappingPairs"]] == [(0, 0), (2, 2)]
    assert [row["text"] for row in result["words"]] == ["đi", "xíu", "đi"]
    assert [(row["start"], row["end"]) for row in result["words"]] == [(0., .5), (None, None), (2., 2.5)]
    assert result["unknownMeasuredIndexes"] == [1]


def test_ambiguous_single_repeat_mapping_abstains_instead_of_using_timing():
    result = build_partial_probe(raw(["same"]), seed("same", "same"), "abc")

    assert result["mappingPairs"] == []
    assert [(row["start"], row["end"]) for row in result["words"]] == [(None, None), (None, None)]


def test_count_difference_preserves_seed_length_and_ignores_unmatched_raw_label():
    result = build_partial_probe(raw(["first", "extra", "last"]), seed("first", "last"), "abc")

    assert len(result["words"]) == 2
    assert [(pair["measuredIndex"], pair["seedIndex"]) for pair in result["mappingPairs"]] == [(0, 0), (2, 1)]
    assert [row["text"] for row in result["words"]] == ["first", "last"]


def test_normalized_case_punctuation_and_nfc_match_but_output_keeps_seed_text():
    result = build_partial_probe(raw(["ÁNH!"]), seed("A\u0301nh,"), "raw-hash")

    assert len(result["words"]) == 1
    assert result["words"][0]["text"] == "A\u0301nh,"
    assert result["words"][0]["start"] == 0
    assert result["rawSha256"] == "raw-hash"


def test_eps_gap_entries_are_removed_by_product_parser_before_index_mapping():
    result = build_partial_probe(raw(["before", "<eps>", "after"]), seed("before", "after"), "abc")

    assert [(pair["measuredIndex"], pair["seedIndex"]) for pair in result["mappingPairs"]] == [(0, 0), (1, 1)]
    assert [row["start"] for row in result["words"]] == [0., 2.]


def test_optional_model_identity_is_retained_as_diagnostic_metadata():
    identity = {"engine": "mfa", "workerSha256": "worker-hash", "settings": {"beam": 10}}

    result = build_partial_probe(raw(["hi"]), seed("hi"), "raw-hash", model_identity=identity)

    assert result["modelIdentity"] == identity
    assert len(result["words"]) == 1
