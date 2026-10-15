from array import array
import pytest

from app.domain.duration_plan import allocate_duration, Budget, distribute, RATE
from app.domain.voice_script_document import VoiceScriptDocument
from app.adapters.duration_fitting import fit_duration
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.domain.models import VoiceScriptRequest, VoiceScriptRow
from test_voice_script import FakeEngine, speaker_fixture, write_tone


def document():
    return VoiceScriptDocument.model_validate({"settings": {"duration": 8}, "segments": [{"id": "a", "settings": {"duration": 4}}, {"id": "b"}], "rows": [
        {"id": "r1", "segmentId": "a", "text": "Xin chào", "settings": {"duration": 1.5, "locked": ["duration"]}},
        {"id": "r2", "segmentId": "a", "text": "Chào anh nhé"}, {"id": "r3", "segmentId": "b", "text": "Tạm biệt"}]})


def test_nested_budgets_include_pauses_and_pin_only_explicit_units():
    doc = document()
    plan = allocate_duration(doc, doc.rows, .35)
    durations = [plan["rows"][row.id]["duration"] for row in doc.rows]
    assert durations == [1.5, 2.15, 3.65]
    assert sum(round(value * RATE) for value in durations) + 2 * round(.35 * RATE) == 8 * RATE
    with pytest.raises(ValueError, match="toàn bộ"): allocate_duration(doc, doc.rows[:2], .35)
    doc.settings.duration = 2
    with pytest.raises(ValueError, match="Không-fit"): allocate_duration(doc, doc.rows, .35)


def test_integer_allocation_handles_simultaneous_lower_upper_bounds_and_fractional_samples():
    children = [Budget("a", 0, 8, 100), Budget("b", 4, 100, 1)]
    assert distribute(10, children) == [6, 4]
    for total in [10001, 10002, 10003]:
        result = distribute(total, [Budget(str(i), 1, 20000, i + 1) for i in range(3)])
        assert sum(result) == total and min(result) >= 1


def test_reference_priority_unknown_mapping_and_impossible_multilingual_budgets():
    doc = document(); doc.settings.duration = None; doc.segments[0].settings.duration = None
    doc.rows[0].settings.duration = None; doc.rows[0].settings.locked = []
    timing = {"r2": {"state": "ready", "requestedDuration": 3}}
    plan = allocate_duration(doc, doc.rows, .35, timing)
    assert plan["rows"]["r1"]["duration"] is None
    assert plan["rows"]["r2"]["duration"] == 3
    timing["r2"]["state"] = "stale"
    with pytest.raises(ValueError, match="stale"): allocate_duration(doc, doc.rows, .35, timing)
    for text in ["你好世界" * 30, "こんにちは" * 30, "안녕하세요" * 30, "Xin chào " * 30]:
        doc.rows[2].text = text; doc.rows[2].settings.duration = .2
        with pytest.raises(ValueError, match="Không-fit"): allocate_duration(doc, doc.rows, .35)


def test_fit_never_cuts_audible_samples_or_hides_large_padding_clipping_and_silence():
    frames = array("h", [100] * round(.98 * RATE)).tobytes()
    fitted, report = fit_duration(frames, 1)
    assert len(fitted) == RATE * 2 and fitted.startswith(frames)
    assert report["paddingSeconds"] == .02 and report["speechVerified"] is False
    with pytest.raises(ValueError, match="chứa âm thanh"): fit_duration(frames, .96)
    with pytest.raises(ValueError, match="Không-fit"): fit_duration(frames, 2)
    with pytest.raises(ValueError, match="clipping"): fit_duration(array("h", [32767] * RATE).tobytes(), 1)
    with pytest.raises(ValueError, match="im lặng"): fit_duration(b"\0" * RATE * 2, 1)


class DurationEngine(FakeEngine):
    def request(self, payload):
        self.spoken.append(payload["text"])
        seconds = payload.get("duration") or .5
        write_tone(__import__("pathlib").Path(payload["output"]), seconds, rate=RATE)
        return {"ok": True, "seconds": seconds}


def test_worker_uses_native_targets_reuses_only_matching_units_and_preserves_voice(tmp_path):
    engine = DurationEngine()
    project, an, binh, outputs, _, speaker, _ = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    scripts = FileVoiceScript(speaker.projects)
    doc = document(); doc.rows[0].voice_id = an.id; doc.rows[1].voice_id = binh.id; doc.rows[2].voice_id = an.id
    doc = scripts.save(project.id, doc)
    def request(): return VoiceScriptRequest(script_revision=doc.revision, rows=[VoiceScriptRow(id=row.id, voice_id=row.voice_id, text=row.text) for row in doc.rows])
    first = speaker.start(project.id, request(), background=False)
    assert first.status == "complete", first.error
    assert first.output.duration == pytest.approx(8, abs=1/RATE)
    assert [row.requested_duration for row in first.output.segments] == [1.5, 2.15, 3.65]
    assert [row.voice_id for row in first.output.segments] == [an.id, binh.id, an.id]
    assert all(row.duration_report["durationError"] == 0 for row in first.output.segments)
    assert speaker.start(project.id, request(), background=False).reused == 3
    doc.rows[0].settings.duration = 2; doc = scripts.save(project.id, doc)
    changed = speaker.start(project.id, request(), background=False)
    assert changed.reused == 1 and changed.output.duration == 8
    # The affected segment reallocates r2; the independent r3 reuses its WAV.
    assert changed.output.segments[2].clip == first.output.segments[2].clip
    with pytest.raises(ScriptRevisionConflict): speaker.start(project.id, request().model_copy(update={"script_revision": 0}), background=False)


def test_whole_sentence_reference_timing_feeds_native_duration_without_switching_voice(tmp_path):
    from app.adapters.file_media_library import FileMediaLibrary
    from app.adapters.file_reference_bindings import FileReferenceBindings
    from app.adapters.reference_resolver import ReferenceResolver
    from app.adapters.file_timing_plans import FileTimingPlans
    from app.domain.models import MediaAssetCreate
    from app.domain.reference_bindings import ReferenceAssignment
    from pathlib import Path
    engine = DurationEngine()
    project, an, _, outputs, _, speaker, _ = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    scripts = speaker.scripts
    doc = scripts.save(project.id, VoiceScriptDocument.model_validate({"segments": [{"id": "scene"}], "rows": [{"id": "r", "text": "Xin chào", "voiceId": an.id, "speakerProfileId": an.speaker_profile_id, "segmentId": "scene"}]}))
    path = Path(project.project_path) / "assets/real-pcm-fixture.wav"
    write_tone(path, 3)
    media = FileMediaLibrary(speaker.projects)
    asset = media.create(project.id, MediaAssetCreate(name="PCM fixture, not speech quality evidence", source_extension=".wav", media_kind="audio", source_path=str(path), analysis_path=str(path), duration=3, origin="import", reference_selected=True))
    store = FileReferenceBindings(speaker.projects, media, outputs, scripts)
    store.assign(project.id, ReferenceAssignment.model_validate({"scope": {"kind": "script", "id": project.id, "revision": str(doc.revision)}, "expectedRevision": 0, "targets": [{"id": "r", "rowIds": ["r"], "text": "Xin chào"}], "sources": [{"assetId": asset.id, "start": .5, "end": 2.5, "properties": ["timing"]}]}))
    speaker.timing_plans = FileTimingPlans(ReferenceResolver(store))
    request = VoiceScriptRequest(script_revision=doc.revision, timing_revision=0, reference_revision=1, rows=[VoiceScriptRow(id="r", voice_id=an.id, text="Xin chào")])
    job = speaker.start(project.id, request, background=False)
    assert job.status == "complete", job.error
    assert job.output.duration == 2 and job.output.segments[0].voice_id == an.id
    assert job.output.segments[0].timing_report["anchorStatus"] == "unknown"
    assert speaker.start(project.id, request, background=False).reused == 1


def test_unbroken_latin_text_cannot_evade_feasibility_or_reach_model_preparation(tmp_path, monkeypatch):
    engine = DurationEngine()
    project, an, _, _, lease, speaker, _ = speaker_fixture(tmp_path, engine)
    text = "a" * 5000  # Valid Script input size, without whitespace word boundaries.
    doc = speaker.scripts.save(project.id, VoiceScriptDocument.model_validate({"segments": [{"id": "scene"}], "rows": [{"id": "r", "text": text, "voiceId": an.id, "segmentId": "scene", "settings": {"duration": .12, "locked": ["duration"]}}]}))
    monkeypatch.setattr(speaker.generator, "prepare", lambda *args, **kwargs: pytest.fail("infeasible input reached model preparation"))
    request = VoiceScriptRequest(script_revision=doc.revision, rows=[VoiceScriptRow(id="r", voice_id=an.id, text=text)])
    with pytest.raises(ValueError, match="Không-fit"): speaker.start(project.id, request, background=False)
    assert engine.spoken == [] and lease.holder() is None
