from __future__ import annotations

import time
import wave
from pathlib import Path

import pytest

from app.adapters.activity_center import ActivityCenter
from app.adapters.file_voice_edits import FileVoiceEdits
from app.adapters.voice_fix import VoiceFixService
from app.domain.models import VoiceScriptRequest, VoiceScriptRow
from app.domain.voice_edits import StretchOperation, VoiceEditCommand
from app.domain.voice_script_document import VoiceScriptDocument
from test_voice_script import BlockingEngine, FakeEngine, speaker_fixture


@pytest.fixture(autouse=True)
def isolated_fix_activity(monkeypatch):
    center = ActivityCenter()
    monkeypatch.setattr("app.adapters.voice_fix.CENTER", center)
    return center


def setup_fix(tmp_path, engine=None, row_count=2):
    engine = engine or FakeEngine()
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    scripts = speaker.scripts
    fixture_rows = [
        ("r1", "Xin chào"),
        ("r2", "Tạm biệt"),
        ("r3", "Hẹn gặp lại"),
    ][:row_count]
    document = VoiceScriptDocument.model_validate({
        "segments": [{"id": "seg"}],
        "rows": [{"id": row_id, "segmentId": "seg", "text": text, "voiceId": an.id,
            "speakerProfileId": "speaker-an"} for row_id, text in fixture_rows],
    })
    saved = scripts.save(project.id, document)
    request = VoiceScriptRequest(scriptRevision=saved.revision, rows=[
        VoiceScriptRow(id=row.id, segmentId=row.segment_id, voiceId=row.voice_id, text=row.text)
        for row in saved.rows
    ])
    output_job = speaker.start(project.id, request, background=False)
    assert output_job.output is not None
    edits = FileVoiceEdits(outputs, scripts)
    return project, outputs, lease, speaker, scripts, edits, output_job.output, engine


def wait_job(service, project_id, output_id, job_id, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = service.get_job(project_id, output_id, job_id)
        if job.status not in {"queued", "running"}:
            return job
        time.sleep(.01)
    raise AssertionError("voice fix job did not finish")


def test_fix_dirties_only_changed_row_reuses_matching_row_and_noop_needs_no_gpu(tmp_path):
    project, outputs, lease, speaker, scripts, edits, output, engine = setup_fix(tmp_path)
    original_audio = outputs.audio_path(project.id, output.id).read_bytes()
    script = scripts.get(project.id)
    script.rows[1].text = "Tạm biệt nhé"
    script = scripts.save(project.id, script)
    service = VoiceFixService(speaker, edits)

    plan = service.plan(project.id, output.id)
    assert [unit.status for unit in plan.units] == ["ready", "dirty"]
    assert plan.dirty_count == 1 and plan.blockers == []
    assert plan.script_revision == script.revision and plan.edit_revision == 0

    started = service.start(project.id, output.id, script.revision, 0, plan.key)
    job = wait_job(service, project.id, output.id, started.id)
    assert job.status == "complete" and job.done == job.total == 1
    assert [unit.row_id for unit in job.units if unit.status == "complete"] == ["r2"]
    assert engine.spoken[-1] == "Tạm biệt nhé"
    assert outputs.audio_path(project.id, output.id).read_bytes() == original_audio
    assert len(outputs.list(project.id)) == 1
    protected = {unit.clip for unit in job.units if unit.clip}
    assert protected <= service.protected_clips(project.id)
    assert any(provider(project.id) == service.protected_clips(project.id)
        for provider in outputs.clip_reference_providers)
    assert lease.holder() is None

    replay = service.plan(project.id, output.id)
    assert replay.dirty_count == 0 and all(unit.status == "ready" for unit in replay.units)
    noop = service.start(project.id, output.id, script.revision, 0, replay.key)
    assert noop.status == "complete" and noop.total == noop.done == 0
    assert len(engine.spoken) == 3  # two original rows plus the one changed row
    assert lease.holder() is None


def test_fix_rejects_stale_plan_and_nonmatching_script_shape(tmp_path):
    project, _outputs, _lease, speaker, scripts, edits, output, _engine = setup_fix(tmp_path)
    service = VoiceFixService(speaker, edits)
    plan = service.plan(project.id, output.id)
    script = scripts.get(project.id)
    script.rows[0].text = "Đã sửa"
    scripts.save(project.id, script)
    with pytest.raises(ValueError, match="Script changed"):
        service.start(project.id, output.id, plan.script_revision, plan.edit_revision, plan.key)

    script = scripts.get(project.id)
    script.rows.reverse()
    scripts.save(project.id, script)
    blocked = service.plan(project.id, output.id)
    assert blocked.blockers
    assert all(unit.status == "blocked" for unit in blocked.units)


def test_fix_maps_whole_row_stretch_duration_and_blocks_partial_or_conflicting_stretch(tmp_path):
    project, _outputs, _lease, speaker, scripts, edits, output, _engine = setup_fix(tmp_path)
    segment = output.segments[0]
    start = round(segment.start * 24000)
    end = round(segment.end * 24000)
    edit = edits.change(project.id, output.id, VoiceEditCommand(revision=0, scriptRevision=scripts.get(project.id).revision,
        operation=StretchOperation(startFrame=start, endFrame=end, targetFrames=(end - start) * 3 // 2)))
    service = VoiceFixService(speaker, edits)
    plan = service.plan(project.id, output.id)
    assert plan.edit_revision == edit.revision
    assert plan.units[0].status == "dirty"
    assert plan.units[0].desired_duration == pytest.approx((end - start) * 1.5 / 24000)

    edits.change(project.id, output.id, VoiceEditCommand(revision=edit.revision, scriptRevision=scripts.get(project.id).revision,
        operation=StretchOperation(startFrame=start + 2400, endFrame=start + (end - start) * 3 // 2 - 2400,
            targetFrames=(end - start) * 3 // 4)))
    partial = service.plan(project.id, output.id)
    assert "whole-row" in " ".join(partial.blockers).lower()
    assert all(unit.status == "blocked" for unit in partial.units)

    # A changed explicit duration and a different stretched target is a conflict.
    script = scripts.get(project.id)
    script.rows[0].settings.duration = 2.0
    script = scripts.save(project.id, script)
    conflict = service.plan(project.id, output.id)
    assert conflict.script_revision == script.revision
    assert conflict.blockers


def test_fix_blocks_stretched_duration_when_engine_is_not_native_duration_capable(tmp_path):
    project, _outputs, _lease, speaker, scripts, edits, output, _engine = setup_fix(tmp_path)
    segment = output.segments[0]
    start, end = round(segment.start * 24000), round(segment.end * 24000)
    edits.change(project.id, output.id, VoiceEditCommand(revision=0,
        scriptRevision=scripts.get(project.id).revision,
        operation=StretchOperation(startFrame=start, endFrame=end, targetFrames=(end - start) * 3 // 2)))
    original_plan = speaker._plan

    def non_native_plan(project_id, request):
        steps = original_plan(project_id, request)
        steps[0].plan.engine = "vibevoice"
        return steps

    speaker._plan = non_native_plan
    plan = VoiceFixService(speaker, edits).plan(project.id, output.id)
    assert plan.blockers
    assert "does not support native duration" in " ".join(plan.blockers)
    assert all(unit.status == "blocked" for unit in plan.units)


def test_fix_failure_keeps_successful_clip_checkpoint_for_retry(tmp_path):
    engine = FakeEngine()
    project, _outputs, lease, speaker, scripts, edits, output, _ = setup_fix(tmp_path, engine)
    script = scripts.get(project.id)
    script.rows[0].text = "Mới lỗi"
    script.rows[1].text = "Mới thành công"
    script = scripts.save(project.id, script)
    engine.fail_on = "Mới thành công"
    service = VoiceFixService(speaker, edits)
    plan = service.plan(project.id, output.id)
    job = wait_job(service, project.id, output.id,
        service.start(project.id, output.id, script.revision, 0, plan.key).id)
    assert job.status == "failed" and job.done == 1
    assert any(unit.status == "complete" for unit in job.units)
    assert lease.holder() is None

    engine.fail_on = None
    retry_plan = service.plan(project.id, output.id)
    assert retry_plan.dirty_count == 1
    retry = wait_job(service, project.id, output.id,
        service.start(project.id, output.id, script.revision, 0, retry_plan.key).id)
    assert retry.status == "complete" and retry.done == 1 and retry.total == 1
    assert retry.units[0].row_id == "r2" and retry.units[0].status == "complete"


def test_fix_does_not_mark_a_clip_complete_after_script_changes_during_inference(tmp_path, isolated_fix_activity):
    engine = BlockingEngine()
    project, outputs, lease, speaker, scripts, edits, output, _ = setup_fix(tmp_path, engine)
    script = scripts.get(project.id)
    script.rows[0].text = "Mới đang đọc"
    script = scripts.save(project.id, script)
    service = VoiceFixService(speaker, edits)
    plan = service.plan(project.id, output.id)
    started = service.start(project.id, output.id, script.revision, 0, plan.key)
    assert engine.entered.wait(3)
    task, = isolated_fix_activity.tasks()
    assert task.id == f"tts:{started.id}" and task.status == "running"
    assert task.project_id == project.id and "Voice Fix" in task.label
    current = scripts.get(project.id)
    current.rows[0].text = "Sửa mới hơn"
    scripts.save(project.id, current)
    engine.release.set()
    job = wait_job(service, project.id, output.id, started.id)
    assert job.status == "stale" and job.done == 0
    task, = isolated_fix_activity.tasks()
    assert task.status == "failed" and task.fraction == 0 and task.error
    assert not any(unit.status == "complete" for unit in job.units)
    assert lease.holder() is None
    assert len(outputs.list(project.id)) == 1


def test_fix_thread_start_failure_marks_reserved_job_and_activity_failed(tmp_path, monkeypatch, isolated_fix_activity):
    project, _outputs, _lease, speaker, scripts, edits, output, _engine = setup_fix(tmp_path)
    script = scripts.get(project.id)
    script.rows[0].text = "Câu thay đổi"
    script = scripts.save(project.id, script)
    service = VoiceFixService(speaker, edits)
    plan = service.plan(project.id, output.id)

    def fail_start(_thread):
        raise RuntimeError("thread start denied")

    monkeypatch.setattr("app.adapters.voice_fix.threading.Thread.start", fail_start)
    with pytest.raises(RuntimeError, match="thread start denied"):
        service.start(project.id, output.id, script.revision, 0, plan.key)

    task, = isolated_fix_activity.tasks()
    assert task.status == "failed" and "thread start denied" in (task.error or "")
    job = service._read_job(project.id, output.id, task.id.removeprefix("tts:"))
    assert job.status == "failed"


def test_fix_queue_stop_finishes_current_unit_and_leaves_next_dirty(tmp_path):
    engine = BlockingEngine()
    project, _outputs, lease, speaker, scripts, edits, output, _ = setup_fix(tmp_path, engine)
    # Fixture synthesis used this fake once; reset its synchronization state for the Fix job.
    engine.entered.clear()
    engine.release.clear()
    script = scripts.get(project.id)
    script.rows[0].text = "Đổi một"
    script.rows[1].text = "Đổi hai"
    script = scripts.save(project.id, script)
    service = VoiceFixService(speaker, edits)
    plan = service.plan(project.id, output.id)
    started = service.start(project.id, output.id, script.revision, 0, plan.key)
    assert engine.entered.wait(3)
    service.stop(project.id, output.id, started.id, include_active=False)
    engine.release.set()
    job = wait_job(service, project.id, output.id, started.id)
    assert job.status == "stopped" and job.done == 1 and job.total == 2
    assert [unit.row_id for unit in job.units if unit.status == "complete"] == ["r1"]
    assert lease.holder() is None


def test_fix_maps_sequential_whole_row_stretches_in_the_edited_clock(tmp_path):
    project, _outputs, _lease, speaker, scripts, edits, output, _engine = setup_fix(tmp_path, row_count=3)
    script_revision = scripts.get(project.id).revision
    rate = 24000
    row1 = output.segments[0]
    row1_start, row1_end = round(row1.start * rate), round(row1.end * rate)
    first_target = (row1_end - row1_start) * 3 // 2
    edit = edits.change(project.id, output.id, VoiceEditCommand(revision=0, scriptRevision=script_revision,
        operation=StretchOperation(startFrame=row1_start, endFrame=row1_end, targetFrames=first_target)))

    row2 = output.segments[1]
    current = edits.get(project.id, output.id)
    row2_start = round(current.map_seconds(row2.start) * rate)
    row2_end = round(current.map_seconds(row2.end) * rate)
    second_target = (row2_end - row2_start) * 3 // 4
    edits.change(project.id, output.id, VoiceEditCommand(revision=edit.revision, scriptRevision=script_revision,
        operation=StretchOperation(startFrame=row2_start, endFrame=row2_end, targetFrames=second_target)))

    plan = VoiceFixService(speaker, edits).plan(project.id, output.id)
    assert plan.blockers == []
    assert [unit.status for unit in plan.units] == ["dirty", "dirty", "ready"]
    assert plan.units[0].desired_duration == pytest.approx(first_target / rate)
    assert plan.units[1].desired_duration == pytest.approx(second_target / rate)



def test_fix_service_close_cancels_and_joins_owned_job(tmp_path):
    engine = BlockingEngine()
    engine.release.set()
    project, _outputs, lease, speaker, scripts, edits, output, _ = setup_fix(tmp_path, engine)
    engine.entered.clear()
    engine.release.clear()
    engine.cancelable = True
    script = scripts.get(project.id)
    script.rows[0].text = "Đang tổng hợp"
    script = scripts.save(project.id, script)
    service = VoiceFixService(speaker, edits)
    plan = service.plan(project.id, output.id)
    started = service.start(project.id, output.id, script.revision, 0, plan.key)
    assert engine.entered.wait(3)

    service.close(timeout=2)

    job = service.get_job(project.id, output.id, started.id)
    assert job.status == "cancelled"
    assert not service._threads
    assert lease.holder() is None


def test_fix_receipt_is_project_owned_and_survives_service_reopen(tmp_path):
    project, _outputs, _lease, speaker, scripts, edits, output, _engine = setup_fix(tmp_path)
    script = scripts.get(project.id)
    script.rows[0].text = "Sửa"
    script = scripts.save(project.id, script)
    service = VoiceFixService(speaker, edits)
    plan = service.plan(project.id, output.id)
    job = service.start(project.id, output.id, script.revision, 0, plan.key)
    completed = wait_job(service, project.id, output.id, job.id)
    assert completed.status == "complete"
    reopened = VoiceFixService(speaker, edits).get_job(project.id, output.id, job.id)
    assert reopened == completed
    path = service.job_path(project.id, job.id)
    assert path.is_relative_to(service.outputs.root(project.id).parents[1])


def test_poll_retries_transient_sharing_denial_without_losing_job(tmp_path, monkeypatch):
    project, _, _, speaker, _, edits, output, _ = setup_fix(tmp_path)
    service = VoiceFixService(speaker, edits)
    plan = service.plan(project.id, output.id)
    job = service.start(project.id, output.id, plan.script_revision, plan.edit_revision, plan.key)
    target = service.job_path(project.id, job.id)
    original = Path.read_text
    denied = []
    def transient(path, *args, **kwargs):
        if path == target and not denied:
            denied.append(True)
            raise PermissionError(13, "temporarily shared", str(path))
        return original(path, *args, **kwargs)
    monkeypatch.setattr(Path, "read_text", transient)
    assert service.get_job(project.id, output.id, job.id).status == "complete"
    assert denied == [True]


def test_adopted_duration_target_blocks_engine_without_native_duration(tmp_path, monkeypatch):
    from dataclasses import replace
    project, outputs, _, speaker, _, edits, output, _ = setup_fix(tmp_path)
    output.parameters["fix"] = {"sampleRate": 24000, "durationTargets": {"r1": 12000}}
    outputs.save(project.id, output)
    original = speaker._plan
    def other_engine(*args, **kwargs):
        steps = original(*args, **kwargs)
        for step in steps:
            step.plan = replace(step.plan, engine="vibevoice")
        return steps
    monkeypatch.setattr(speaker, "_plan", other_engine)
    plan = VoiceFixService(speaker, edits).plan(project.id, output.id)
    assert plan.blockers and all(unit.status == "blocked" for unit in plan.units)
