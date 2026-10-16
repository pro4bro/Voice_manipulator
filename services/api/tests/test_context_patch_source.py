from __future__ import annotations

import hashlib
import json
import shutil
import struct
import wave
from pathlib import Path

import pytest

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.adapters.context_patch_source import FileContextPatchSource, ContextPatchTransferRequest
from app.domain.models import MediaAssetCreate, TimelineEditRange
from app.domain.voice_edits import VoiceEditDocument
from app.domain.voice_script_document import VoiceScriptDocument
from test_voice_fix import setup_fix


RATE = 24000


def write_wav(path: Path, *, rate: int = RATE, frames: int = RATE * 8, samples: list[int] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if samples is None:
        samples = [5000 if (index // 500) % 2 else -5000 for index in range(frames)]
    with wave.open(str(path), "wb") as audio:
        audio.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        audio.writeframes(struct.pack(f"<{len(samples)}h", *samples))


def setup_context(tmp_path, *, rate: int = RATE, words=None, quality: str = "source", origin: str = "import"):
    project, _outputs, _lease, _speaker, _scripts, _edits, _output, _engine = setup_fix(tmp_path)
    projects = _outputs.projects
    media = FileMediaLibrary(projects)
    scripts = FileVoiceScript(projects)
    root = Path(project.project_path)
    source = root / "assets" / "media" / "asset-context" / "analysis.wav"
    write_wav(source, rate=rate)
    words = words or [
        {"text": "trước", "start": 0.1, "end": 2.3, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "target", "start": 3.0, "end": 3.4, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "lời", "start": 3.5, "end": 3.9, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "sau", "start": 4.6, "end": 6.9, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
    ]
    media.create(project.id, MediaAssetCreate(
        name="Imported annotated speech.wav", source_extension=".wav", media_kind="audio",
        source_path=str(source), analysis_path=str(source), duration=8,
        sample_rate=rate, audio_codec="pcm_s16le", words=words,
        text=" ".join(word["text"] for word in words), word_timing_quality=quality, origin=origin,
        speaker_profile_ids=["speaker-an"],
    ), asset_id="asset-context")
    script = scripts.get(project.id)
    if not script.segments:
        script = scripts.save(project.id, VoiceScriptDocument.model_validate({
            "segments": [{"id": "seg"}],
            "rows": [{"id": "existing", "segmentId": "seg", "voiceId": "voice-an",
                      "speakerProfileId": "speaker-an", "text": "existing"}],
        }))
    store = FileContextPatchSource(media, scripts, projects)
    return project, root, media, scripts, store, source


def transfer(store, project, scripts, *, start=1, end=2):
    return store.transfer(project.id, ContextPatchTransferRequest(
        expectedRevision=0, assetId="asset-context",
        expectedScriptRevision=scripts.get(project.id).revision,
        startWord=start, endWord=end,
    ))


def test_transfer_persists_media_provenance_and_only_whole_clean_context_candidates(tmp_path):
    project, root, _media, scripts, store, source = setup_context(tmp_path)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    document = transfer(store, project, scripts)

    assert document.revision == 1
    assert document.draft.source_kind == "media"
    assert document.draft.asset_id == "asset-context"
    assert document.draft.start_frame == 72000 and document.draft.end_frame == 93600
    assert document.draft.text == "target lời"
    assert {item.side for item in document.draft.context_candidates} == {"before", "after"}
    assert all(item.speaker_profile_id == "speaker-an" for item in document.draft.context_candidates)
    saved = store.path(project.id).read_text(encoding="utf-8")
    assert source_hash in saved
    assert str(root) not in saved
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash


def test_context_candidate_is_extracted_only_after_explicit_selection_and_source_is_unchanged(tmp_path):
    project, root, _media, scripts, store, source = setup_context(tmp_path)
    document = transfer(store, project, scripts)
    candidate = next(item for item in document.draft.context_candidates if item.side == "before")
    source_bytes = source.read_bytes()

    assert not list(root.glob("assets/media/asset-context/context-patch/**/*.wav"))
    selected = store.select_context(project.id, document.revision, candidate.id)
    reference = root / selected.draft.selected_context.artifact_path
    with wave.open(str(reference), "rb") as audio:
        assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) == (1, 2, RATE, "NONE")
        extracted = audio.readframes(audio.getnframes())
    assert selected.draft.selected_context.text == "trước"
    assert hashlib.sha256(reference.read_bytes()).hexdigest() == selected.draft.selected_context.artifact_sha256
    assert source.read_bytes() == source_bytes
    assert reference.is_relative_to(root)


def test_target_review_uses_exact_source_word_bounds_and_survives_context_selection(tmp_path):
    project, _root, media, scripts, store, _source = setup_context(tmp_path)
    document = transfer(store, project, scripts)
    original_words = media.get(project.id, "asset-context").words
    receipt_doc = store.review_target(project.id, document.revision, document.draft.source_sha256,
        document.draft.start_frame, document.draft.end_frame)
    receipt = receipt_doc.draft.reviewed_target
    assert receipt_doc.revision == document.revision + 1
    assert receipt.target_word_indices == [1, 2]
    assert (receipt.start_frame, receipt.end_frame) == (72000, 93600)
    assert receipt.script_revision == document.draft.script_revision
    assert len(receipt.review_key) == 64
    assert store.validate(project.id, receipt_doc.revision, require_context=False)["targetReviewed"] is True
    assert media.get(project.id, "asset-context").words == original_words

    candidate = next(item for item in receipt_doc.draft.context_candidates if item.side == "after")
    selected = store.select_context(project.id, receipt_doc.revision, candidate.id)
    assert selected.draft.reviewed_target == receipt
    validated = store.validate(project.id, selected.revision)
    assert validated["targetReviewed"] is True and validated["reviewKey"] == receipt.review_key


@pytest.mark.parametrize("start,end,indices", [
    (0, 0, [0]),
    (3, 3, [3]),
])
def test_target_review_maps_first_and_last_word_to_exact_frames(tmp_path, start, end, indices):
    project, _root, _media, scripts, store, _source = setup_context(tmp_path)
    document = transfer(store, project, scripts, start=start, end=end)
    receipt_doc = store.review_target(project.id, document.revision, document.draft.source_sha256,
        document.draft.start_frame, document.draft.end_frame)
    receipt = receipt_doc.draft.reviewed_target
    expected = ((2400, 55200) if start == 0 else (110400, 165600))
    assert receipt.target_word_indices == indices
    assert (receipt.start_frame, receipt.end_frame) == expected


def test_target_review_rejects_wrong_hash_or_bounds_and_invalidates_after_script_change(tmp_path):
    project, _root, _media, scripts, store, _source = setup_context(tmp_path)
    document = transfer(store, project, scripts)
    with pytest.raises(ScriptRevisionConflict, match="source hash or frame bounds"):
        store.review_target(project.id, document.revision, "0" * 64,
            document.draft.start_frame, document.draft.end_frame)
    with pytest.raises(ScriptRevisionConflict, match="source hash or frame bounds"):
        store.review_target(project.id, document.revision, document.draft.source_sha256,
            document.draft.start_frame + 1, document.draft.end_frame)
    reviewed = store.review_target(project.id, document.revision, document.draft.source_sha256,
        document.draft.start_frame, document.draft.end_frame)
    scripts.save(project.id, scripts.get(project.id))
    refreshed = store.get(project.id)
    assert refreshed.draft.status == "stale"
    with pytest.raises(ScriptRevisionConflict, match="Script changed"):
        store.validate(project.id, reviewed.revision)


def test_trained_media_source_view_does_not_require_context_or_target_review(tmp_path):
    project, _root, _media, scripts, store, _source = setup_context(tmp_path)
    document = transfer(store, project, scripts)
    view = store.validate(project.id, document.revision, require_context=False)
    assert view["context"] is None
    assert view["targetReviewed"] is False
    assert view["sourceKind"] == "media"
    assert view["audio_path"].is_file()


def test_tampered_review_receipt_is_not_current(tmp_path):
    project, _root, _media, scripts, store, _source = setup_context(tmp_path)
    document = transfer(store, project, scripts)
    reviewed = store.review_target(project.id, document.revision, document.draft.source_sha256,
        document.draft.start_frame, document.draft.end_frame)
    path = store.path(project.id)
    record = json.loads(path.read_text(encoding="utf-8"))
    record["draft"]["reviewedTarget"]["reviewKey"] = "f" * 64
    path.write_text(json.dumps(record), encoding="utf-8")
    assert store.get(project.id).draft.reviewed_target is None
    assert store.validate(project.id, reviewed.revision, require_context=False)["targetReviewed"] is False


def test_validate_returns_in_memory_output_like_view_and_empty_edit_without_persisting_output(tmp_path):
    project, _root, _media, scripts, store, _source = setup_context(tmp_path)
    draft = transfer(store, project, scripts).draft
    candidate = next(item for item in draft.context_candidates if item.side == "after")
    selected = store.select_context(project.id, 1, candidate.id)
    outputs_before = list((Path(project.project_path) / "assets" / "voice-output").glob("*/output.json"))

    validated = store.validate(project.id, selected.revision)
    assert validated["draft"].source_kind == "media"
    assert validated["output"].id == "asset-context"
    assert validated["output"].engine == "source-media"
    assert validated["output"].parameters["sourceKind"] == "media"
    assert [segment.text for segment in validated["output"].segments] == ["trước", "target lời", "sau"]
    assert validated["output"].text == "trước\ntarget lời\nsau"
    target_segment = next(segment for segment in validated["output"].segments if segment.row_id == validated["draft"].row_id)
    assert target_segment.speaker_profile_id == "speaker-an"
    assert [word["segmentIndex"] for word in validated["output"].words] == [0, 1, 1, 2]
    assert [word["text"] for word in validated["output"].words] == ["trước", "target", "lời", "sau"]
    assert validated["edit"].active == [] and validated["edit"].revision == 0
    assert validated["context"]["text"] == "sau"
    assert outputs_before == list((Path(project.project_path) / "assets" / "voice-output").glob("*/output.json"))


def test_recorded_media_is_an_explicit_source_kind_with_full_source_segments(tmp_path):
    project, _root, _media, scripts, store, _source = setup_context(tmp_path, origin="record")
    draft = transfer(store, project, scripts).draft
    candidate = next(item for item in draft.context_candidates if item.side == "after")
    selected = store.select_context(project.id, 1, candidate.id)

    validated = store.validate(project.id, selected.revision)
    output = validated["output"]
    assert validated["draft"].source_origin == "record"
    assert output.parameters["sourceOrigin"] == "record"
    assert all(segment.script_row["sourceOrigin"] == "record" for segment in output.segments)
    assert output.segments[0].voice_id == "source-media"
    assert output.segments[1].voice_id == "context-clone"


def test_source_output_keeps_other_and_unknown_speaker_runs(tmp_path):
    project, _root, _media, scripts, store, _source = setup_context(tmp_path, words=[
        {"text": "before", "start": 0.1, "end": 2.3, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "target", "start": 3.0, "end": 3.4, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "other", "start": 3.6, "end": 4.0, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-binh"},
        {"text": "unknown", "start": 4.2, "end": 4.6, "timingTrusted": True, "timingSource": "stt"},
    ])
    draft = transfer(store, project, scripts, start=1, end=1).draft
    before = next(item for item in draft.context_candidates if item.side == "before")
    selected = store.select_context(project.id, 1, before.id)
    output = store.validate(project.id, selected.revision)["output"]

    other = next(segment for segment in output.segments if segment.text == "other")
    unknown = next(segment for segment in output.segments if segment.text == "unknown")
    assert other.speaker_profile_id == "speaker-binh"
    assert other.script_row["speakerProfileId"] == "speaker-binh"
    assert unknown.speaker_profile_id == "unknown-speaker"
    assert output.word_timing_quality == "source"
    assert [word["text"] for word in output.words] == ["before", "target", "other", "unknown"]
    unknown_word = next(word for word in output.words if word["text"] == "unknown")
    assert unknown_word["segmentIndex"] == next(
        index for index, segment in enumerate(output.segments) if segment.text == "unknown"
    )


@pytest.mark.parametrize("change", ["other-speaker", "untimed", "untrusted"])
def test_transfer_rejects_target_words_without_one_explicit_trusted_speaker(tmp_path, change):
    words = [
        {"text": "target", "start": 1.0, "end": 1.3, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "next", "start": 1.4, "end": 1.8, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
    ]
    if change == "other-speaker":
        words[1]["speakerId"] = "speaker-binh"
    elif change == "untimed":
        words[1].pop("speakerId")
    else:
        words[1]["timingSource"] = "user-interpolated"
    project, _root, _media, scripts, store, _source = setup_context(tmp_path, words=words)

    with pytest.raises(ValueError, match="speaker|Speaker Profile|timing|trusted"):
        transfer(store, project, scripts, start=0, end=1)


def test_context_candidates_exclude_overlap_removed_ranges_and_unowned_words(tmp_path):
    project, root, media, scripts, store, _source = setup_context(tmp_path, words=[
        {"text": "before", "start": 0.1, "end": 2.3, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "target", "start": 3.0, "end": 3.4, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "after", "start": 4.6, "end": 6.9, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
    ])
    asset = media.get(project.id, "asset-context")
    media.update_timeline_edits(project.id, asset.id, [TimelineEditRange(start=4.0, end=4.3)])
    diarization = root / "assets" / "media" / asset.id / "diarization" / "spans.json"
    diarization.parent.mkdir(parents=True)
    diarization.write_text(json.dumps({"spans": [], "overlaps": [{"start": 5.0, "end": 5.5}]}), encoding="utf-8")

    document = transfer(store, project, scripts, start=1, end=1)
    assert [item.side for item in document.draft.context_candidates] == ["before"]


@pytest.mark.parametrize("gap_blocker", ["removed", "diarization-overlap"])
def test_transfer_rejects_removed_or_foreign_audio_only_between_selected_words(tmp_path, gap_blocker):
    words = [
        {"text": "before", "start": 0.1, "end": 2.3, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "target-a", "start": 3.0, "end": 3.2, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "target-b", "start": 3.6, "end": 3.9, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
        {"text": "after", "start": 4.6, "end": 6.9, "timingTrusted": True, "timingSource": "stt", "speakerId": "speaker-an"},
    ]
    project, root, media, scripts, store, _source = setup_context(tmp_path, words=words)
    asset = media.get(project.id, "asset-context")
    if gap_blocker == "removed":
        media.update_timeline_edits(project.id, asset.id, [TimelineEditRange(start=3.3, end=3.5)])
        error = "removed|out-of-range"
    else:
        diarization = root / "assets" / "media" / asset.id / "diarization" / "spans.json"
        diarization.parent.mkdir(parents=True)
        diarization.write_text(json.dumps({"spans": [], "overlaps": [{"start": 3.3, "end": 3.5}]}), encoding="utf-8")
        error = "overlaps|diarization"

    with pytest.raises(ValueError, match=error):
        transfer(store, project, scripts, start=1, end=2)


def test_bad_media_qc_clipping_silence_or_non_pcm_is_refused(tmp_path):
    project, root, media, scripts, store, source = setup_context(tmp_path)
    source.write_bytes(b"not a wav")
    with pytest.raises(ValueError, match="PCM|WAV"):
        transfer(store, project, scripts)

    project, root, media, scripts, store, source = setup_context(tmp_path / "clipped")
    clipped = [1000] * (RATE * 8)
    clipped[3 * RATE + 1] = 32767
    write_wav(source, frames=RATE * 8, samples=clipped)
    with pytest.raises(ValueError, match="clip"):
        transfer(store, project, scripts)

    project, root, media, scripts, store, _source = setup_context(tmp_path / "rate", rate=48000)
    with pytest.raises(ValueError, match="24 kHz"):
        transfer(store, project, scripts)

    project, root, media, scripts, store, source = setup_context(tmp_path / "silence")
    write_wav(source, frames=RATE * 8, samples=[0] * (RATE * 8))
    with pytest.raises(ValueError, match="silent"):
        transfer(store, project, scripts)


def test_source_changes_after_transfer_make_get_and_context_selection_stale(tmp_path):
    project, _root, _media, scripts, store, source = setup_context(tmp_path)
    document = transfer(store, project, scripts)
    candidate = document.draft.context_candidates[0]
    data = bytearray(source.read_bytes())
    data[-2] ^= 1
    source.write_bytes(data)

    assert store.get(project.id).draft.status == "stale"
    with pytest.raises(ScriptRevisionConflict, match="stale|changed"):
        store.select_context(project.id, document.revision, candidate.id)


def test_script_change_marks_source_stale_and_does_not_regenerate_candidates(tmp_path):
    project, _root, _media, scripts, store, _source = setup_context(tmp_path)
    document = transfer(store, project, scripts)
    original = document.draft.context_candidates
    changed = scripts.get(project.id)
    changed.rows[0].text = "changed after selection"
    scripts.save(project.id, changed)

    reopened = store.get(project.id)
    assert reopened.draft.status == "stale"
    assert reopened.draft.context_candidates == original
    with pytest.raises(ScriptRevisionConflict, match="Script"):
        store.validate(project.id, document.revision)


def test_move_and_reopen_preserves_media_source_draft_portably(tmp_path):
    project, _root, _media, scripts, store, _source = setup_context(tmp_path)
    document = transfer(store, project, scripts)
    moved = tmp_path / "moved-context-project"
    shutil.move(project.project_path, moved)
    _outputs = store.media.projects
    _outputs.open(moved)
    reopened = FileContextPatchSource(FileMediaLibrary(_outputs), FileVoiceScript(_outputs), _outputs)
    loaded = reopened.get(project.id)

    assert loaded.revision == document.revision
    assert loaded.draft.status == "ready"
    assert str(moved) not in reopened.path(project.id).read_text(encoding="utf-8")


@pytest.mark.parametrize("change", ["text", "path", "bytes", "target"])
def test_selected_reference_and_target_are_rederived_from_current_source(tmp_path, change):
    project, root, _media, scripts, store, _source = setup_context(tmp_path)
    document = transfer(store, project, scripts)
    document = store.select_context(project.id, document.revision, document.draft.context_candidates[0].id)
    payload = json.loads(store.path(project.id).read_text(encoding="utf-8"))
    selected = payload["draft"]["selectedContext"]
    if change == "text":
        selected["text"] = "A different person or transcript"
    elif change == "path":
        selected["artifactPath"] = "assets/media/asset-context/analysis.wav"
        selected["artifactSha256"] = hashlib.sha256((root / selected["artifactPath"]).read_bytes()).hexdigest()
    elif change == "target":
        payload["draft"]["startFrame"] += 10
    else:
        path = root / selected["artifactPath"]
        data = bytearray(path.read_bytes()); data[-2] ^= 1; path.write_bytes(data)
        # A matching stored hash alone must never relabel different source PCM.
        selected["artifactSha256"] = hashlib.sha256(data).hexdigest()
    store.path(project.id).write_text(json.dumps(payload), encoding="utf-8")
    assert store.get(project.id).draft.status in {"stale", "missing"}
    with pytest.raises(ScriptRevisionConflict):
        store.validate(project.id, document.revision)

