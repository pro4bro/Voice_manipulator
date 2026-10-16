from __future__ import annotations

import hashlib
import json
import wave
from pathlib import Path

import pytest

from app.adapters.voice_patch_history import VoicePatchHistory
from test_voice_patch_processor import setup_patch


GENERATOR_IDS = {
    "voice-patch": "omnivoice",
    "context-patch": "voice-patch-context",
    "hybrid-patch": "voice-patch-hybrid",
    "trained-media-patch": "voice-patch-trained-media",
}


def accepted(project, outputs, source, draft, namespace="voice-patch", *, text="Changed words",
        frames=400, start=120, end=200, duration_policy="ripple", job_suffix="one"):
    history = VoicePatchHistory(outputs.projects, outputs)
    output_id, audio_path = outputs.reserve(project.id)
    pcm = b"\x01\x00" * frames
    with wave.open(str(audio_path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24000)
        audio.writeframes(pcm)
    job_id = f"patch-{job_suffix}"
    key = hashlib.sha256(f"key-{job_suffix}".encode()).hexdigest()
    lineage = {
        "version": 1,
        "sourceOutputId": source.id,
        "sourceAudioSha256": draft.source_sha256,
        "sourceMetadataSha256": draft.source_metadata_sha256,
        "jobId": job_id,
        "jobKey": key,
        "rowId": draft.row_id,
        "replacementText": text,
        "sampleRate": 24000,
        "durationPolicy": duration_policy,
        "durationDeltaFrames": 0,
    }
    segments = [segment.model_copy(update={"start": start / 24000, "end": end / 24000})
        if segment.row_id == draft.row_id else segment for segment in source.segments]
    output = source.model_copy(update={
        "id": output_id,
        "name": f"Revision {job_suffix}",
        "text": text,
        "generator_id": GENERATOR_IDS[namespace],
        "parameters": {**source.parameters, "voicePatch": lineage},
        "duration": frames / 24000,
        "sample_rate": 24000,
        "audio_path": audio_path.relative_to(Path(project.project_path)).as_posix(),
        "segments": segments,
    })
    outputs.save(project.id, output)
    receipt = {
        "version": 1,
        "key": key,
        "jobId": job_id,
        "sourceOutputId": source.id,
        "sourceAudioSha256": draft.source_sha256,
        "sourceMetadataSha256": draft.source_metadata_sha256,
        "draftRevision": 1,
        "sourcePreviewSha256": draft.source_sha256,
        "scriptRevision": 1,
        "editRevision": 0,
        "outputId": output_id,
        "outputAudioSha256": hashlib.sha256(audio_path.read_bytes()).hexdigest(),
        "outputMetadataSha256": history._metadata_hash(output),
        "frames": frames,
        "report": {"rowId": draft.row_id, "startFrame": start, "endFrame": end,
            "replacementFrames": end - start, "deltaFrames": 0, "durationPolicy": duration_policy, "frames": frames},
        "createdAt": "2026-10-16T12:00:00+00:00",
    }
    return history, output, receipt


def test_history_records_immutable_revisions_and_reopens_after_draft_changes(tmp_path):
    project, outputs, _lease, _speaker, _scripts, _edits, source, _engine, _voice, store, draft, _processor = setup_patch(tmp_path)
    history, first, receipt_a = accepted(project, outputs, source, draft.draft, job_suffix="a")
    _, second, receipt_b = accepted(project, outputs, source, draft.draft, namespace="hybrid-patch", job_suffix="b")
    history.record(project.id, "voice-patch", receipt_a)
    history.record(project.id, "voice-patch", receipt_a)
    history.record(project.id, "hybrid-patch", receipt_b)

    # History depends on immutable output lineage, not current draft freshness.
    store.path(project.id).write_text("not a current draft", encoding="utf-8")
    reopened = VoicePatchHistory(outputs.projects, outputs).list(project.id, source.id)
    assert reopened["invalidCount"] == 0
    assert {item["output"].id for item in reopened["revisions"]} == {first.id, second.id}
    assert {item["strategy"] for item in reopened["revisions"]} == {"voice-patch", "hybrid-patch"}
    assert all(item["sourceOutputId"] == source.id for item in reopened["revisions"])
    assert all(item["audioUrl"].endswith(f"/{item['output'].id}/audio") for item in reopened["revisions"])

    conflicting = {**receipt_a, "createdAt": "2026-10-16T12:01:00+00:00"}
    with pytest.raises(ValueError, match="different immutable"):
        history.record(project.id, "voice-patch", conflicting)


def test_history_discovers_legacy_applied_receipts_without_migrating_them(tmp_path):
    project, outputs, _lease, _speaker, _scripts, _edits, source, _engine, _voice, _store, draft, _processor = setup_patch(tmp_path)
    history, output, receipt = accepted(project, outputs, source, draft.draft)
    legacy = history._root(project.id) / "jobs" / "voice-patch" / "applied" / f"{source.id}.json"
    legacy.parent.mkdir(parents=True)
    legacy.write_text(json.dumps(receipt), encoding="utf-8")

    result = history.list(project.id)
    assert result["invalidCount"] == 0
    assert [item["output"].id for item in result["revisions"]] == [output.id]
    assert not (history._root(project.id) / "jobs" / "voice-patch" / "history").exists()
    history.record(project.id, "voice-patch", receipt)
    deduplicated = history.list(project.id)
    assert deduplicated["invalidCount"] == 0
    assert [item["output"].id for item in deduplicated["revisions"]] == [output.id]
    assert legacy.is_file()


def test_comparison_groups_match_same_source_target_text_and_duration_policy(tmp_path):
    project, outputs, _lease, _speaker, _scripts, _edits, source, _engine, _voice, _store, draft, _processor = setup_patch(tmp_path)
    history = VoicePatchHistory(outputs.projects, outputs)
    comparison = []
    for namespace, suffix in (("voice-patch", "a"), ("context-patch", "b"), ("hybrid-patch", "c")):
        _history, output, receipt = accepted(project, outputs, source, draft.draft, namespace, text="Same line", job_suffix=suffix)
        history.record(project.id, namespace, receipt)
        comparison.append((output, receipt))
    changed_history, changed_output, changed_receipt = accepted(
        project, outputs, source, draft.draft, "trained-media-patch", text="Different line", job_suffix="d")
    changed_history.record(project.id, "trained-media-patch", changed_receipt)
    policy_history, policy_output, policy_receipt = accepted(
        project, outputs, source, draft.draft, "trained-media-patch", text="Same line",
        duration_policy="source", job_suffix="e")
    policy_history.record(project.id, "trained-media-patch", policy_receipt)

    revisions = history.list(project.id)["revisions"]
    groups = {item["output"].id: item["comparisonKey"] for item in revisions}
    assert len({groups[output.id] for output, _ in comparison}) == 1
    assert groups[changed_output.id] != groups[comparison[0][0].id]
    assert groups[policy_output.id] != groups[comparison[0][0].id]


@pytest.mark.parametrize("tamper", ["audio", "metadata", "report"])
def test_history_skips_tampered_output_artifacts_with_invalid_count(tmp_path, tamper):
    project, outputs, _lease, _speaker, _scripts, _edits, source, _engine, _voice, _store, draft, _processor = setup_patch(tmp_path)
    history, output, receipt = accepted(project, outputs, source, draft.draft)
    history.record(project.id, "voice-patch", receipt)
    if tamper == "audio":
        outputs.audio_path(project.id, output.id).write_bytes(b"changed")
    elif tamper == "metadata":
        output.name = "tampered metadata"
        outputs.save(project.id, output)
    else:
        history_path = history._root(project.id) / "jobs" / "voice-patch" / "history" / f"{output.id}.json"
        changed = json.loads(history_path.read_text(encoding="utf-8"))
        changed["report"]["endFrame"] += 1
        history_path.write_text(json.dumps(changed), encoding="utf-8")

    result = history.list(project.id)
    assert result["revisions"] == []
    assert result["invalidCount"] == 1


def test_history_rejects_invalid_namespace_and_project_escape_ids(tmp_path):
    project, outputs, _lease, _speaker, _scripts, _edits, source, _engine, _voice, _store, draft, _processor = setup_patch(tmp_path)
    history, _output, receipt = accepted(project, outputs, source, draft.draft)
    with pytest.raises(ValueError, match="namespace"):
        history.record(project.id, "../outside", receipt)
    with pytest.raises(ValueError, match="output id"):
        history._output(project.id, "../escape")


def test_history_files_remain_inside_project_and_store_no_absolute_paths(tmp_path):
    project, outputs, _lease, _speaker, _scripts, _edits, source, _engine, _voice, _store, draft, _processor = setup_patch(tmp_path)
    history, output, receipt = accepted(project, outputs, source, draft.draft)
    path = history.record(project.id, "voice-patch", receipt)
    assert Path(project.project_path) in path.resolve().parents
    serialized = json.loads(path.read_text(encoding="utf-8"))
    assert str(Path(project.project_path).resolve()) not in json.dumps(serialized)
    assert serialized["outputId"] == output.id
