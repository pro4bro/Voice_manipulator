import shutil
import wave
import pytest
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.adapters.file_voice_edits import FileVoiceEdits
from app.domain.models import ProjectCreate, VoiceOutput, VoiceOutputSegment
from app.domain.voice_script_document import VoiceScriptDocument
from app.domain.voice_edits import VoiceEditDocument, VoiceEditCommand, StretchOperation, apply_command


def base():
    return VoiceEditDocument(output_id="o", source_sha256="hash", sample_rate=24000, source_frames=240000)


def test_stretch_maps_inside_and_offsets_downstream_without_touching_prefix():
    op = StretchOperation(startFrame=48000, endFrame=96000, targetFrames=72000)
    assert [op.map_frame(n) for n in [0, 48000, 72000, 96000, 120000]] == [0, 48000, 84000, 120000, 144000]
    doc = apply_command(base(), VoiceEditCommand(revision=0, scriptRevision=0, operation=op))
    assert doc.frames == 264000
    assert doc.map_seconds(5) == 6


def test_undo_redo_fork_and_both_handle_commands_are_one_transaction():
    for edge in ["left", "right"]:
        doc = apply_command(base(), VoiceEditCommand(revision=0, scriptRevision=0, operation=StretchOperation(startFrame=0, endFrame=48000, targetFrames=24000, edge=edge)))
        undo = apply_command(doc, VoiceEditCommand(revision=1, scriptRevision=0, action="undo"))
        assert undo.frames == base().frames
        assert apply_command(undo, VoiceEditCommand(revision=2, scriptRevision=0, action="redo")).frames == doc.frames
        fork = apply_command(undo, VoiceEditCommand(revision=2, scriptRevision=0, operation=StretchOperation(startFrame=0, endFrame=24000, targetFrames=48000)))
        assert len(fork.operations) == 1
        assert fork.frames == 264000


@pytest.mark.parametrize("start,end,target", [(0, 0, 5), (-1, 4, 4), (0, 10, 1), (0, 10, 30)])
def test_invalid_stretch_is_not_a_trim(start, end, target):
    with pytest.raises(ValueError):
        StretchOperation(startFrame=start, endFrame=end, targetFrames=target)


def test_stale_revision_and_outside_audio_rejected():
    with pytest.raises(ValueError):
        apply_command(base(), VoiceEditCommand(revision=1, scriptRevision=0, action="undo"))
    with pytest.raises(ValueError):
        apply_command(base(), VoiceEditCommand(revision=0, scriptRevision=0, operation=StretchOperation(startFrame=0, endFrame=250000, targetFrames=250000)))


def setup_store(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Ripple", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    oid, audio = outputs.reserve(project.id)
    with wave.open(str(audio), "wb") as pcm:
        pcm.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        pcm.writeframes(b"\x01\x00" * 240000)
    meta = dict(voice_id="v", voice_name="V", speaker_profile_id="s", engine="omnivoice", generator_id="clone", text="Hello")
    outputs.save(project.id, VoiceOutput(id=oid, name="Output", audio_path="audio.wav", duration=10,
        words=[{"start": 2, "end": 3, "text": "Hello"}],
        segments=[VoiceOutputSegment(row_id="r", start=2, end=4, **meta)], **meta))
    scripts = FileVoiceScript(projects)
    scripts.save(project.id, VoiceScriptDocument.model_validate({"segments": [{"id": "seg"}], "rows": [{"id": "r", "segmentId": "seg", "text": "Hello"}]}))
    return projects, project, oid, FileVoiceEdits(outputs, scripts)


def test_store_move_reopen_mapping_and_original_bytes(tmp_path):
    projects, project, oid, store = setup_store(tmp_path)
    original = store.outputs.audio_path(project.id, oid).read_bytes()
    op = StretchOperation(startFrame=48000, endFrame=96000, targetFrames=72000, edge="left")
    cmd = VoiceEditCommand(revision=0, scriptRevision=1, operation=op)
    saved = store.change(project.id, oid, cmd)
    assert store.mapped_output(project.id, oid, saved).words[0]["end"] == 3.5
    with pytest.raises(ScriptRevisionConflict):
        store.change(project.id, oid, cmd)
    moved = tmp_path / "moved"
    shutil.move(project.project_path, moved)
    projects.open(moved)
    assert store.get(project.id, oid) == saved
    assert store.outputs.audio_path(project.id, oid).read_bytes() == original


def test_no_active_edit_preserves_word_trust_for_rendered_or_fixed_output(tmp_path):
    _, project, oid, store = setup_store(tmp_path)
    output = store.outputs.get(project.id, oid)
    output.words[0]["timingTrusted"] = True
    store.outputs.save(project.id, output)
    unchanged = store.mapped_output(project.id, oid, store.get(project.id, oid))
    assert unchanged.words[0]["timingTrusted"] is True


@pytest.mark.parametrize("scope", ["clip", "segment", "sentence"])
def test_budgets_and_locked_sentence_conflict_before_any_edit(tmp_path, scope):
    _, project, oid, store = setup_store(tmp_path)
    script = store.scripts.get(project.id)
    target = script.settings if scope == "clip" else script.segments[0].settings if scope == "segment" else script.rows[0].settings
    target.duration = 2
    if scope == "sentence":
        target.locked = ["duration"]
    store.scripts.save(project.id, script)
    with pytest.raises(ValueError):
        store.change(project.id, oid, VoiceEditCommand(revision=0, scriptRevision=2,
            operation=StretchOperation(startFrame=48000, endFrame=96000, targetFrames=72000)))
    assert store.get(project.id, oid).revision == 0
