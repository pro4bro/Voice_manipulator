from __future__ import annotations

import hashlib
import json
import wave

import pytest

from app.adapters.voice_edit_preview import VoiceEditPreview
from app.adapters.voice_stretch_audio import _resolve_ffmpeg, render_stretch
from app.domain.voice_edits import StretchOperation, VoiceEditCommand, apply_command
from test_voice_edits import setup_store


@pytest.mark.parametrize("field,value", [("paddingFrames", -999999), ("paddingFrames", 999999), ("operationCount", 1)])
def test_prefix_rejects_impossible_adjustment_or_operation_counters(tmp_path, monkeypatch, field, value):
    _, project, output_id, store = setup_store(tmp_path)
    calls = []
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_renderer(calls))
    preview = VoiceEditPreview(store)
    first, second, third = operations(store, project, output_id)
    preview.render(project.id, output_id, first)
    preview.render(project.id, output_id, second)
    path = preview.path(project.id, output_id, preview._key(second.source_sha256,
        [item.model_dump(by_alias=True) for item in second.active])).with_suffix(".json")
    report = json.loads(path.read_text(encoding="utf-8")); report[field] = value
    path.write_text(json.dumps(report), encoding="utf-8")
    diagnostics = {}
    _url, result = preview.render(project.id, output_id, third, diagnostics=diagnostics)
    assert diagnostics["reusedOperations"] == 1 and diagnostics["renderedOperations"] == 2
    assert result["paddingFrames"] == 21 and result["operationCount"] == 3


def apply(store, project_id, output_id, doc, operation):
    return apply_command(doc, VoiceEditCommand(revision=doc.revision, scriptRevision=1, operation=operation))


def fake_renderer(calls):
    def render(source, destination, operations):
        destination.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(source), "rb") as wav:
            frames = wav.getnframes()
            pcm = wav.readframes(frames)
        for operation in operations:
            start, end, target = operation["startFrame"], operation["endFrame"], operation["targetFrames"]
            before, region, after = pcm[:start * 2], pcm[start * 2:end * 2], pcm[end * 2:]
            if target >= end - start:
                one_frame = region[:2]
                stretched = one_frame * target
            else:
                stretched = region[:target * 2]
            pcm = before + stretched + after
            frames = frames - (end - start) + target
        with wave.open(str(destination), "wb") as wav:
            wav.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
            wav.writeframes(pcm)
        calls.append((source, list(operations)))
        return {"targetFrames": frames, "actualFrames": frames, "paddingFrames": len(operations) * 7,
            "clippedSamples": 0, "maxBoundaryStep": max(operation["targetFrames"] for operation in operations) / 1_000_000,
            "boundariesWithinLimit": True, "method": "fake"}
    return render


def operations(store, project, output_id):
    doc = store.get(project.id, output_id)
    first = apply(store, project.id, output_id, doc,
        StretchOperation(startFrame=48000, endFrame=72000, targetFrames=36000))
    second = apply(store, project.id, output_id, first,
        StretchOperation(startFrame=120000, endFrame=144000, targetFrames=48000))
    third = apply(store, project.id, output_id, second,
        StretchOperation(startFrame=180000, endFrame=204000, targetFrames=30000))
    return first, second, third


def test_preview_reuses_longest_exact_prefix_and_full_cache_without_rendering(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    calls = []
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_renderer(calls))
    preview = VoiceEditPreview(store)
    first, second, third = operations(store, project, output_id)
    preview.render(project.id, output_id, first)
    preview.render(project.id, output_id, second)
    calls.clear()

    _url, report = preview.render(project.id, output_id, third, diagnostics={})
    assert len(calls) == 1
    assert calls[0][0] == preview.path(project.id, output_id,
        hashlib.sha256(json.dumps({"source": third.source_sha256,
            "operations": [op.model_dump(by_alias=True) for op in third.active[:2]], "policy": 1}, sort_keys=True).encode()).hexdigest()[:32])
    assert len(calls[0][1]) == 1 and calls[0][1][0] == third.active[2].model_dump(by_alias=True)
    assert report["paddingFrames"] == 21
    assert report["maxBoundaryStep"] == pytest.approx(.048)
    assert report["targetFrames"] == third.frames
    assert report["actualFrames"] == third.frames

    calls.clear()
    diagnostics = {}
    preview.render(project.id, output_id, third, diagnostics=diagnostics)
    assert diagnostics["reusedOperations"] == 3
    assert diagnostics["renderedOperations"] == 0
    assert calls == []


def test_prefix_render_matches_full_replay_pcm_and_diagnostics_account_for_suffix(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    _first, _second, third = operations(store, project, output_id)
    preview = VoiceEditPreview(store)
    calls = []
    renderer = fake_renderer(calls)
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", renderer)
    preview.render(project.id, output_id, third)
    full_path = preview.path(project.id, output_id,
        hashlib.sha256(json.dumps({"source": third.source_sha256,
            "operations": [op.model_dump(by_alias=True) for op in third.active], "policy": 1}, sort_keys=True).encode()).hexdigest()[:32])
    full_pcm = full_path.read_bytes()
    full_report = preview.validate(full_path, third.source_sha256, third.frames)
    full_path.unlink()
    full_path.with_suffix(".json").unlink()
    prefix = third.model_copy(update={"operations": third.operations[:2], "cursor": 2})
    preview.render(project.id, output_id, prefix)
    calls.clear()

    diagnostics = {}
    preview.render(project.id, output_id, third, diagnostics=diagnostics)
    assert len(calls) == 1 and len(calls[0][1]) == 1
    assert diagnostics["reusedOperations"] == 2
    assert diagnostics["renderedOperations"] == 1
    assert full_path.read_bytes() == full_pcm
    report = preview.validate(full_path, third.source_sha256, third.frames)
    assert report["paddingFrames"] == full_report["paddingFrames"] == 21
    assert report["maxBoundaryStep"] == pytest.approx(full_report["maxBoundaryStep"])


def test_corrupt_longest_prefix_falls_back_to_earlier_valid_prefix(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    calls = []
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_renderer(calls))
    preview = VoiceEditPreview(store)
    first, second, third = operations(store, project, output_id)
    preview.render(project.id, output_id, first)
    preview.render(project.id, output_id, second)
    prefix2_path = preview.path(project.id, output_id,
        hashlib.sha256(json.dumps({"source": third.source_sha256,
            "operations": [op.model_dump(by_alias=True) for op in third.active[:2]], "policy": 1}, sort_keys=True).encode()).hexdigest()[:32])
    prefix2_path.write_bytes(b"corrupt")
    calls.clear()

    diagnostics = {}
    _url, report = preview.render(project.id, output_id, third, diagnostics=diagnostics)
    assert len(calls) == 1
    assert len(calls[0][1]) == 2
    assert calls[0][0] == preview.path(project.id, output_id,
        hashlib.sha256(json.dumps({"source": third.source_sha256,
            "operations": [op.model_dump(by_alias=True) for op in third.active[:1]], "policy": 1}, sort_keys=True).encode()).hexdigest()[:32])
    assert diagnostics["reusedOperations"] == 1
    assert diagnostics["renderedOperations"] == 2
    assert report["targetFrames"] == third.frames


def test_prefix_accepts_negative_silence_fit_padding_and_accumulates_it(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    calls = []
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_renderer(calls))
    preview = VoiceEditPreview(store)
    first, second, third = operations(store, project, output_id)
    preview.render(project.id, output_id, first)
    preview.render(project.id, output_id, second)
    prefix_path = preview.path(project.id, output_id,
        VoiceEditPreview._key(second.source_sha256,
            [operation.model_dump(by_alias=True) for operation in second.active]))
    prefix_report_path = prefix_path.with_suffix(".json")
    prefix_report = json.loads(prefix_report_path.read_text(encoding="utf-8"))
    prefix_report["paddingFrames"] = -5
    prefix_report_path.write_text(json.dumps(prefix_report), encoding="utf-8")

    _url, report = preview.render(project.id, output_id, third)
    assert report["paddingFrames"] == 2  # -5 prefix fit + 7 suffix fit


def test_prefix_with_incomplete_cumulative_quality_falls_back_to_earlier_prefix(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    calls = []
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_renderer(calls))
    preview = VoiceEditPreview(store)
    first, second, third = operations(store, project, output_id)
    preview.render(project.id, output_id, first)
    preview.render(project.id, output_id, second)
    prefix2_path = preview.path(project.id, output_id,
        VoiceEditPreview._key(second.source_sha256,
            [operation.model_dump(by_alias=True) for operation in second.active]))
    report_path = prefix2_path.with_suffix(".json")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["maxBoundaryStep"] = float("nan")
    report_path.write_text(json.dumps(report), encoding="utf-8")
    calls.clear()

    diagnostics = {}
    preview.render(project.id, output_id, third, diagnostics=diagnostics)
    assert len(calls) == 1 and len(calls[0][1]) == 2
    assert diagnostics["reusedOperations"] == 1 and diagnostics["renderedOperations"] == 2


def test_valid_json_nonobject_cache_report_is_rebuilt(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    calls = []
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_renderer(calls))
    preview = VoiceEditPreview(store)
    first, _second, _third = operations(store, project, output_id)
    preview.render(project.id, output_id, first)
    cache_path = preview.path(project.id, output_id,
        VoiceEditPreview._key(first.source_sha256,
            [operation.model_dump(by_alias=True) for operation in first.active]))
    cache_path.with_suffix(".json").write_text("[]", encoding="utf-8")
    calls.clear()
    _url, report = preview.render(project.id, output_id, first)
    assert len(calls) == 1
    assert report["actualFrames"] == first.frames


def test_full_cache_with_nonfinite_processing_duration_is_rebuilt(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    calls = []
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_renderer(calls))
    preview = VoiceEditPreview(store)
    first, _second, _third = operations(store, project, output_id)
    preview.render(project.id, output_id, first)
    cache_path = preview.path(project.id, output_id,
        VoiceEditPreview._key(first.source_sha256,
            [operation.model_dump(by_alias=True) for operation in first.active]))
    report_path = cache_path.with_suffix(".json")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["processingSeconds"] = float("nan")
    report_path.write_text(json.dumps(report), encoding="utf-8")
    calls.clear()
    _url, rebuilt = preview.render(project.id, output_id, first)
    assert len(calls) == 1
    assert "processingSeconds" not in rebuilt  # fake renderer supplies no metric


@pytest.mark.parametrize(("field", "value"), [
    ("maxBoundaryStep", float("nan")),
    ("maxBoundaryStep", 0.051),
    ("clippedSamples", True),
    ("clippedSamples", 1),
    ("paddingFrames", 1.5),
    ("boundariesWithinLimit", False),
])
def test_full_cache_with_invalid_optional_quality_is_rebuilt(tmp_path, monkeypatch, field, value):
    _, project, output_id, store = setup_store(tmp_path)
    calls = []
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_renderer(calls))
    preview = VoiceEditPreview(store)
    first, _second, _third = operations(store, project, output_id)
    preview.render(project.id, output_id, first)
    cache_path = preview.path(project.id, output_id,
        VoiceEditPreview._key(first.source_sha256,
            [operation.model_dump(by_alias=True) for operation in first.active]))
    report_path = cache_path.with_suffix(".json")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report[field] = value
    report_path.write_text(json.dumps(report), encoding="utf-8")
    calls.clear()

    _url, rebuilt = preview.render(project.id, output_id, first)

    assert len(calls) == 1
    assert rebuilt[field] != value


def test_native_ffmpeg_incremental_prefix_pcm_matches_full_replay_when_available(tmp_path):
    try:
        _resolve_ffmpeg()
    except RuntimeError as exc:
        pytest.skip(f"FFmpeg not available: {exc}")
    _, project, output_id, store = setup_store(tmp_path)
    first, second, third = operations(store, project, output_id)
    source = store.outputs.audio_path(project.id, output_id)
    operations_json = [operation.model_dump(by_alias=True) for operation in third.active]
    baseline_path = tmp_path / "full-replay.wav"
    baseline_report = render_stretch(source, baseline_path, operations_json)

    preview = VoiceEditPreview(store)
    preview.render(project.id, output_id, first)
    preview.render(project.id, output_id, second)
    _url, incremental_report = preview.render(project.id, output_id, third)
    incremental_path = preview.path(project.id, output_id,
        VoiceEditPreview._key(third.source_sha256, operations_json))
    assert incremental_path.read_bytes() == baseline_path.read_bytes()
    assert incremental_report["targetFrames"] == baseline_report["targetFrames"] == third.frames
    assert incremental_report["actualFrames"] == baseline_report["actualFrames"]
    assert incremental_report["paddingFrames"] == baseline_report["paddingFrames"]
    assert incremental_report["maxBoundaryStep"] == baseline_report["maxBoundaryStep"]
    assert hashlib.sha256(source.read_bytes()).hexdigest() == third.source_sha256


def test_fork_and_undo_only_reuse_their_exact_active_prefix(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    calls = []
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", fake_renderer(calls))
    preview = VoiceEditPreview(store)
    first, second, third = operations(store, project, output_id)
    preview.render(project.id, output_id, first)
    preview.render(project.id, output_id, second)
    undone = second.model_copy(update={"cursor": 1})
    fork = undone.model_copy(update={"operations": [*undone.active,
        StretchOperation(startFrame=120000, endFrame=144000, targetFrames=30000)], "cursor": 2})
    calls.clear()
    diagnostics = {}
    preview.render(project.id, output_id, fork, diagnostics=diagnostics)
    assert len(calls) == 1 and len(calls[0][1]) == 1
    assert calls[0][1][0]["targetFrames"] == 30000
    assert diagnostics["reusedOperations"] == 1 and diagnostics["renderedOperations"] == 1

    # An undone document with a one-operation active prefix can use that exact prefix cache.
    calls.clear()
    preview.render(project.id, output_id, undone)
    assert calls == []
    assert third.frames != fork.frames
