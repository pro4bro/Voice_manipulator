import json
import shutil
from pathlib import Path

import pytest
from test_reference_bindings import fixture
from app.adapters.file_timing_plans import FileTimingPlans
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.omnivoice_generator import file_digest
from app.adapters.reference_resolver import ReferenceResolver
from app.domain.models import DatasetManifest, DatasetSegment, TrainingRun
from app.domain.timing_plan import TimingPlanRequest, timing_template, compare_timing


def test_template_mapping_preserves_pauses_and_never_claims_estimated_anchors():
    words = [{"text": "Xin", "start": 1, "end": 1.4, "timingTrusted": True}, {"text": "chào", "start": 2, "end": 2.6, "timingTrusted": True}]
    template = timing_template(words, .5, 3, "Xin chào", True)
    assert template["mapping"] == "reviewed"
    assert template["pauses"][0]["start"] == pytest.approx(.9)
    assert template["pauses"][0]["end"] == 1.5
    assert template["anchors"][1]["targetWordIndex"] == 1
    assert timing_template(words, .5, 3, "你好", True)["mapping"] == "unknown"
    assert timing_template(words, .5, 3, "Xin chào", False)["mapping"] == "unreviewed"
    words[0]["timingTrusted"] = False
    assert timing_template(words, .5, 3, "Xin chào", True)["pauses"] == []
    report = compare_timing({"requestedDuration": 2.5, "template": template}, 2.6, [{"text": "Xin", "start": .5, "end": .9}])
    assert report["durationError"] == pytest.approx(.1)
    assert report["anchorStatus"] == "unknown"
    report = compare_timing({"requestedDuration": 2.5, "template": template}, 2.6, [{"text": "Xin", "start": .52, "end": .92, "timingTrusted": True}])
    assert report["anchorStatus"] == "partial" and report["offsetError"] == pytest.approx(.02)


@pytest.mark.parametrize("kind", ["reference", "dub", "patch"])
def test_sources_preserve_identity_lineage_reopen_and_invalidate_changed_text(tmp_path, kind):
    projects, project, media, refs, scripts, script, bindings, _ = fixture(tmp_path)
    plans = FileTimingPlans(ReferenceResolver(bindings))
    asset = media.get(project.id, refs[0].id)
    request = TimingPlanRequest.model_validate({"rowId": "r1", "expectedRevision": 0, "expectedScriptRevision": script.revision,
        "source": {"kind": kind, "assetId": asset.id, "revision": asset.updated_at.isoformat(), "start": .5, "end": 3}})
    first = plans.save(project.id, request)
    plan = first["plans"][0]
    assert plan["state"] == "ready" and plan["requestedDuration"] == 2.5
    assert plan["template"]["mapping"] == "unknown"
    assert plan["identityVoiceId"] is None and plan["audioSha256"] == file_digest(media.resolve_audio_path(project.id, asset.id))
    moved = tmp_path / "moved"; shutil.move(project.project_path, moved); projects.open(moved)
    assert plans.get(project.id)["plans"][0]["key"] == plan["key"]
    with pytest.raises(ScriptRevisionConflict): plans.save(project.id, request)
    script.rows[0].text += " changed"
    scripts.save(project.id, script)
    assert plans.get(project.id)["plans"][0]["state"] == "stale"
    assert plans.delete(project.id, "r1", 1)["plans"] == []


def test_training_requires_hashed_manifest_and_matching_actual_training_audio(tmp_path):
    _, project, media, refs, _, script, bindings, _ = fixture(tmp_path)
    root = Path(project.project_path)
    source = media.get(project.id, refs[0].id)
    manifest = DatasetManifest(id="manifest-a", segments=[DatasetSegment(id="segment-a", asset_id=source.id, audio_path=source.analysis_path, start=0, end=5, text="example")])
    manifest_path = root / "assets/training/datasets/manifest-a.json"
    manifest_path.parent.mkdir(parents=True); manifest_path.write_text(manifest.model_dump_json(by_alias=True), encoding="utf-8")
    run = TrainingRun(id="run-a", project_id=project.id, manifest_id=manifest.id, manifest_hash=file_digest(manifest_path), status="complete")
    run_path = root / "jobs/training/run-a/run.json"
    run_path.parent.mkdir(parents=True); run_path.write_text(run.model_dump_json(by_alias=True), encoding="utf-8")
    plans = FileTimingPlans(ReferenceResolver(bindings))
    request = TimingPlanRequest.model_validate({"rowId": "r1", "expectedRevision": 0, "expectedScriptRevision": script.revision,
        "source": {"kind": "training", "assetId": source.id, "revision": source.updated_at.isoformat(), "start": 1, "end": 4, "trainingRunId": run.id}})
    with pytest.raises(ValueError, match="audio segment"): plans.save(project.id, request)
    snapshot = run_path.parent / "data/segments/segment-a.wav"; snapshot.parent.mkdir(parents=True)
    shutil.copy2(media.resolve_audio_path(project.id, source.id), snapshot)
    result = plans.save(project.id, request)
    assert result["plans"][0]["training"]["snapshotSha256"] == file_digest(snapshot)
    snapshot.write_bytes(b"changed")
    assert plans.get(project.id)["plans"][0]["state"] == "stale"
