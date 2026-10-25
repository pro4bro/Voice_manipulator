from __future__ import annotations

from app.domain.models import VoiceOutput, VoiceOutputSegment
from app.domain.voice_script_document import VoiceScriptDocument
from app.domain.voice_version_fix import plan_version_fix, project_output_for_script

RATE = 24000


def _script(texts, *, voice_ids=None, settings=None, row_ids=None):
    voice_ids = voice_ids or ["voice"] * len(texts)
    settings = settings or [{} for _ in texts]
    row_ids = row_ids or [f"row-{i}" for i in range(len(texts))]
    return VoiceScriptDocument.model_validate({
        "revision": 1,
        "segments": [{"id": "segment"}],
        "rows": [{"id": row_ids[i], "text": text, "voiceId": voice_ids[i],
                  "speakerProfileId": "speaker", "segmentId": "segment", "settings": settings[i]}
                 for i, text in enumerate(texts)],
    })


def _output(texts, *, words=None, quality="source", segments=None):
    if segments is None:
        segments = [VoiceOutputSegment(row_id=f"row-{i}", voice_id="voice", voice_name="Voice",
            speaker_profile_id="speaker", engine="omnivoice", generator_id="omni", text=text,
            start=i * 1.0, end=(i + 1) * 1.0) for i, text in enumerate(texts)]
    return VoiceOutput(id="output-1", name="Output", text="\n".join(texts), voice_id="voice",
        voice_name="Voice", speaker_profile_id="speaker", engine="omnivoice", generator_id="omni",
        duration=float(len(texts)), sample_rate=RATE, audio_path="assets/voice-output/output-1/audio.wav",
        segments=segments, words=words or [], word_timing_quality=quality)


def _words(tokens, *, row_index=0, offset=0.1, step=0.2, trusted=True):
    return [{"text": token, "start": offset + i * step, "end": offset + (i + 1) * step,
             "timingTrusted": trusted, "segmentIndex": row_index}
            for i, token in enumerate(tokens)]


def _plan(current, generated, output, current_config=None, generated_config=None):
    config = {"generatorParameters": {"omni": {"temperature": 0.7}}, "speed": 1}
    return plan_version_fix(current, generated, current_config if current_config is not None else config,
                            generated_config if generated_config is not None else config, output)


def test_one_word_text_edit_maps_exact_word_frames():
    generated = _script(["I like blue"])
    current = _script(["I love blue"])
    output = _output(["I like blue"], words=_words(["I", "like", "blue"]))
    result = _plan(current, generated, output)
    assert result["blockers"] == []
    assert len(result["regions"]) == 1
    region = result["regions"][0]
    assert (region["rowId"], region["text"], region["startFrame"], region["frameCount"]) == (
        "row-0", "love", round(.3 * RATE), round(.2 * RATE))
    assert region["voiceId"] == "voice" and region["speakerProfileId"] == "speaker"
    assert "duration" not in region["settings"]


def test_legacy_projection_preserves_source_text_times_and_requires_exact_segments():
    grouped = VoiceScriptDocument.model_validate({"segments": [{"id": "s"}], "rows": [
        {"id": "row-1", "legacyRowIds": ["row-1", "row-2"], "segmentId": "s",
         "text": "alpha\nbravo", "voiceId": "voice", "speakerProfileId": "speaker"},
    ]})
    source = _output(["alpha", "bravo"], words=[
        {"text": "alpha", "start": .1, "end": .2, "segmentIndex": 0, "timingTrusted": True},
        {"text": "bravo", "start": 1.1, "end": 1.2, "segmentIndex": 1, "timingTrusted": True},
    ], segments=[VoiceOutputSegment(row_id="row-1", voice_id="voice", voice_name="Voice",
            speaker_profile_id="speaker", engine="omnivoice", generator_id="omni", text="alpha", start=0, end=1),
        VoiceOutputSegment(row_id="row-2", voice_id="voice", voice_name="Voice",
            speaker_profile_id="speaker", engine="omnivoice", generator_id="omni", text="bravo", start=1, end=2)])
    projected = project_output_for_script(source, grouped)
    assert projected is not None
    assert projected.text == source.text
    assert [segment.row_id for segment in projected.segments] == ["row-1"]
    assert projected.words == [{**source.words[0], "segmentIndex": 0}, {**source.words[1], "segmentIndex": 0}]
    assert [(word["start"], word["end"]) for word in projected.words] == [(.1, .2), (1.1, 1.2)]

    already_grouped = _output(["alpha\nbravo"], words=[
        {"text": "alpha", "start": .1, "end": .2, "segmentIndex": 0, "timingTrusted": True},
        {"text": "bravo", "start": 1.1, "end": 1.2, "segmentIndex": 0, "timingTrusted": True},
    ], segments=[VoiceOutputSegment(row_id="row-1", voice_id="voice", voice_name="Voice",
        speaker_profile_id="speaker", engine="omnivoice", generator_id="omni", text="alpha\nbravo",
        start=0, end=2, script_row={"id": "row-1", "legacyRowIds": ["row-1", "row-2"]})])
    repeated = project_output_for_script(already_grouped, grouped)
    assert repeated is not None
    assert [segment.row_id for segment in repeated.segments] == ["row-1"]
    assert repeated.words == already_grouped.words

    extra = _output(["alpha", "bravo", "unexpected"], words=source.words,
        segments=[*source.segments, VoiceOutputSegment(row_id="unknown", voice_id="voice", voice_name="Voice",
            speaker_profile_id="speaker", engine="omnivoice", generator_id="omni", text="unexpected", start=2, end=3)])
    assert project_output_for_script(extra, grouped) is None

    missing = _output(["alpha"], words=source.words[:1], segments=[source.segments[0]])
    assert project_output_for_script(missing, grouped) is None
    result = _plan(grouped, grouped, extra)
    assert result["blockers"] and result["regions"] == []


def test_two_disjoint_edits_remain_separate_regions():
    generated = _script(["alpha beta gamma delta epsilon"])
    current = _script(["alpha BRAVO gamma DELTA epsilon"])
    output = _output(["alpha beta gamma delta epsilon"], words=_words(
        ["alpha", "beta", "gamma", "delta", "epsilon"], offset=.1, step=.1))
    regions = _plan(current, generated, output)["regions"]
    assert [region["text"] for region in regions] == ["BRAVO", "DELTA"]
    assert [(region["startFrame"], region["frameCount"]) for region in regions] == [
        (round(.2 * RATE), round(.1 * RATE)), (round(.4 * RATE), round(.1 * RATE))]


def test_repeated_same_location_stays_dirty_until_new_generated_baseline():
    generated = _script(["go go"])
    current = _script(["go now"])
    old_output = _output(["go go"], words=_words(["go", "go"], offset=.1, step=.3))
    assert [row["text"] for row in _plan(current, generated, old_output)["regions"]] == ["now"]
    new_output = _output(["go now"], words=_words(["go", "now"], offset=.1, step=.3))
    assert _plan(current, current, new_output)["regions"] == []


def test_changed_generator_parameters_and_speed_dirty_whole_relevant_row():
    generated = _script(["same words"])
    current = _script(["same words"])
    output = _output(["same words"], words=_words(["same", "words"]))
    before = {"generatorParameters": {"omni": {"temperature": .5}}, "speed": 1}
    after = {"generatorParameters": {"omni": {"temperature": .7}}, "speed": 1.2}
    region, = _plan(current, generated, output, after, before)["regions"]
    assert region["text"] == "same words"
    assert region["startFrame"] == 0 and region["frameCount"] == RATE
    assert "config" in region["reason"].lower()


def test_speed_only_change_marks_rows_using_that_generator():
    script = _script(["same words"])
    output = _output(["same words"], words=_words(["same", "words"]))
    region, = _plan(script, script, output,
        {"generatorParameters": {"omni": {"temperature": .5}}, "speed": 1.15},
        {"generatorParameters": {"omni": {"temperature": .5}}, "speed": 1})["regions"]
    assert region["frameCount"] == RATE and "configuration" in region["reason"]


def test_unchanged_script_and_config_produce_no_regions():
    script = _script(["one two"])
    output = _output(["one two"], words=_words(["one", "two"]))
    assert _plan(script, script, output)["regions"] == []


def test_missing_generated_snapshot_is_a_full_generation_blocker():
    script = _script(["one two"])
    output = _output(["one two"], words=_words(["one", "two"]))
    result = _plan(script, None, output)
    assert result["regions"] == [] and "Full generation" in result["blockers"][0]


def test_untrusted_alignment_falls_back_to_only_the_changed_full_row():
    generated = _script(["old row", "untouched row"])
    current = _script(["new row", "untouched row"])
    output = _output(["old row", "untouched row"], words=_words(["old", "row"], trusted=False) +
                     _words(["untouched", "row"], row_index=1, offset=1.1, trusted=False), quality="needs-alignment")
    regions = _plan(current, generated, output)["regions"]
    assert len(regions) == 1 and regions[0]["rowId"] == "row-0"
    assert regions[0]["text"] == "new row"
    assert regions[0]["startFrame"] == 0 and regions[0]["frameCount"] == RATE
    assert "fallback" in regions[0]["reason"].lower()


def test_added_deleted_or_reordered_rows_block_automatic_timing():
    generated = _script(["first", "second"])
    output = _output(["first", "second"], words=_words(["first"]) + _words(["second"], row_index=1, offset=1.1))
    for current in (_script(["first", "second", "third"]), _script(["second"]),
                    _script(["second", "first"], row_ids=["row-1", "row-0"])):
        result = _plan(current, generated, output)
        assert result["regions"] == []
        assert result["blockers"] and any("Full" in reason or "review" in reason.lower() for reason in result["blockers"])


def test_voice_or_effective_row_settings_changes_replace_that_whole_row():
    generated = _script(["same words"], settings=[{"mood": "neutral"}])
    output = _output(["same words"], words=_words(["same", "words"]))
    changed_settings = _script(["same words"], settings=[{"mood": "calm", "duration": 2}])
    region, = _plan(changed_settings, generated, output)["regions"]
    assert region["text"] == "same words" and region["frameCount"] == RATE
    assert region["settings"]["mood"] == "calm" and "duration" not in region["settings"]
    changed_voice = _script(["same words"], voice_ids=["new-voice"], settings=[{"mood": "neutral"}])
    voice_region, = _plan(changed_voice, generated, output)["regions"]
    assert voice_region["voiceId"] == "new-voice" and voice_region["frameCount"] == RATE


def test_generator_parameter_change_only_dirties_rows_using_that_generator():
    script = _script(["same words", "same words"])
    segments = [VoiceOutputSegment(row_id=f"row-{i}", voice_id="voice", voice_name="Voice",
        speaker_profile_id="speaker", engine="fixture", generator_id="omni" if i == 0 else "other",
        text="same words", start=i, end=i + 1) for i in range(2)]
    output = _output(["same words", "same words"], words=_words(["same", "words"]) +
        _words(["same", "words"], row_index=1, offset=1.1), segments=segments)
    before = {"generatorParameters": {"omni": {"temperature": .5}, "other": {"temperature": .5}}, "speed": 1}
    after = {"generatorParameters": {"omni": {"temperature": .7}, "other": {"temperature": .5}}, "speed": 1}
    regions = _plan(script, script, output, after, before)["regions"]
    assert [region["rowId"] for region in regions] == ["row-0"]


def test_insertion_uses_neighbor_context_and_deleting_only_word_plans_silence():
    generated = _script(["I go"])
    current = _script(["I will go"])
    output = _output(["I go"], words=_words(["I", "go"], offset=.2, step=.2))
    region, = _plan(current, generated, output)["regions"]
    assert region["text"] == "I will go"
    assert region["startFrame"] == round(.2 * RATE) and region["frameCount"] == round(.4 * RATE)

    one_word_generated = _script(["word"])
    one_word_deleted = _script([""])
    one_word_output = _output(["word"], words=_words(["word"], offset=.2, step=.2))
    silence, = _plan(one_word_deleted, one_word_generated, one_word_output)["regions"]
    assert silence["text"] == "" and silence["frameCount"] == round(.2 * RATE)


def test_unchanged_blank_script_rows_are_skipped_when_output_omits_them():
    script = _script(["", "red blue"])
    only_spoken_row = VoiceOutputSegment(row_id="row-1", voice_id="voice", voice_name="Voice",
        speaker_profile_id="speaker", engine="omnivoice", generator_id="omni", text="red blue",
        start=0, end=1)
    output = _output(["red blue"], segments=[only_spoken_row], words=_words(["red", "blue"], row_index=0))
    result = _plan(script, script, output)
    assert result == {"regions": [], "blockers": []}


def test_new_content_in_an_omitted_blank_row_is_blocked_without_inventing_timing():
    generated = _script(["", "red blue"])
    current = _script(["new words", "red blue"])
    only_spoken_row = VoiceOutputSegment(row_id="row-1", voice_id="voice", voice_name="Voice",
        speaker_profile_id="speaker", engine="omnivoice", generator_id="omni", text="red blue",
        start=0, end=1)
    output = _output(["red blue"], segments=[only_spoken_row], words=_words(["red", "blue"], row_index=0))
    result = _plan(current, generated, output)
    assert result["regions"] == []
    assert result["blockers"] and "empty" in result["blockers"][0].lower()


def test_word_index_uses_output_segment_order_after_blank_rows_are_omitted():
    generated = _script(["", "red blue"])
    current = _script(["", "red green"])
    only_spoken_row = VoiceOutputSegment(row_id="row-1", voice_id="voice", voice_name="Voice",
        speaker_profile_id="speaker", engine="omnivoice", generator_id="omni", text="red blue",
        start=0, end=1)
    # The Script row is index 1, but its actual output segment and word index are 0.
    output = _output(["red blue"], segments=[only_spoken_row], words=_words(["red", "blue"], row_index=0))
    region, = _plan(current, generated, output)["regions"]
    assert region["rowId"] == "row-1" and region["text"] == "green"
    assert region["startFrame"] == round(.3 * RATE) and region["frameCount"] == round(.2 * RATE)
