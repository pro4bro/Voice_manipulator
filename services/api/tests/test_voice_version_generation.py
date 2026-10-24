"""End-to-end checks for Version-bound Full and local Fix publication."""
from __future__ import annotations

import hashlib
import wave

import pytest

from app.adapters.file_voice_output_sessions import FileVoiceOutputSessions
from app.adapters.voice_version_generation import VoiceVersionGeneration
from app.domain.models import VoiceScriptRequest, VoiceScriptRow
from app.domain.voice_script_document import ScriptSegment, ScriptSentence, VoiceScriptDocument
from app.adapters.file_voice_script import ScriptRevisionConflict
from test_voice_script import FakeEngine, speaker_fixture


def _script(rows: list[tuple[str, str, str]], revision: int = 0) -> VoiceScriptDocument:
    return VoiceScriptDocument(
        revision=revision,
        segments=[ScriptSegment(id="segment-1", name="Narration")],
        rows=[ScriptSentence(id=row_id, text=text, voice_id=voice_id,
            speaker_profile_id="speaker-an", segment_id="segment-1")
            for row_id, text, voice_id in rows],
    )


def _setup(tmp_path, engine=None):
    engine = engine or FakeEngine()
    project, an, _binh, outputs, _lease, speaker, _recognizer = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    sessions = FileVoiceOutputSessions(outputs, speaker.scripts)
    speaker.scripts.after_save = sessions.capture_active_script
    book = sessions.get(project.id)
    assert len(book["sessions"]) == 1 and book["sessions"][0]["versions"][0]["outputId"] is None
    version_id = book["activeVersionId"]
    script = speaker.scripts.save(project.id, _script([
        ("row-1", "alpha bravo charlie delta", an.id), ("row-2", "echo", an.id),
    ],
        revision=speaker.scripts.get(project.id).revision))
    state = sessions.state(project.id, version_id)
    return project, an, outputs, speaker, sessions, version_id, script, VoiceVersionGeneration(sessions, speaker)


def _full(project, an, speaker, sessions, version_id, script, generation, *, text_override=None):
    state = sessions.state(project.id, version_id)
    rows = [VoiceScriptRow(id=row.id, voice_id=row.voice_id or an.id,
        text=text_override if text_override is not None and row.id == "row-1" else row.text,
        segment_id=row.segment_id, settings={}) for row in script.rows if row.text.strip()]
    request = VoiceScriptRequest(version_id=version_id, version_revision=state.revision,
        script_revision=script.revision, rows=rows, force_regenerate=True, gap_seconds=0)
    job_id = speaker.reserve(project.id, request)
    generation.bind_full(project.id, request, job_id)
    return speaker.start(project.id, request, reserved_job_id=job_id, background=False)


def _edit_script(speaker, project, old, text):
    changed = old.model_copy(update={
        "revision": speaker.scripts.get(project.id).revision,
        "rows": [old.rows[0].model_copy(update={"text": text}), *old.rows[1:]],
    })
    return speaker.scripts.save(project.id, changed)


def _read_pcm(path):
    with wave.open(str(path), "rb") as audio:
        assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) == (1, 2, 24000, "NONE")
        frames = audio.getnframes()
        data = audio.readframes(frames)
        assert frames > 0 and len(data) == frames * 2
        return frames, data


def test_full_and_repeated_fix_publish_bottom_wins_in_current_version(tmp_path):
    project, an, outputs, speaker, sessions, version_id, script, generation = _setup(tmp_path)
    first = _full(project, an, speaker, sessions, version_id, script, generation)
    assert first.status == "complete" and first.output is not None
    base = first.output
    assert sessions.state(project.id, version_id).output_id == base.id
    assert len(sessions.get(project.id)["sessions"]) == 1
    assert len(sessions.find(sessions.get(project.id), version_id)[1]["state"]["composition"]["layers"]) == 1
    _read_pcm(outputs.audio_path(project.id, base.id))

    changed = _edit_script(speaker, project, script, "alpha bright charlie delta")
    state = sessions.state(project.id, version_id)
    first_fix = generation.start_fix(project.id, version_id, state.revision, background=False)
    assert first_fix.status == "complete" and first_fix.output is not None
    first_composition = sessions.state(project.id, version_id).composition
    assert first_composition is not None and len(first_composition["layers"]) == 2
    first_fix_clip = first_composition["layers"][1]["clips"][0]
    assert first_fix_clip["outputId"] != base.id
    composed_frames, composed_pcm = _read_pcm(outputs.audio_path(project.id, first_fix.output.id))
    assert composed_frames == first_composition["durationFrames"]

    # A second edit against the same Full baseline occupies a still-lower layer,
    # so the newest local PCM wins even though the older Fix covers the same span.
    _edit_script(speaker, project, changed, "alpha brighter charlie delta")
    state = sessions.state(project.id, version_id)
    second_fix = generation.start_fix(project.id, version_id, state.revision, background=False)
    assert second_fix.status == "complete" and second_fix.output is not None
    final_state = sessions.state(project.id, version_id)
    assert final_state.output_id == second_fix.output.id
    assert len(final_state.composition["layers"]) == 3
    old_clip = final_state.composition["layers"][1]["clips"][0]
    new_clip = final_state.composition["layers"][2]["clips"][0]
    assert old_clip["startFrame"] == new_clip["startFrame"]
    assert old_clip["frameCount"] == new_clip["frameCount"]
    newest_frames, newest_pcm = _read_pcm(outputs.audio_path(project.id, second_fix.output.id))
    assert newest_frames == composed_frames
    assert newest_pcm == composed_pcm  # identical FakeEngine tone; composition is frame-exact
    assert len(sessions.get(project.id)["sessions"]) == 1
    assert sessions.get(project.id)["activeVersionId"] == version_id
    with pytest.raises(ValueError, match="no.*Fix|đoạn mới sửa"):
        generation.start_fix(project.id, version_id, final_state.revision, background=False)


def test_full_rerun_resets_fix_layers_without_creating_a_session(tmp_path):
    project, an, outputs, speaker, sessions, version_id, script, generation = _setup(tmp_path)
    initial = _full(project, an, speaker, sessions, version_id, script, generation)
    changed = _edit_script(speaker, project, script, "alpha changed charlie delta")
    state = sessions.state(project.id, version_id)
    fix = generation.start_fix(project.id, version_id, state.revision, background=False)
    assert fix.status == "complete"
    fixed = sessions.state(project.id, version_id)
    assert len(fixed.composition["layers"]) > 1

    rerun = _full(project, an, speaker, sessions, version_id, changed, generation)
    assert rerun.status == "complete" and rerun.output is not None
    state = sessions.state(project.id, version_id)
    assert state.output_id == rerun.output.id != initial.output.id
    assert len(state.composition["layers"]) == 1
    assert state.composition["layers"][0]["clips"][0]["outputId"] == rerun.output.id
    assert len(sessions.get(project.id)["sessions"]) == 1


def test_clone_copies_version_script_config_composition_and_audio_independently(tmp_path):
    project, an, outputs, speaker, sessions, version_id, script, generation = _setup(tmp_path)
    full = _full(project, an, speaker, sessions, version_id, script, generation)
    changed = _edit_script(speaker, project, script, "alpha fixed charlie delta")
    state = sessions.state(project.id, version_id)
    fix = generation.start_fix(project.id, version_id, state.revision, background=False)
    assert fix.status == "complete"

    source = sessions.state(project.id, version_id)
    source_ids = set(source.owned_output_ids)
    source_hashes = {item: hashlib.sha256(outputs.audio_path(project.id, item).read_bytes()).hexdigest() for item in source_ids}
    book = sessions.get(project.id)
    cloned_book, cloned_output = sessions.create_version(project.id, book["revision"], source_version_id=version_id)
    clone_id = cloned_book["activeVersionId"]
    clone = sessions.state(project.id, clone_id)
    assert clone_id != version_id and cloned_output is not None
    assert len(sessions.get(project.id)["sessions"]) == 1
    assert clone.script.model_copy(update={"revision": source.script.revision}) == source.script
    assert clone.generated_script == source.generated_script
    assert clone.config == source.config and clone.generated_config == source.generated_config
    assert clone.composition is not None and source.composition is not None
    source_clip_ids = {clip["outputId"] for layer in source.composition["layers"] for clip in layer["clips"]}
    clone_clip_ids = {clip["outputId"] for layer in clone.composition["layers"] for clip in layer["clips"]}
    assert len(source_clip_ids) == len(clone_clip_ids) and source_clip_ids.isdisjoint(clone_clip_ids)
    mapping = {output.parameters["voiceOutputVersion"]["sourceOutputId"]: output.id
        for output in outputs.list(project.id) if output.parameters.get("voiceOutputVersion", {}).get("versionId") == clone_id}
    assert {mapping[item] for item in source_clip_ids} == clone_clip_ids
    assert mapping[source.output_id] == clone.output_id
    for source_id, digest in source_hashes.items():
        assert hashlib.sha256(outputs.audio_path(project.id, source_id).read_bytes()).hexdigest() == digest
    for cloned_id in clone_clip_ids:
        _read_pcm(outputs.audio_path(project.id, cloned_id))
    assert changed.rows[0].text == "alpha fixed charlie delta"
    assert full.output.id != source.output_id


@pytest.mark.parametrize("stale_change", ["version", "script"])
def test_generation_refuses_commit_when_version_or_script_changes_midflight(tmp_path, stale_change):
    class MutatingEngine(FakeEngine):
        callback = None

        def request(self, payload):
            if self.callback:
                callback, self.callback = self.callback, None
                callback()
            return super().request(payload)

    engine = MutatingEngine()
    project, an, outputs, speaker, sessions, version_id, script, generation = _setup(tmp_path, engine)
    before = _full(project, an, speaker, sessions, version_id, script, generation)
    previous_output = sessions.state(project.id, version_id).output_id
    changed = _edit_script(speaker, project, script, "alpha edited charlie delta")

    def stale_version():
        state = sessions.state(project.id, version_id)
        sessions.save_state(project.id, version_id, state.revision, state.script, {"changed": True})

    output_ids_before = {output.id for output in outputs.list(project.id)}

    def stale_script():
        current = speaker.scripts.get(project.id)
        edited = current.model_copy(update={"rows": [current.rows[0].model_copy(update={"text": "alpha concurrent charlie delta"}), *current.rows[1:]]})
        speaker.scripts.save(project.id, edited)

    engine.callback = stale_version if stale_change == "version" else stale_script
    state = sessions.state(project.id, version_id)
    failed = generation.start_fix(project.id, version_id, state.revision, background=False)
    assert failed.status == "failed"
    assert failed.error and ("Version" in failed.error or "Script" in failed.error or "đổi" in failed.error)
    current = sessions.state(project.id, version_id)
    assert current.output_id == previous_output
    assert current.composition is not None and len(current.composition["layers"]) == 1
    assert before.output.id == previous_output
    assert {output.id for output in outputs.list(project.id)} == output_ids_before
    if stale_change == "script":
        assert current.script.rows[0].text == "alpha concurrent charlie delta"
    else:
        assert current.config == {"changed": True}


@pytest.mark.parametrize("stale_change", ["version", "script"])
def test_full_generation_refuses_commit_when_version_or_script_changes_midflight(tmp_path, stale_change):
    class MutatingEngine(FakeEngine):
        callback = None

        def request(self, payload):
            if self.callback:
                callback, self.callback = self.callback, None
                callback()
            return super().request(payload)

    engine = MutatingEngine()
    project, an, outputs, speaker, sessions, version_id, script, generation = _setup(tmp_path, engine)

    def stale_version():
        state = sessions.state(project.id, version_id)
        sessions.save_state(project.id, version_id, state.revision, state.script, {"concurrent": True})

    def stale_script():
        current = speaker.scripts.get(project.id)
        edited = current.model_copy(update={"rows": [
            current.rows[0].model_copy(update={"text": "alpha concurrent charlie delta"}), *current.rows[1:]
        ]})
        speaker.scripts.save(project.id, edited)

    engine.callback = stale_version if stale_change == "version" else stale_script
    failed = _full(project, an, speaker, sessions, version_id, script, generation)
    assert failed.status == "failed" and failed.output is None
    state = sessions.state(project.id, version_id)
    assert state.output_id is None and state.composition is None
    assert outputs.list(project.id) == []
    assert sessions.get(project.id)["activeVersionId"] == version_id
    assert len(sessions.get(project.id)["sessions"]) == 1


def test_script_change_during_fix_composition_cannot_publish_stale_audio(tmp_path, monkeypatch):
    from app.adapters.voice_layer_compositor import VoiceLayerCompositor

    project, _an, outputs, speaker, sessions, version_id, script, generation = _setup(tmp_path)
    full = _full(project, _an, speaker, sessions, version_id, script, generation)
    changed = _edit_script(speaker, project, script, "alpha changed charlie delta")
    state = sessions.state(project.id, version_id)
    before_ids = {item.id for item in outputs.list(project.id)}
    original_render = VoiceLayerCompositor.render

    def save_new_script_before_publish(compositor, project_id, composition, template_output_id):
        current = speaker.scripts.get(project.id)
        next_script = current.model_copy(update={"rows": [
            current.rows[0].model_copy(update={"text": "alpha concurrent charlie delta"}), *current.rows[1:]
        ]})
        speaker.scripts.save(project.id, next_script)
        return original_render(compositor, project_id, composition, template_output_id)

    monkeypatch.setattr(VoiceLayerCompositor, "render", save_new_script_before_publish)
    failed = generation.start_fix(project.id, version_id, state.revision, background=False)
    assert failed.status == "failed" and failed.output is None
    current = sessions.state(project.id, version_id)
    assert current.output_id == full.output.id
    assert current.script.rows[0].text == "alpha concurrent charlie delta"
    assert len(current.composition["layers"]) == 1
    assert {item.id for item in outputs.list(project.id)} == before_ids
    assert changed.rows[0].text == "alpha changed charlie delta"


def test_script_change_at_full_publish_boundary_cannot_commit_candidate(tmp_path, monkeypatch):
    project, _an, outputs, speaker, sessions, version_id, script, generation = _setup(tmp_path)
    original_publish = sessions.publish

    def mutate_script_then_publish(project_id, captured_version, expected_revision, output, generated_script,
            config, composition=None, full=False, expected_script=None):
        current = speaker.scripts.get(project.id)
        next_script = current.model_copy(update={"rows": [
            current.rows[0].model_copy(update={"text": "alpha changed while saving charlie delta"}), *current.rows[1:]
        ]})
        speaker.scripts.save(project.id, next_script)
        return original_publish(project_id, captured_version, expected_revision, output, generated_script,
            config, composition, full, expected_script)

    monkeypatch.setattr(sessions, "publish", mutate_script_then_publish)
    failed = _full(project, _an, speaker, sessions, version_id, script, generation)
    assert failed.status == "failed" and failed.output is None
    state = sessions.state(project.id, version_id)
    assert state.output_id is None and state.composition is None
    assert outputs.list(project.id) == []
    assert state.script.rows[0].text == "alpha changed while saving charlie delta"
