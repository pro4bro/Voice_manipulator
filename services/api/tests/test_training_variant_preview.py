from __future__ import annotations

from dataclasses import replace
import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.training_variant_preview import preview_training_variants
from app.domain.models import DatasetManifest, DatasetSegment, TrainingModelOption, TrainingModelRepository, TrainingParameterSpec
from app.domain.training_variants import TrainingVariantPreviewRequest
from app.main import create_app
from app.settings import Settings


def _manifest() -> DatasetManifest:
    return DatasetManifest(id="dataset-preview", segments=[
        DatasetSegment(id="anchor-a", asset_id="asset-a", audio_path="audio/a.wav", start=0, end=2,
                       text="neutral anchor", speaker_profile_id="speaker-a", emotion="normal", split="train"),
        DatasetSegment(id="angry-train", asset_id="asset-b", audio_path="audio/b.wav", start=0, end=3,
                       text="angry line", speaker_profile_id="speaker-a", emotion="angry", split="train"),
        DatasetSegment(id="angry-dev", asset_id="asset-c", audio_path="audio/c.wav", start=0, end=4,
                       text="angry holdout", speaker_profile_id="speaker-a", emotion="angry", split="dev"),
        DatasetSegment(id="sad-train", asset_id="asset-d", audio_path="audio/d.wav", start=0, end=5,
                       text="sad line", speaker_profile_id="speaker-a", emotion="sad", split="train"),
        DatasetSegment(id="sad-dev", asset_id="asset-e", audio_path="audio/e.wav", start=0, end=6,
                       text="sad holdout", speaker_profile_id="speaker-a", emotion="sad", split="dev"),
    ])


def _model() -> TrainingModelOption:
    return TrainingModelOption(
        id="omnivoice-lora", label="OmniVoice LoRA", family="omnivoice", engine="omnivoice",
        mode="lora-finetune", category="train", runnable=True, available=True, status="Sẵn sàng.",
        repository=TrainingModelRepository(root="omnivoice", path="", entrypoint="train.py"),
    )


def _request(**updates) -> TrainingVariantPreviewRequest:
    data = {
        "manifestId": "dataset-preview",
        "speakerProfileId": "speaker-a",
        "trainingModelId": "omnivoice-lora",
        "orderedNeutralAnchorSegmentIds": ["anchor-a"],
        "variants": [
            {"emotion": "angry", "vocalEffort": "loud", "segmentIds": ["angry-train", "angry-dev"]},
            {"emotion": "sad", "vocalEffort": "soft", "segmentIds": ["sad-train", "sad-dev"]},
        ],
        "segmentEffortLabels": {
            "anchor-a": "ordinary", "angry-train": "loud", "angry-dev": "loud",
            "sad-train": "soft", "sad-dev": "soft",
        },
        "baseFingerprint": "sha256:caller-claim",
    }
    data.update(updates)
    return TrainingVariantPreviewRequest.model_validate(data)


def test_preview_is_deterministic_and_carries_shared_anchor_and_base_receipt_gap():
    manifest = _manifest()
    first = preview_training_variants(_request(), manifest, "manifest-sha256", {"speaker-a"}, _model())
    second = preview_training_variants(_request(), manifest, "manifest-sha256", {"speaker-a"}, _model())

    assert first.plan_fingerprint == second.plan_fingerprint
    assert first.ready_for_review is True
    assert first.executable is False and first.dry_run is True
    assert first.base_identity_verified is False
    assert "base-fingerprint-unverified" in first.blockers
    assert [cell.neutral_anchor_segment_ids for cell in first.cells] == [["anchor-a"], ["anchor-a"]]
    assert first.cells[0].train_segment_ids == ["angry-train", "anchor-a"]
    assert first.cells[0].dev_segment_ids == ["angry-dev"]
    assert first.cells[0].train_duration_seconds == 5
    assert first.cells[0].dev_duration_seconds == 4


def test_ambiguous_manifest_segment_ids_cannot_be_ready_for_review():
    manifest = _manifest()
    manifest.segments.append(manifest.segments[1].model_copy())
    plan = preview_training_variants(_request(), manifest, "hash", {"speaker-a"}, _model())
    assert "duplicate-manifest-segment-ids" in plan.blockers
    assert plan.ready_for_review is False


def test_preview_blocks_label_errors_overlap_unknowns_and_dev_anchor_leak():
    manifest = _manifest()
    payload = _request(
        orderedNeutralAnchorSegmentIds=["anchor-a", "angry-dev", "missing-anchor"],
        variants=[
            {"emotion": "angry", "vocalEffort": "loud", "segmentIds": ["angry-train", "angry-dev"]},
            {"emotion": "angry", "vocalEffort": "loud", "segmentIds": ["angry-train", "missing-target"]},
        ],
        segmentEffortLabels={"anchor-a": "ordinary", "angry-train": "soft", "angry-dev": "loud"},
    )
    plan = preview_training_variants(payload, manifest, "hash", set(), _model())
    joined = "|".join(plan.blockers)

    assert "duplicate-variants" in joined
    assert "unknown-speaker" in joined
    assert "overlapping-variant-segments" in joined
    assert "unknown-segment-ids:missing-anchor,missing-target" in joined
    assert "segment-effort-mismatch:angry-train" in joined
    assert "anchor-not-neutral:angry-dev" in joined
    assert "anchor-effort-not-ordinary:angry-dev" in joined
    assert "neutral-anchor-dev-leak:angry-dev" in joined
    assert plan.ready_for_review is False


def test_preview_blocks_unreviewed_effort_and_empty_train_dev_membership():
    payload = _request(
        variants=[{"emotion": "angry", "vocalEffort": "shout", "segmentIds": ["angry-train"]}],
        segmentEffortLabels={"anchor-a": "ordinary"},
    )
    plan = preview_training_variants(payload, _manifest(), "hash", {"speaker-a"}, _model())
    assert "segment-effort-unreviewed:angry-train" in plan.blockers
    assert "variant-missing-dev:0" in plan.blockers
    assert plan.ready_for_review is False


def test_preview_blocks_same_source_time_overlap_but_allows_boundary_touch():
    manifest = _manifest()
    segments = list(manifest.segments)
    dev = segments[2].model_copy(update={"asset_id": "asset-b", "audio_path": "audio/b.wav", "start": 2, "end": 4})
    manifest = manifest.model_copy(update={"segments": [segments[0], segments[1], dev, *segments[3:]]})
    plan = preview_training_variants(_request(), manifest, "hash", {"speaker-a"}, _model())
    assert "source-audio-overlap:angry-train:angry-dev" in plan.blockers

    touching = dev.model_copy(update={"start": 3, "end": 4})
    manifest = manifest.model_copy(update={"segments": [segments[0], segments[1], touching, *segments[3:]]})
    plan = preview_training_variants(_request(), manifest, "hash", {"speaker-a"}, _model())
    assert not any(reason.startswith("source-audio-overlap:") for reason in plan.blockers)


def test_preview_blocks_mixed_emotion_rollup_as_a_training_variant():
    payload = _request(
        variants=[{"emotion": "mix", "vocalEffort": "loud", "segmentIds": ["angry-train", "angry-dev"]}],
    )
    plan = preview_training_variants(payload, _manifest(), "hash", {"speaker-a"}, _model())
    assert "mixed-emotion-variant:0" in plan.blockers
    assert plan.ready_for_review is False


def test_preview_blocks_invalid_duration_and_blank_source_text():
    manifest = _manifest()
    segments = list(manifest.segments)
    segments[1] = segments[1].model_copy(update={"start": 2, "end": 2})
    segments[2] = segments[2].model_copy(update={"text": "   "})
    manifest = manifest.model_copy(update={"segments": segments})
    plan = preview_training_variants(_request(), manifest, "hash", {"speaker-a"}, _model())

    assert "segment-invalid-duration:angry-train" in plan.blockers
    assert "segment-invalid-text:angry-dev" in plan.blockers
    assert plan.cells[0].train_duration_seconds == 2
    assert plan.cells[0].dev_duration_seconds == 0
    assert plan.ready_for_review is False


def test_preview_does_not_use_timeline_gain_as_effort():
    payload = _request(
        segmentEffortLabels={"anchor-a": "ordinary", "angry-train": "loud", "angry-dev": "loud", "sad-train": "soft"},
        timelineGainDb={"sad-dev": 12},
    )
    plan = preview_training_variants(payload, _manifest(), "hash", {"speaker-a"}, _model())
    assert "segment-effort-unreviewed:sad-dev" in plan.blockers


def test_preview_blocks_absent_base_fingerprint_declaration():
    payload = _request(baseFingerprint=None)
    plan = preview_training_variants(payload, _manifest(), "hash", {"speaker-a"}, _model())
    assert "base-fingerprint-missing" in plan.blockers
    assert plan.base_identity_verified is False


def test_preview_resolves_shared_descriptor_parameters_and_rejects_unknown_keys():
    model = _model().model_copy(update={"parameters": [
        TrainingParameterSpec(key="learning_rate", label="Learning rate", group="Training",
                              kind="float", default=0.001, min=0.00001, max=1),
    ]})
    payload = _request(parameters={"learning_rate": 0.002})
    plan = preview_training_variants(payload, _manifest(), "hash", {"speaker-a"}, model)
    assert plan.metadata.resolved_parameters == {"learning_rate": 0.002}
    assert plan.metadata.config_fingerprint
    assert plan.metadata.parameter_specs[0]["key"] == "learning_rate"
    assert len(plan.cells) == 2

    with pytest.raises(ValueError, match="does not have|không có tham số"):
        preview_training_variants(_request(parameters={"invented_knob": 3}), _manifest(), "hash", {"speaker-a"}, model)


def test_route_returns_read_only_preview_and_404s_missing_manifest(tmp_path):
    settings = replace(Settings.from_env(), **{
        "data_root": tmp_path / "data",
        "training_runtime_root": tmp_path / "training" / ".venv",
        "training_wheel_cache": tmp_path / "wheels",
        "omnivoice_root": tmp_path / "engine",
    })
    payload = _request().model_dump(mode="json", by_alias=True)
    with TestClient(create_app(settings=settings)) as client:
        missing = client.post("/api/projects/no-project/training-variants/preview", json=payload)
        invalid = client.post("/api/projects/no-project/training-variants/preview", json={**payload, "manifestId": "../escape"})

    assert missing.status_code == 404
    assert invalid.status_code == 422


def test_route_builds_preview_without_writing_project_files(tmp_path):
    settings = replace(
        Settings.from_env(),
        data_root=tmp_path / "data",
        training_runtime_root=tmp_path / "training" / ".venv",
        training_wheel_cache=tmp_path / "wheels",
        omnivoice_root=tmp_path / "engine",
    )
    with TestClient(create_app(settings=settings)) as client:
        project_response = client.post("/api/projects", json={"name": "Preview test"})
        assert project_response.status_code == 201
        project = project_response.json()
        project_id = project["id"]
        client.put(
            f"/api/projects/{project_id}/training-catalog",
            json={"speakers": [{"id": "speaker-a", "name": "Speaker A"}]},
        )
        project_root = Path(project["projectPath"])
        dataset_dir = project_root / "assets" / "training" / "datasets"
        dataset_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = dataset_dir / "dataset-preview.json"
        manifest_path.write_text(_manifest().model_dump_json(by_alias=True), encoding="utf-8")
        before = {
            path.relative_to(project_root).as_posix(): path.read_bytes()
            for path in project_root.rglob("*")
            if path.is_file()
        }
        payload = _request(trainingModelId="fish-s2-pro-finetune").model_dump(mode="json", by_alias=True)
        response = client.post(
            f"/api/projects/{project_id}/training-variants/preview", json=payload
        )
        index_payload = {**payload, "trainingModelId": "indextts25-finetune"}
        index_response = client.post(
            f"/api/projects/{project_id}/training-variants/preview", json=index_payload
        )
        invalid_parameters = {**payload, "parameters": {"invented_knob": 3}}
        invalid_parameter_response = client.post(
            f"/api/projects/{project_id}/training-variants/preview", json=invalid_parameters
        )
        after = {
            path.relative_to(project_root).as_posix(): path.read_bytes()
            for path in project_root.rglob("*")
            if path.is_file()
        }

    assert response.status_code == 200
    assert index_response.status_code == 200
    assert invalid_parameter_response.status_code == 400
    plan = response.json()
    assert plan["sourceManifestHash"] == hashlib.sha256(before["assets/training/datasets/dataset-preview.json"]).hexdigest()
    assert plan["dryRun"] is True and plan["executable"] is False
    assert plan["readyForReview"] is False
    assert plan["metadata"]["trainingModelId"] == "fish-s2-pro-finetune"
    assert plan["metadata"]["engine"] == "fish-s2-pro"
    assert plan["metadata"]["runnable"] is False
    assert plan["metadata"]["parameterSpecs"] == []  # no Fish S2 Pro training controls are invented
    assert plan["metadata"]["resolvedParameters"] == {}
    assert any(reason.startswith("training-model-not-runnable:") for reason in plan["blockers"])
    index_plan = index_response.json()
    assert index_plan["metadata"]["engine"] == "indextts25"
    assert index_plan["metadata"]["parameterSpecs"] == []  # no IndexTTS 2.5 training controls are invented
    assert index_plan["metadata"]["resolvedParameters"] == {}
    assert before == after
