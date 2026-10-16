from __future__ import annotations

import hashlib
import json
import struct
import wave
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.voice_edit_preview import VoiceEditPreview
from app.adapters.voice_fix import VoiceFixService
from app.adapters.voice_fix_apply import VoiceFixApply
from app.adapters.voice_fix_apply_routes import make_voice_fix_apply_router
from app.domain.voice_edits import StretchOperation, VoiceEditCommand
from test_voice_fix import setup_fix, wait_job


def read_pcm(path: Path) -> tuple[tuple[int, int, int], bytes]:
    with wave.open(str(path), "rb") as audio:
        params = (audio.getnchannels(), audio.getsampwidth(), audio.getframerate())
        return params, audio.readframes(audio.getnframes())


def fake_preview_stretch(source: Path, destination: Path, operations: list[dict]):
    _, pcm = read_pcm(source)
    for operation in operations:
        start, end, target = operation["startFrame"], operation["endFrame"], operation["targetFrames"]
        prefix, region, suffix = pcm[:start * 2], pcm[start * 2:end * 2], pcm[end * 2:]
        if target <= 0:
            raise ValueError("invalid test target")
        # Fixtures use constant PCM inside speech and silence in pauses. Keep the
        # deterministic sample while changing only the selected interval length.
        sample = region[:2]
        if not sample:
            sample = b"\0\0"
        pcm = prefix + sample * target + suffix
    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(pcm)
    return {"actualFrames": len(pcm) // 2, "clippedSamples": 0}


def make_services(tmp_path):
    project, outputs, lease, speaker, scripts, edits, output, engine = setup_fix(tmp_path)
    fixes = VoiceFixService(speaker, edits)
    apply = VoiceFixApply(fixes)
    return project, outputs, lease, speaker, scripts, edits, output, engine, fixes, apply


def run_dirty_fix(project, scripts, edits, output, speaker, fixes, row_text: str):
    script = scripts.get(project.id)
    script.rows[0].text = row_text
    script = scripts.save(project.id, script)
    plan = fixes.plan(project.id, output.id)
    started = fixes.start(project.id, output.id, script.revision, edits.get(project.id, output.id).revision, plan.key)
    job = wait_job(fixes, project.id, output.id, started.id)
    assert job.status == "complete", job.error
    return script, fixes.plan(project.id, output.id)


def test_apply_replaces_only_dirty_clip_and_preserves_other_pcm_and_pause(tmp_path):
    project, outputs, _lease, speaker, scripts, edits, source_output, _engine, fixes, apply = make_services(tmp_path)
    source_path = outputs.audio_path(project.id, source_output.id)
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    _, source_pcm = read_pcm(source_path)
    script, plan = run_dirty_fix(project, scripts, edits, source_output, speaker, fixes, "Mới đã xong")
    assert plan.dirty_count == 0 and all(unit.status == "ready" for unit in plan.units)

    packet = apply.apply(project.id, source_output.id, script.revision, plan.edit_revision, plan.key)

    result = packet["output"]
    assert result.id != source_output.id
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source_hash
    params, result_pcm = read_pcm(outputs.audio_path(project.id, result.id))
    assert params == (1, 2, 24000)
    first_row = packet["report"]["rows"][0]
    second_row = packet["report"]["rows"][1]
    assert result_pcm[:first_row["outputEndFrame"] * 2] == b"\x10\0" * first_row["outputEndFrame"]
    # Original pause and untouched second-row speech remain sample-identical.
    assert result_pcm[first_row["outputEndFrame"] * 2:second_row["outputStartFrame"] * 2] == source_pcm[12000 * 2:20400 * 2]
    assert result_pcm[second_row["outputStartFrame"] * 2:] == source_pcm[20400 * 2:]
    assert result.segments[1].start == pytest.approx(second_row["outputStartFrame"] / 24000, abs=1 / 24000)
    assert packet["sourceOutputId"] == source_output.id
    assert packet["report"]["rows"][0]["action"] == "replaced"
    assert packet["report"]["rows"][1]["action"] == "reused"
    assert fixes.plan(project.id, result.id).dirty_count == 0


def test_apply_gap_only_edit_composes_preview_without_tts(tmp_path, monkeypatch):
    project, outputs, _lease, speaker, scripts, edits, source_output, engine, fixes, apply = make_services(tmp_path)
    source_path = outputs.audio_path(project.id, source_output.id)
    _, source_pcm = read_pcm(source_path)
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_preview_stretch)
    script = scripts.get(project.id)
    gap_start, gap_end = 12000, 20400
    edit = edits.change(project.id, source_output.id, VoiceEditCommand(revision=0, scriptRevision=script.revision,
        operation=StretchOperation(startFrame=gap_start, endFrame=gap_end, targetFrames=12600)))
    plan = fixes.plan(project.id, source_output.id)
    assert plan.dirty_count == 0 and all(unit.status == "ready" for unit in plan.units)
    spoken_before = list(engine.spoken)

    packet = apply.apply(project.id, source_output.id, script.revision, edit.revision, plan.key)

    assert packet["output"].id != source_output.id
    assert engine.spoken == spoken_before
    _, composed = read_pcm(outputs.audio_path(project.id, packet["output"].id))
    assert composed[:gap_start * 2] == source_pcm[:gap_start * 2]
    assert composed[gap_start * 2:(gap_start + 12600) * 2] == b"\0\0" * 12600
    assert composed[(gap_start + 12600) * 2:] == source_pcm[gap_end * 2:]
    assert len(composed) == len(source_pcm) + 4200 * 2
    assert packet["report"]["editRevision"] == edit.revision


def test_apply_persists_row_duration_targets_for_reopened_fix_plans(tmp_path, monkeypatch):
    project, outputs, _lease, speaker, scripts, edits, source_output, _engine, fixes, apply = make_services(tmp_path)
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_preview_stretch)
    script = scripts.get(project.id)
    script.rows[0].text = "Xin chào bạn"  # FakeEngine emits the matching native 0.75 s duration.
    script = scripts.save(project.id, script)
    segment = source_output.segments[0]
    start, end = round(segment.start * 24000), round(segment.end * 24000)
    edit = edits.change(project.id, source_output.id, VoiceEditCommand(revision=0, scriptRevision=script.revision,
        operation=StretchOperation(startFrame=start, endFrame=end, targetFrames=18000)))
    plan = fixes.plan(project.id, source_output.id)
    started = fixes.start(project.id, source_output.id, script.revision, edit.revision, plan.key)
    job = wait_job(fixes, project.id, source_output.id, started.id)
    assert job.status == "complete", job.error
    ready = fixes.plan(project.id, source_output.id)
    packet = apply.apply(project.id, source_output.id, script.revision, edit.revision, ready.key)

    lineage = packet["output"].parameters["fix"]
    assert lineage["durationTargets"] == {"r1": 18000}
    reopened_plan = fixes.plan(project.id, packet["output"].id)
    assert reopened_plan.dirty_count == 0
    assert reopened_plan.units[0].status == "ready"
    assert reopened_plan.units[0].desired_duration == pytest.approx(18000 / 24000)


def test_apply_noop_is_idempotent_and_get_reopens_latest_artifact(tmp_path):
    project, outputs, _lease, _speaker, _scripts, edits, source_output, _engine, fixes, apply = make_services(tmp_path)
    plan = fixes.plan(project.id, source_output.id)
    first = apply.apply(project.id, source_output.id, plan.script_revision, plan.edit_revision, plan.key)
    second = apply.apply(project.id, source_output.id, plan.script_revision, plan.edit_revision, plan.key)
    restored = apply.latest(project.id, source_output.id)

    assert first["output"].id == source_output.id
    assert first["report"]["audioGainApplied"] is False
    assert first["report"]["gainPending"] is False
    assert second["output"].id == restored["output"].id == source_output.id
    assert len(outputs.list(project.id)) == 1
    assert restored == first
    receipt = json.loads(apply.receipt_path(project.id, source_output.id).read_text(encoding="utf-8"))
    assert receipt["outputId"] == source_output.id
    assert receipt["outputAudioSha256"] == hashlib.sha256(edits.outputs.audio_path(project.id, source_output.id).read_bytes()).hexdigest()


def test_gain_only_apply_renders_once_and_get_restores_validated_render_without_tts(tmp_path):
    project, outputs, _lease, _speaker, scripts, edits, source_output, engine, fixes, apply = make_services(tmp_path)
    source_path = outputs.audio_path(project.id, source_output.id)
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    spoken_before = list(engine.spoken)
    script = scripts.get(project.id)
    script.settings.gain_db = 6
    script = scripts.save(project.id, script)
    plan = fixes.plan(project.id, source_output.id)
    router_app = FastAPI()
    router_app.include_router(make_voice_fix_apply_router(apply))

    with TestClient(router_app) as client:
        endpoint = f"/api/projects/{project.id}/voice-outputs/{source_output.id}/fix"
        missing = client.get(endpoint + "/applied")
        assert missing.status_code == 404
        response = client.post(endpoint + "/apply", json={
            "expectedScriptRevision": script.revision,
            "expectedEditRevision": plan.edit_revision,
            "expectedKey": plan.key,
        })
        assert response.status_code == 200, response.text
        packet = response.json()
        pointer = json.loads(apply.receipt_path(project.id, source_output.id).read_text(encoding="utf-8"))
        render_path = apply.renderer.audio_path(project.id, source_output.id, pointer["renderCacheKey"])
        raw_pcm = read_pcm(source_path)[1]
        rendered_pcm = read_pcm(render_path)[1]
        retried = client.post(endpoint + "/apply", json={
            "expectedScriptRevision": script.revision,
            "expectedEditRevision": plan.edit_revision,
            "expectedKey": plan.key,
        })
        assert retried.status_code == 200 and retried.json() == packet
        restored = client.get(endpoint + "/applied")
        assert restored.status_code == 200, restored.text
        assert restored.json() == packet
        artifacts_before_get = {path.name for path in render_path.parent.iterdir()}
        assert client.get(endpoint + "/applied").status_code == 200
        artifacts_after_get = {path.name for path in render_path.parent.iterdir()}

    assert packet["output"]["id"] == source_output.id
    assert packet["report"]["audioGainApplied"] is True
    assert packet["report"]["gainPending"] is False
    assert packet["audioUrl"].endswith(f"/rendered/{pointer['renderCacheKey']}/audio")
    assert rendered_pcm != raw_pcm
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source_hash
    assert engine.spoken == spoken_before
    assert len(outputs.list(project.id)) == 1
    assert artifacts_after_get == artifacts_before_get


def test_apply_rejects_stale_key_and_dirty_or_corrupt_current_clip(tmp_path):
    project, outputs, _lease, speaker, scripts, edits, source_output, _engine, fixes, apply = make_services(tmp_path)
    plan = fixes.plan(project.id, source_output.id)
    with pytest.raises(ValueError, match="plan changed|Fix clips"):
        apply.apply(project.id, source_output.id, plan.script_revision, plan.edit_revision, "0" * 64)

    script = scripts.get(project.id)
    script.rows[0].text = "No cache yet"
    script = scripts.save(project.id, script)
    dirty = fixes.plan(project.id, source_output.id)
    with pytest.raises(ValueError, match="dirty|ready"):
        apply.apply(project.id, source_output.id, script.revision, dirty.edit_revision, dirty.key)


def test_apply_replaces_source_clip_when_desired_generation_fingerprint_changed(tmp_path, monkeypatch):
    project, outputs, _lease, speaker, scripts, edits, source_output, _engine, fixes, apply = make_services(tmp_path)
    monkeypatch.setattr(speaker, "clip_key", lambda _step: "changed-generation-key")
    plan = fixes.plan(project.id, source_output.id)
    assert plan.dirty_count == 2
    started = fixes.start(project.id, source_output.id, plan.script_revision, plan.edit_revision, plan.key)
    job = wait_job(fixes, project.id, source_output.id, started.id)
    assert job.status == "complete", job.error
    ready = fixes.plan(project.id, source_output.id)
    packet = apply.apply(project.id, source_output.id, ready.script_revision, ready.edit_revision, ready.key)

    assert all(row["action"] == "replaced" for row in packet["report"]["rows"])
    assert packet["output"].id != source_output.id
    assert outputs.get(project.id, packet["output"].id).voice_id == packet["output"].segments[0].voice_id


def test_saved_apply_refuses_corrupt_output_metadata_lineage(tmp_path):
    project, outputs, _, speaker, scripts, edits, source, _, fixes, apply = make_services(tmp_path)
    script, plan = run_dirty_fix(project, scripts, edits, source, speaker, fixes, "Câu đã sửa")
    result = apply.apply(project.id, source.id, script.revision, plan.edit_revision, plan.key)
    output = result["output"]
    output.parameters["fix"]["sourceOutputId"] = "other-source"
    outputs.save(project.id, output)
    with pytest.raises((ValueError, KeyError)):
        apply.latest(project.id, source.id)
