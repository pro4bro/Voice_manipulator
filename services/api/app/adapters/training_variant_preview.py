from __future__ import annotations

import hashlib
import json
import math

from app.domain.models import DatasetManifest, TrainingModelOption
from app.domain.training_parameters import resolve_parameters
from app.domain.training_variants import (
    TrainingVariantPlan,
    TrainingVariantPlanCell,
    TrainingVariantPlanMetadata,
    TrainingVariantPreviewRequest,
    manifest_fingerprint,
)


def _segment_has_valid_duration(segment) -> bool:
    duration = segment.end - segment.start
    return math.isfinite(segment.start) and math.isfinite(segment.end) and math.isfinite(duration) and round(duration, 3) > 0


def _segment_has_usable_audio_text(segment) -> bool:
    return _segment_has_valid_duration(segment) and bool(segment.text.strip())


def preview_training_variants(
    request: TrainingVariantPreviewRequest,
    manifest: DatasetManifest,
    manifest_hash: str,
    speaker_ids: set[str],
    model: TrainingModelOption,
) -> TrainingVariantPlan:
    """Build a deterministic, read-only plan. This function has no storage/job ports."""
    blockers: list[str] = []
    segments = {segment.id: segment for segment in manifest.segments}
    if len(segments) != len(manifest.segments):
        blockers.append("duplicate-manifest-segment-ids")
    chosen = [variant.segment_ids for variant in request.variants]
    keys = [(variant.emotion, variant.vocal_effort) for variant in request.variants]

    if manifest.id != request.manifest_id:
        blockers.append("manifest-id-mismatch")
    if request.speaker_profile_id not in speaker_ids:
        blockers.append("unknown-speaker")
    if len(set(keys)) != len(keys):
        blockers.append("duplicate-variants")
    flattened = [segment_id for ids in chosen for segment_id in ids]
    if len(flattened) != len(set(flattened)):
        blockers.append("overlapping-variant-segments")
    anchors = request.ordered_neutral_anchor_segment_ids
    if not anchors:
        blockers.append("neutral-anchor-missing")
    if len(anchors) != len(set(anchors)):
        blockers.append("duplicate-neutral-anchor-segments")
    unknown_ids = sorted((set(flattened) | set(anchors)) - set(segments))
    if unknown_ids:
        blockers.append("unknown-segment-ids:" + ",".join(unknown_ids))
    unknown_effort_label_ids = sorted(set(request.segment_effort_labels) - set(segments))
    if unknown_effort_label_ids:
        blockers.append("effort-label-unknown-segment-ids:" + ",".join(unknown_effort_label_ids))
    if not request.base_fingerprint or not request.base_fingerprint.strip():
        blockers.append("base-fingerprint-missing")
    else:
        blockers.append("base-fingerprint-unverified")
    if not model.runnable:
        blockers.append("training-model-not-runnable:" + (model.blocked_reason or model.status or model.id))
    elif not model.available:
        blockers.append("training-model-unavailable:" + (model.status or model.id))

    for segment_id in anchors:
        segment = segments.get(segment_id)
        if segment is None:
            continue
        if segment.speaker_profile_id != request.speaker_profile_id:
            blockers.append(f"anchor-wrong-speaker:{segment_id}")
        if segment.emotion != "normal":
            blockers.append(f"anchor-not-neutral:{segment_id}")
        anchor_effort = request.segment_effort_labels.get(segment_id)
        if anchor_effort is None:
            blockers.append(f"anchor-effort-unreviewed:{segment_id}")
        elif anchor_effort != "ordinary":
            blockers.append(f"anchor-effort-not-ordinary:{segment_id}")
        if segment.split != "train":
            blockers.append(f"anchor-not-training:{segment_id}")
        if not _segment_has_valid_duration(segment):
            blockers.append(f"segment-invalid-duration:{segment_id}")
        if not segment.text.strip():
            blockers.append(f"segment-invalid-text:{segment_id}")

    cells: list[TrainingVariantPlanCell] = []
    for index, variant in enumerate(request.variants):
        if variant.emotion == "mix":
            blockers.append(f"mixed-emotion-variant:{index}")
        target_segments = []
        for segment_id in variant.segment_ids:
            segment = segments.get(segment_id)
            if segment is None:
                continue
            target_segments.append(segment)
            if segment.speaker_profile_id != request.speaker_profile_id:
                blockers.append(f"segment-wrong-speaker:{segment_id}")
            if segment.emotion != variant.emotion:
                blockers.append(f"segment-emotion-mismatch:{segment_id}")
            effort = request.segment_effort_labels.get(segment_id)
            if effort is None:
                blockers.append(f"segment-effort-unreviewed:{segment_id}")
            elif effort != variant.vocal_effort:
                blockers.append(f"segment-effort-mismatch:{segment_id}")
            if not _segment_has_valid_duration(segment):
                blockers.append(f"segment-invalid-duration:{segment_id}")
            if not segment.text.strip():
                blockers.append(f"segment-invalid-text:{segment_id}")

        target_train = [segment for segment in target_segments if segment.split == "train"]
        target_dev = [segment for segment in target_segments if segment.split == "dev"]
        anchor_train = [segments[segment_id] for segment_id in anchors if segment_id in segments]
        variant_train = [segment for segment in target_train if segment.id not in set(anchors)]
        if not target_train:
            blockers.append(f"variant-missing-train:{index}")
        if not target_dev:
            blockers.append(f"variant-missing-dev:{index}")
        leak = sorted(set(anchors) & {segment.id for segment in target_dev})
        if leak:
            blockers.append("neutral-anchor-dev-leak:" + ",".join(leak))
        for train_segment in variant_train + anchor_train:
            if train_segment.speaker_profile_id != request.speaker_profile_id:
                continue
            for dev_segment in target_dev:
                if dev_segment.speaker_profile_id != request.speaker_profile_id:
                    continue
                if not _segment_has_valid_duration(train_segment) or not _segment_has_valid_duration(dev_segment):
                    continue
                same_source = (
                    train_segment.asset_id == dev_segment.asset_id
                    or train_segment.audio_path.replace("\\", "/").casefold()
                    == dev_segment.audio_path.replace("\\", "/").casefold()
                )
                if same_source and max(train_segment.start, dev_segment.start) < min(train_segment.end, dev_segment.end):
                    blockers.append(f"source-audio-overlap:{train_segment.id}:{dev_segment.id}")

        cells.append(TrainingVariantPlanCell(
            emotion=variant.emotion,
            vocal_effort=variant.vocal_effort,
            selected_segment_ids=list(variant.segment_ids),
            train_segment_ids=[segment.id for segment in variant_train] + [item for item in anchors if item in segments],
            dev_segment_ids=[segment.id for segment in target_dev],
            neutral_anchor_segment_ids=list(anchors),
            train_duration_seconds=round(sum(item.duration for item in variant_train + anchor_train if _segment_has_usable_audio_text(item)), 3),
            dev_duration_seconds=round(sum(item.duration for item in target_dev if _segment_has_usable_audio_text(item)), 3),
            anchor_duration_seconds=round(sum(item.duration for item in anchor_train if _segment_has_usable_audio_text(item)), 3),
        ))
    resolved_parameters = resolve_parameters(model, request.parameters)
    config_fingerprint = hashlib.sha256(json.dumps({
        "modelId": model.id,
        "engine": model.engine,
        "revision": model.repository.revision,
        "parameters": resolved_parameters,
    }, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()

    # A malformed speaker selection is still reviewable as a blocked draft.
    metadata = TrainingVariantPlanMetadata(
        training_model_id=model.id,
        engine=model.engine,
        mode=model.mode,
        engine_revision=model.repository.revision,
        runnable=model.runnable,
        available=model.available,
        status=model.status,
        blocked_reason=model.blocked_reason,
        # Preserve declared descriptor controls verbatim; no engine-specific settings are invented.
        parameter_specs=[item.model_dump(by_alias=True) for item in model.parameters],
        resolved_parameters=resolved_parameters,
        config_fingerprint=config_fingerprint,
        base_fingerprint=request.base_fingerprint,
    )
    canonical = {
        "request": request.model_dump(mode="json", by_alias=True),
        "manifestHash": manifest_hash or manifest_fingerprint(manifest),
        "model": metadata.model_dump(mode="json", by_alias=True),
        "cells": [cell.model_dump(mode="json", by_alias=True) for cell in cells],
        "blockers": sorted(set(blockers)),
    }
    plan_hash = hashlib.sha256(
        json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    normalized_blockers = sorted(set(blockers))
    # The supplied base fingerprint can be reviewed, but is not an authenticated base receipt.
    review_exempt = {"base-fingerprint-unverified"}
    return TrainingVariantPlan(
        plan_fingerprint=plan_hash,
        source_manifest_id=manifest.id,
        source_manifest_hash=manifest_hash or manifest_fingerprint(manifest),
        speaker_profile_id=request.speaker_profile_id,
        metadata=metadata,
        cells=cells,
        blockers=normalized_blockers,
        ready_for_review=not (set(normalized_blockers) - review_exempt),
    )
