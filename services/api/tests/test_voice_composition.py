from __future__ import annotations

import hashlib
import struct
import wave

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.voice_layer_compositor import VoiceLayerCompositor
from app.domain.models import ProjectCreate, VoiceOutput
from app.domain.voice_composition import (
    VoiceComposition,
    VoiceCompositionClip,
    VoiceCompositionCommand,
    VoiceCompositionLayer,
    add_fix_clip,
    apply_voice_composition_command,
    MAX_COMPOSITION_FRAMES,
)

RATE = 24000


def _tone(value: int, frames: int) -> bytes:
    return struct.pack("<h", value) * frames


def _write_wav(path, pcm: bytes) -> None:
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(pcm)


def _outputs(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Composition", location=str(tmp_path / "projects")))
    return project, FileVoiceOutputs(projects)


def _source(outputs, project_id, name, pcm, words=None):
    output_id, audio = outputs.reserve(project_id)
    _write_wav(audio, pcm)
    return outputs.save(project_id, VoiceOutput(
        id=output_id, name=name, text=name, voice_id="voice", voice_name="Voice",
        speaker_profile_id="speaker", engine="fixture", generator_id="fixture",
        duration=len(pcm) / (RATE * 2), sample_rate=RATE,
        audio_path=f"assets/voice-output/{output_id}/audio.wav", words=words or [],
    ))


def _composition(layers, frames=20):
    return VoiceComposition(revision=0, duration_frames=frames, layers=layers)


def test_composition_rejects_invalid_ids_duplicate_ids_and_over_four_hours():
    with pytest.raises(ValueError, match="identifier"):
        VoiceCompositionClip(id="../unsafe", output_id="source", start_frame=0,
                            source_start_frame=0, frame_count=1)
    with pytest.raises(ValueError):
        VoiceCompositionClip(id="safe", output_id="C:outside", start_frame=0,
                            source_start_frame=0, frame_count=1)
    with pytest.raises(ValueError, match="unique"):
        _composition([
            VoiceCompositionLayer(id="base", name="Base", clips=[VoiceCompositionClip(
                id="same", output_id="a", start_frame=0, source_start_frame=0, frame_count=1)]),
            VoiceCompositionLayer(id="lower", name="Lower", clips=[VoiceCompositionClip(
                id="same", output_id="b", start_frame=1, source_start_frame=0, frame_count=1)]),
        ])
    with pytest.raises(ValueError):
        VoiceComposition(revision=0, duration_frames=MAX_COMPOSITION_FRAMES + 1,
                         layers=[VoiceCompositionLayer(id="base", name="Base")])
    # A long narration must not inherit the old ten-minute prototype ceiling.
    assert VoiceComposition(revision=0, duration_frames=RATE * 60 * 20,
        layers=[VoiceCompositionLayer(id="base", name="Base")]).duration_frames == RATE * 60 * 20


def test_command_edits_preserve_source_offsets_and_are_immutable():
    original = _composition([
        VoiceCompositionLayer(id="base", name="Base", clips=[
            VoiceCompositionClip(id="clip", output_id="source", start_frame=2, source_start_frame=7, frame_count=10),
        ]),
        VoiceCompositionLayer(id="lower", name="Lower"),
    ])
    split = apply_voice_composition_command(original, VoiceCompositionCommand(
        action="split-clip", clip_id="clip", at_frame=6, new_clip_id="clip-right"))
    assert original.layers[0].clips[0].frame_count == 10
    assert [(c.start_frame, c.source_start_frame, c.frame_count) for c in split.layers[0].clips] == [
        (2, 7, 4), (6, 11, 6)]
    trimmed = apply_voice_composition_command(split, VoiceCompositionCommand(
        action="trim-left", clip_id="clip-right", at_frame=8))
    assert (trimmed.layers[0].clips[1].start_frame, trimmed.layers[0].clips[1].source_start_frame,
            trimmed.layers[0].clips[1].frame_count) == (8, 13, 4)
    deleted = apply_voice_composition_command(trimmed, VoiceCompositionCommand(action="delete-clip", clip_id="clip"))
    assert [clip.id for clip in deleted.layers[0].clips] == ["clip-right"]
    moved = apply_voice_composition_command(split, VoiceCompositionCommand(
        action="move-clip", clip_id="clip-right", target_layer_id="lower", start_frame=6))
    assert moved.layers[0].clips[0].id == "clip"
    assert moved.layers[1].clips[0].start_frame == 6
    assert moved.layers[1].clips[0].source_start_frame == 11
    with pytest.raises(ValueError, match="timecode is locked"):
        apply_voice_composition_command(split, VoiceCompositionCommand(
            action="move-clip", clip_id="clip-right", target_layer_id="lower", start_frame=9))
    toggled = apply_voice_composition_command(moved, VoiceCompositionCommand(
        action="toggle-clip", clip_id="clip-right", enabled=False))
    assert not toggled.layers[1].clips[0].enabled
    toggled_layer = apply_voice_composition_command(toggled, VoiceCompositionCommand(
        action="toggle-layer", layer_id="lower", enabled=False))
    assert not toggled_layer.layers[1].enabled


def test_solo_composes_only_soloed_layers_and_mute_still_wins(tmp_path):
    project, outputs = _outputs(tmp_path)
    base = _source(outputs, project.id, "Base", _tone(1000, 8))
    fix = _source(outputs, project.id, "Fix", _tone(2000, 8))
    muted_solo = _source(outputs, project.id, "Muted solo", _tone(3000, 8))
    source_hashes = {item.id: hashlib.sha256(outputs.audio_path(project.id, item.id).read_bytes()).hexdigest()
                     for item in (base, fix, muted_solo)}
    composition = _composition([
        VoiceCompositionLayer(id="base", name="Base", clips=[VoiceCompositionClip(
            id="base-clip", output_id=base.id, start_frame=0, source_start_frame=0, frame_count=8)]),
        VoiceCompositionLayer(id="fix", name="Fix", clips=[VoiceCompositionClip(
            id="fix-clip", output_id=fix.id, start_frame=0, source_start_frame=0, frame_count=8)]),
        VoiceCompositionLayer(id="muted", name="Muted solo", enabled=False, solo=True, clips=[VoiceCompositionClip(
            id="muted-clip", output_id=muted_solo.id, start_frame=0, source_start_frame=0, frame_count=8)]),
    ], frames=8)
    solo = apply_voice_composition_command(composition, VoiceCompositionCommand(
        action="solo-layer", layer_id="fix", solo=True))
    rendered = VoiceLayerCompositor(outputs, crossfade_frames=0).render(project.id, solo, base.id)
    with wave.open(str(outputs.audio_path(project.id, rendered.id)), "rb") as audio:
        samples = struct.unpack("<8h", audio.readframes(8))
    assert samples == (2000,) * 8
    muted = apply_voice_composition_command(solo, VoiceCompositionCommand(
        action="toggle-layer", layer_id="fix", enabled=False))
    rendered_muted = VoiceLayerCompositor(outputs, crossfade_frames=0).render(project.id, muted, base.id)
    with wave.open(str(outputs.audio_path(project.id, rendered_muted.id)), "rb") as audio:
        assert audio.readframes(8) == b"\0" * 16
    assert source_hashes == {
        item.id: hashlib.sha256(outputs.audio_path(project.id, item.id).read_bytes()).hexdigest()
        for item in (base, fix, muted_solo)
    }


def test_add_fix_clip_uses_first_free_layer_then_allocates_lower_layers():
    composition = _composition([
        VoiceCompositionLayer(id="base", name="Base", clips=[
            VoiceCompositionClip(id="base-clip", output_id="base-out", start_frame=0,
                                 source_start_frame=0, frame_count=20),
        ]),
        VoiceCompositionLayer(id="fix-1", name="First fix", clips=[
            VoiceCompositionClip(id="old-fix", output_id="old-out", start_frame=4,
                                 source_start_frame=0, frame_count=8),
        ]),
        VoiceCompositionLayer(id="lower", name="Available", clips=[]),
    ])
    fix = VoiceCompositionClip(id="new-fix", output_id="new-out", start_frame=5,
                               source_start_frame=0, frame_count=6)
    added = add_fix_clip(composition, "base", fix)
    assert [clip.id for clip in added.layers[2].clips] == ["new-fix"]
    collision = add_fix_clip(added, "base", fix.model_copy(update={"id": "third", "output_id": "third-out"}),
                             new_layer_id="fix-2")
    assert collision.layers[-1].id == "fix-2"
    assert collision.layers[-1].clips[0].id == "third"


def test_fix_with_deeper_overlap_is_placed_below_every_overlapping_layer():
    composition = _composition([
        VoiceCompositionLayer(id="base", name="Base"),
        VoiceCompositionLayer(id="unrelated", name="Unrelated", clips=[VoiceCompositionClip(
            id="other-region", output_id="other", start_frame=0, source_start_frame=0, frame_count=2)]),
        VoiceCompositionLayer(id="overlap", name="Existing overlap", clips=[VoiceCompositionClip(
            id="existing-fix", output_id="existing", start_frame=5, source_start_frame=0, frame_count=8)]),
        VoiceCompositionLayer(id="free", name="Free below overlap"),
    ])
    added = add_fix_clip(composition, "base", VoiceCompositionClip(
        id="latest-fix", output_id="latest", start_frame=6, source_start_frame=0, frame_count=4))
    assert [clip.id for clip in added.layers[1].clips] == ["other-region"]
    assert [clip.id for clip in added.layers[2].clips] == ["existing-fix"]
    assert [clip.id for clip in added.layers[3].clips] == ["latest-fix"]


def test_render_disjoint_clips_exact_pcm_and_source_provenance(tmp_path):
    project, outputs = _outputs(tmp_path)
    a = _source(outputs, project.id, "A", _tone(1000, 8))
    b = _source(outputs, project.id, "B", _tone(-2000, 8))
    before = {item.id: hashlib.sha256(outputs.audio_path(project.id, item.id).read_bytes()).hexdigest()
              for item in (a, b)}
    composition = _composition([VoiceCompositionLayer(id="base", name="Base", clips=[
        VoiceCompositionClip(id="a", output_id=a.id, start_frame=1, source_start_frame=2, frame_count=5),
        VoiceCompositionClip(id="b", output_id=b.id, start_frame=10, source_start_frame=1, frame_count=5),
    ])], frames=18)
    rendered = VoiceLayerCompositor(outputs).render(project.id, composition, a.id)
    with wave.open(str(outputs.audio_path(project.id, rendered.id)), "rb") as audio:
        assert (audio.getframerate(), audio.getnchannels(), audio.getsampwidth(), audio.getnframes()) == (RATE, 1, 2, 18)
        pcm = audio.readframes(18)
    samples = struct.unpack("<18h", pcm)
    assert samples == (0, 1000, 1000, 1000, 1000, 1000, 0, 0, 0, 0,
                       -2000, -2000, -2000, -2000, -2000, 0, 0, 0)
    assert rendered.duration == 18 / RATE
    assert rendered.audio_path == f"assets/voice-output/{rendered.id}/audio.wav"
    assert rendered.parameters["voiceComposition"]["revision"] == 0
    assert rendered.parameters["voiceComposition"]["seams"]
    assert before == {item.id: hashlib.sha256(outputs.audio_path(project.id, item.id).read_bytes()).hexdigest()
                      for item in (a, b)}
    assert any(seam["gapFrames"] == 4 and not seam["crossfaded"]
               for seam in rendered.parameters["voiceComposition"]["seams"])


def test_winner_transition_crossfade_stays_inside_both_source_clips(tmp_path):
    project, outputs = _outputs(tmp_path)
    base = _source(outputs, project.id, "Base", _tone(1000, 40))
    fix = _source(outputs, project.id, "Fix", _tone(-1000, 20))
    composition = _composition([
        VoiceCompositionLayer(id="base", name="Base", clips=[VoiceCompositionClip(
            id="base-clip", output_id=base.id, start_frame=0, source_start_frame=0, frame_count=40)]),
        VoiceCompositionLayer(id="fix", name="Fix", clips=[VoiceCompositionClip(
            id="fix-clip", output_id=fix.id, start_frame=20, source_start_frame=0, frame_count=20)]),
    ], frames=40)
    rendered = VoiceLayerCompositor(outputs, crossfade_frames=4).render(project.id, composition, base.id)
    with wave.open(str(outputs.audio_path(project.id, rendered.id)), "rb") as audio:
        samples = struct.unpack("<40h", audio.readframes(40))
    assert samples[19] == 1000
    assert samples[20] < 1000 and samples[20] > -1000
    assert samples[23] == -1000
    seam = next(item for item in rendered.parameters["voiceComposition"]["seams"]
                if item["leftClipId"] == "base-clip" and item["rightClipId"] == "fix-clip")
    assert seam["crossfaded"] and seam["crossfadeFrames"] == 4


def test_fully_visible_words_keep_source_timing_through_boundary_crossfade(tmp_path):
    project, outputs = _outputs(tmp_path)
    base = _source(outputs, project.id, "Base", _tone(1000, 40), words=[
        {"text": "before", "start": 17 / RATE, "end": 19 / RATE,
         "timingTrusted": True, "timingSource": "reviewed"},
    ])
    fix = _source(outputs, project.id, "Fix", _tone(-1000, 20), words=[
        {"text": "fixed", "start": 1 / RATE, "end": 3 / RATE,
         "timingTrusted": True, "timingSource": "reviewed"},
    ])
    composition = _composition([
        VoiceCompositionLayer(id="base", name="Base", clips=[VoiceCompositionClip(
            id="base-clip", output_id=base.id, start_frame=0, source_start_frame=0, frame_count=40)]),
        VoiceCompositionLayer(id="fix", name="Fix", clips=[VoiceCompositionClip(
            id="fix-clip", output_id=fix.id, start_frame=20, source_start_frame=0, frame_count=20)]),
    ], frames=40)
    rendered = VoiceLayerCompositor(outputs, crossfade_frames=4).render(project.id, composition, base.id)
    assert [(word["text"], word["start"], word["end"]) for word in rendered.words] == [
        ("before", 17 / RATE, 19 / RATE), ("fixed", 21 / RATE, 23 / RATE),
    ]
    assert rendered.words[0]["timingTrusted"] is True and "timingNote" not in rendered.words[0]
    assert rendered.words[1]["timingTrusted"] is True
    assert "crossfaded" in rendered.words[1]["timingNote"]
    assert rendered.word_timing_quality == "source"
    assert rendered.word_timing_note is None


def test_lower_overlapping_fix_wins_and_edits_reveal_underlying_audio(tmp_path):
    project, outputs = _outputs(tmp_path)
    base = _source(outputs, project.id, "Base", _tone(1000, 20))
    first = _source(outputs, project.id, "Fix 1", _tone(2000, 10))
    second = _source(outputs, project.id, "Fix 2", _tone(3000, 10))
    composition = _composition([
        VoiceCompositionLayer(id="base", name="Base", clips=[
            VoiceCompositionClip(id="base-clip", output_id=base.id, start_frame=0, source_start_frame=0,
                                 frame_count=20),
        ]),
        VoiceCompositionLayer(id="fix-1", name="Fix 1", clips=[
            VoiceCompositionClip(id="fix-clip-1", output_id=first.id, start_frame=5, source_start_frame=0,
                                 frame_count=10),
        ]),
        VoiceCompositionLayer(id="fix-2", name="Fix 2", clips=[
            VoiceCompositionClip(id="fix-clip-2", output_id=second.id, start_frame=8, source_start_frame=0,
                                 frame_count=4),
        ]),
    ])
    compositor = VoiceLayerCompositor(outputs, crossfade_frames=0)

    def samples_for(current):
        out = compositor.render(project.id, current, base.id)
        with wave.open(str(outputs.audio_path(project.id, out.id)), "rb") as audio:
            return struct.unpack("<20h", audio.readframes(20))

    samples = samples_for(composition)
    assert samples[5:8] == (2000, 2000, 2000)
    assert samples[8:12] == (3000, 3000, 3000, 3000)
    deleted = apply_voice_composition_command(composition, VoiceCompositionCommand(
        action="delete-clip", clip_id="fix-clip-2"))
    assert samples_for(deleted)[8:12] == (2000, 2000, 2000, 2000)
    trimmed = apply_voice_composition_command(composition, VoiceCompositionCommand(
        action="trim-right", clip_id="fix-clip-2", at_frame=10))
    trimmed_samples = samples_for(trimmed)
    assert trimmed_samples[8:10] == (3000, 3000) and trimmed_samples[10:12] == (2000, 2000)
    split = apply_voice_composition_command(composition, VoiceCompositionCommand(
        action="split-clip", clip_id="fix-clip-2", at_frame=10, new_clip_id="fix-clip-2b"))
    deleted_right = apply_voice_composition_command(split, VoiceCompositionCommand(
        action="delete-clip", clip_id="fix-clip-2b"))
    assert samples_for(deleted_right)[10:12] == (2000, 2000)


@pytest.mark.parametrize("failure", ["missing", "truncated", "wrong-format", "metadata"])
def test_invalid_source_wav_fails_and_discards_reserved_output(tmp_path, failure):
    project, outputs = _outputs(tmp_path)
    source = _source(outputs, project.id, "Source", _tone(1000, 10))
    source_path = outputs.audio_path(project.id, source.id)
    if failure == "missing":
        source_path.unlink()
    elif failure == "truncated":
        source_path.write_bytes(source_path.read_bytes()[:-2])
    elif failure == "wrong-format":
        wrong = tmp_path / "wrong.wav"
        with wave.open(str(wrong), "wb") as audio:
            audio.setnchannels(2)
            audio.setsampwidth(2)
            audio.setframerate(RATE)
            audio.writeframes(b"\x00" * 40)
        source_path.write_bytes(wrong.read_bytes())
    else:
        outputs.save(project.id, source.model_copy(update={"duration": 9 / RATE}))
    composition = _composition([VoiceCompositionLayer(id="base", name="Base", clips=[
        VoiceCompositionClip(id="clip", output_id=source.id, start_frame=0, source_start_frame=0, frame_count=10),
    ])], frames=10)
    with pytest.raises(ValueError, match="source|WAV|audio|duration|PCM"):
        VoiceLayerCompositor(outputs).render(project.id, composition, source.id)
    assert [item.id for item in outputs.list(project.id)] == [source.id]


def test_cropped_source_words_are_not_published_as_trusted_cues(tmp_path):
    project, outputs = _outputs(tmp_path)
    source = _source(outputs, project.id, "Words", _tone(1000, 20), words=[
        {"text": "kept", "start": 5 / RATE, "end": 8 / RATE},
        {"text": "cropped", "start": 9 / RATE, "end": 13 / RATE},
    ])
    composition = _composition([VoiceCompositionLayer(id="base", name="Base", clips=[
        VoiceCompositionClip(id="clip", output_id=source.id, start_frame=0, source_start_frame=5,
                             frame_count=6),
    ])], frames=10)
    output = VoiceLayerCompositor(outputs, crossfade_frames=0).render(project.id, composition, source.id)
    assert [word["text"] for word in output.words] == ["kept"]
    assert output.word_timing_quality == "partial"
    assert output.word_timing_note


def test_failed_render_validation_discards_reserved_output(tmp_path, monkeypatch):
    project, outputs = _outputs(tmp_path)
    source = _source(outputs, project.id, "Source", _tone(1000, 10))
    composition = _composition([VoiceCompositionLayer(id="base", name="Base", clips=[
        VoiceCompositionClip(id="clip", output_id=source.id, start_frame=0, source_start_frame=0, frame_count=10),
    ])], frames=10)
    compositor = VoiceLayerCompositor(outputs)

    def reject_artifact(path, expected_frames):
        assert path.is_file()
        raise ValueError("Rendered WAV failed validation.")

    monkeypatch.setattr(compositor, "_validate_written_wav", reject_artifact)
    with pytest.raises(ValueError, match="failed validation"):
        compositor.render(project.id, composition, source.id)
    assert [item.id for item in outputs.list(project.id)] == [source.id]


def test_render_keeps_template_row_identity_and_maps_local_words_to_that_row(tmp_path):
    project, outputs = _outputs(tmp_path)
    base = _source(outputs, project.id, "Base", _tone(1000, 20))
    local = _source(outputs, project.id, "Local fix", _tone(2000, 10), words=[
        {"text": "fixed", "start": 2 / RATE, "end": 5 / RATE, "segmentIndex": 0},
    ])
    from app.domain.models import VoiceOutputSegment
    row = VoiceOutputSegment(row_id="stable-row", voice_id="voice", voice_name="Voice",
        speaker_profile_id="speaker", engine="fixture", generator_id="fixture", text="row text",
        start=0, end=20 / RATE)
    base_with_row = outputs.save(project.id, base.model_copy(update={"segments": [row]}))
    local_row = row.model_copy(update={"start": 0, "end": 10 / RATE})
    outputs.save(project.id, local.model_copy(update={"segments": [local_row]}))
    composition = _composition([
        VoiceCompositionLayer(id="base", name="Base", clips=[VoiceCompositionClip(
            id="base-clip", output_id=base_with_row.id, start_frame=0, source_start_frame=0, frame_count=20)]),
        VoiceCompositionLayer(id="fix", name="Fix", clips=[VoiceCompositionClip(
            id="local-clip", output_id=local.id, start_frame=5, source_start_frame=0, frame_count=10)]),
    ])
    output = VoiceLayerCompositor(outputs, crossfade_frames=0).render(project.id, composition, base_with_row.id)
    assert [(segment.row_id, segment.start, segment.end) for segment in output.segments] == [
        ("stable-row", 0, 20 / RATE)]
    assert output.words[0]["segmentIndex"] == 0
    assert output.words[0]["start"] == 7 / RATE
