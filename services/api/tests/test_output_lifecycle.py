import json
import zipfile
from pathlib import Path

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.file_voice_output_sessions import FileVoiceOutputSessions
from app.adapters.file_lipsync_sessions import FileLipSyncSessions
from app.domain.models import ProjectCreate
from app.domain.voice_script_document import VoiceScriptDocument, ScriptSentence, ScriptSegment
from test_voice_output_sessions import make_output
from test_lipsync_document import setup as lipsync_setup


def voice_fixture(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Lifecycle", location=str(tmp_path / "projects")))
    outputs = FileVoiceOutputs(projects)
    output = make_output(outputs, project.id, "Original")
    sessions = FileVoiceOutputSessions(outputs)
    book = sessions.get(project.id)
    script = sessions.scripts.save(project.id, VoiceScriptDocument(segments=[ScriptSegment(id="segment")],
        rows=[ScriptSentence(id="row", segment_id="segment", text="Own Script", voice_id="voice")]))
    sessions.save_state(project.id, book["activeVersionId"], 0, script, {"speed": 1.2})
    return project, outputs, output, sessions


def test_voice_recycle_restore_and_purge_preserve_other_versions(tmp_path):
    project, outputs, output, sessions = voice_fixture(tmp_path)
    book = sessions.get(project.id)
    original = book["activeVersionId"]
    cloned, clone = sessions.create_version(project.id, book["revision"], source_version_id=original)
    clone_id = cloned["activeVersionId"]
    before = sessions.state(project.id, clone_id)
    removed = sessions.slot_action(project.id, cloned["revision"], clone_id, "remove")
    assert removed["recycle"][0]["kind"] == "version"
    assert clone.id not in {item.id for item in outputs.list(project.id)}
    assert outputs.audio_path(project.id, clone.id).is_file()
    assert removed["activeVersionId"] is None and not sessions.scripts.get(project.id).rows
    restored = sessions.slot_action(project.id, removed["revision"], clone_id, "restore")
    assert sessions.state(project.id, clone_id) == before
    assert clone.id in {item.id for item in outputs.list(project.id)}
    removed = sessions.slot_action(project.id, restored["revision"], clone_id, "remove")
    purged = sessions.slot_action(project.id, removed["revision"], clone_id, "purge")
    assert not purged["recycle"]
    assert not (outputs.root(project.id) / clone.id).exists()
    assert outputs.audio_path(project.id, output.id).is_file()
    assert sessions.state(project.id, original).output_id == output.id


def test_restore_version_before_its_parent_session_and_empty_bin(tmp_path):
    project, outputs, output, sessions = voice_fixture(tmp_path)
    book = sessions.get(project.id)
    session_id, version_id = book["activeSessionId"], book["activeVersionId"]
    book = sessions.slot_action(project.id, book["revision"], version_id, "remove")
    book = sessions.slot_action(project.id, book["revision"], session_id, "remove")
    book = sessions.slot_action(project.id, book["revision"], version_id, "restore")
    book = sessions.slot_action(project.id, book["revision"], session_id, "restore")
    assert len(book["sessions"]) == 1 and len(book["sessions"][0]["versions"]) == 1
    assert sessions.state(project.id, version_id).script.rows[0].text == "Own Script"
    assert outputs.audio_path(project.id, output.id).is_file()
    book = sessions.slot_action(project.id, book["revision"], session_id, "remove")
    book = sessions.slot_action(project.id, book["revision"], "all", "empty-bin")
    assert not book["recycle"] and not book["sessions"]
    assert not (outputs.root(project.id) / output.id).exists()


def test_purge_refuses_audio_referenced_by_lipsync_and_live_generate(tmp_path):
    project, outputs, output, sessions = voice_fixture(tmp_path)
    book = sessions.get(project.id)
    sessions.is_busy = lambda _: True
    with pytest.raises(ValueError, match="Generate"):
        sessions.slot_action(project.id, book["revision"], book["activeSessionId"], "remove")
    sessions.is_busy = lambda _: False
    removed = sessions.slot_action(project.id, book["revision"], book["activeSessionId"], "remove")
    ref = Path(project.project_path) / "scripts/lipsync/versions/ref.json"
    ref.parent.mkdir(parents=True)
    ref.write_text(json.dumps({"document": {"audio": {"outputId": output.id}}}))
    with pytest.raises(ValueError, match="Version"):
        sessions.slot_action(project.id, removed["revision"], removed["recycle"][0]["id"], "purge")
    assert outputs.audio_path(project.id, output.id).is_file()
    assert sessions.get(project.id)["recycle"] == removed["recycle"]


def test_owned_purge_rolls_back_on_metadata_error_and_rejects_outside_paths(tmp_path):
    from app.adapters.output_artifacts import purge_owned, export_owned
    root = tmp_path / "project"
    folder = root / "assets/voice-output/owned"
    folder.mkdir(parents=True)
    (folder / "audio.wav").write_bytes(b"original")
    def fail():
        raise OSError("metadata write failed")
    with pytest.raises(OSError):
        purge_owned(root, [folder], fail)
    assert (folder / "audio.wav").read_bytes() == b"original"
    outside = tmp_path / "outside"
    outside.mkdir()
    with pytest.raises(ValueError):
        purge_owned(root, [outside], lambda: None)
    with pytest.raises(ValueError):
        export_owned(root, "session", "A", {}, [outside])


def test_voice_session_export_contains_all_version_state_and_audio(tmp_path):
    project, outputs, output, sessions = voice_fixture(tmp_path)
    book = sessions.get(project.id)
    book, clone = sessions.create_version(project.id, book["revision"], source_version_id=book["activeVersionId"])
    archive = sessions.export_slot(project.id, "session", book["activeSessionId"])
    with zipfile.ZipFile(archive) as package:
        manifest = json.loads(package.read("manifest.json"))
        assert len(manifest["sessions"][0]["versions"]) == 2
        for item in (output, clone):
            assert package.read(item.audio_path) == outputs.audio_path(project.id, item.id).read_bytes()
        assert all(not name.startswith("/") and ".." not in Path(name).parts for name in package.namelist())


def test_lipsync_last_version_recycles_its_state_and_results_but_not_sources(tmp_path):
    _, project, media, asset, store, document = lipsync_setup(tmp_path)
    store.save(project.id, document)
    sessions = FileLipSyncSessions(store)
    original = sessions.get(project.id)
    scoped = sessions.scoped(project.id, "legacy")
    job_root = scoped.jobs_root(project.id) / "render-fixture"
    job_root.mkdir(parents=True)
    (job_root / "status.json").write_text(json.dumps({"status": "completed", "kind": "render"}))
    (job_root / "result.mp4").write_bytes(b"owned-render-fixture")
    removed = sessions.slot_action(project.id, original.revision, "legacy", "remove")
    assert removed.active_version_id is None and removed.recycle[0].kind == "version"
    with pytest.raises(KeyError):
        sessions.scoped(project.id, "legacy")
    restored = sessions.slot_action(project.id, removed.revision, "legacy", "restore")
    assert sessions.scoped(project.id, "legacy").get(project.id).clips == document.clips
    removed = sessions.slot_action(project.id, restored.revision, "legacy", "remove")
    sessions.slot_action(project.id, removed.revision, "legacy", "purge")
    assert not job_root.exists()
    assert media.resolve_video_path(project.id, asset.id).is_file()


def test_lipsync_export_includes_version_state_and_owned_render(tmp_path):
    _, project, _, _, store, document = lipsync_setup(tmp_path)
    store.save(project.id, document)
    sessions = FileLipSyncSessions(store)
    job_root = store.jobs_root(project.id) / "render-fixture"
    job_root.mkdir(parents=True)
    (job_root / "status.json").write_text(json.dumps({"kind": "render", "status": "completed"}))
    result = job_root / "video.mp4"
    result.write_bytes(b"owned-video")
    exported = sessions.export_slot(project.id, "version", "legacy")
    with zipfile.ZipFile(exported) as package:
        manifest = json.loads(package.read("manifest.json"))
        assert manifest["states"]["legacy"]["document"]["clips"][0]["assetId"] == document.clips[0].asset_id
        assert package.read(result.relative_to(store.root(project.id)).as_posix()) == b"owned-video"
