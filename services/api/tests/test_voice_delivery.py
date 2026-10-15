from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.voice_delivery_routes import make_voice_delivery_router
from app.domain.voice_delivery import inspect_voice_delivery
from app.domain.voice_script_document import VoiceScriptDocument
import pytest
from app.domain.models import VoiceScriptRequest, VoiceScriptRow
from test_voice_script import FakeEngine, speaker_fixture


def test_neutral_baseline_uses_existing_voice_but_whisper_fails_before_engine(tmp_path):
    engine = FakeEngine()
    project, voice, _, _, _, speaker, _ = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    row = VoiceScriptRow(id="r", voice_id=voice.id, text="Xin chào", settings={"delivery": "neutral", "emotion": "normal"})
    job = speaker.start(project.id, VoiceScriptRequest(rows=[row]), background=False)
    assert job.status == "complete"
    count = len(engine.spoken)
    with pytest.raises(ValueError, match="delivery"):
        speaker.start(project.id, VoiceScriptRequest(rows=[row.model_copy(update={"settings": {"delivery": "whisper"}})]), background=False)
    assert len(engine.spoken) == count


def script_document():
    return VoiceScriptDocument.model_validate({
        "settings": {"delivery": "neutral"},
        "segments": [{"id": "seg-1", "settings": {"delivery": "whisper"}}],
        "rows": [
            {"id": "row-1", "segmentId": "seg-1", "voiceId": "voice-1", "text": "Xin chào", "settings": {"mood": "reassuring"}},
            {"id": "row-2", "segmentId": "seg-1", "voiceId": "voice-1", "text": "Tạm biệt", "settings": {"delivery": "neutral"}},
        ],
    })


def test_delivery_report_resolves_inheritance_and_keeps_specific_requests_unsupported():
    report = inspect_voice_delivery(script_document())

    assert report.script_revision == 0
    assert [row.row_id for row in report.rows] == ["row-1", "row-2"]
    first = report.rows[0]
    assert first.settings["delivery"].requested == "whisper"
    assert first.settings["delivery"].effective is None
    assert first.settings["delivery"].state == "unsupported"
    assert first.settings["mood"].requested == "reassuring"
    assert first.settings["mood"].state == "unsupported"
    assert not first.synthesis_ready

    second = report.rows[1]
    assert second.settings["delivery"].state == "supported"
    assert second.settings["delivery"].effective == "neutral"
    assert second.settings["delivery"].method == "selected-project-voice-default"
    assert second.settings["mood"].state == "not-requested"
    assert second.synthesis_ready


def test_unknown_emotion_and_intensity_do_not_become_gain_or_silent_success():
    document = VoiceScriptDocument.model_validate({
        "segments": [{"id": "seg"}],
        "rows": [{"id": "row", "segmentId": "seg", "voiceId": "voice-1", "text": "Xin chào",
                  "settings": {"emotion": "mystery-feeling", "intensity": 0.7, "gainDb": 6}}],
    })

    row = inspect_voice_delivery(document).rows[0]
    assert row.settings["emotion"].requested == "mystery-feeling"
    assert row.settings["emotion"].state == "unsupported"
    assert row.settings["intensity"].requested == 0.7
    assert row.settings["intensity"].state == "unsupported"
    assert "gain âm lượng" in row.settings["intensity"].reason.lower()
    assert row.settings["gainDb"].requested == 6
    assert row.settings["gainDb"].state == "separate"
    assert not row.synthesis_ready


def test_note_only_and_neutral_only_are_ready_but_missing_voice_is_blocked():
    document = VoiceScriptDocument.model_validate({
        "segments": [{"id": "seg"}],
        "rows": [
            {"id": "note-only", "segmentId": "seg", "voiceId": "voice-1", "text": "Xin chào", "settings": {"note": "giữ nhịp chậm"}},
            {"id": "neutral", "segmentId": "seg", "voiceId": "voice-1", "text": "Tạm biệt", "settings": {"emotion": "normal", "delivery": "neutral"}},
            {"id": "no-voice", "segmentId": "seg", "text": "Thiếu voice", "settings": {"delivery": "neutral"}},
            {"id": "gain-only", "segmentId": "seg", "voiceId": "voice-1", "text": "Gain riêng", "settings": {"gainDb": 3}},
        ],
    })

    rows = inspect_voice_delivery(document).rows
    assert rows[0].synthesis_ready and rows[0].settings["note"].state == "informational"
    assert rows[1].synthesis_ready and rows[1].settings["emotion"].effective == "normal"
    assert not rows[2].synthesis_ready and rows[2].state == "blocked"
    assert rows[2].settings["delivery"].state == "blocked"
    assert rows[3].settings["gainDb"].state == "separate"
    assert not rows[3].synthesis_ready


def test_capability_route_accepts_script_document_without_running_a_processor():
    app = FastAPI()
    app.include_router(make_voice_delivery_router())

    response = TestClient(app).post(
        "/api/voice-script/delivery-capabilities",
        json=script_document().model_dump(mode="json", by_alias=True),
    )

    assert response.status_code == 200
    result = response.json()
    assert result["rows"][0]["synthesisReady"] is False
    assert result["rows"][0]["settings"]["delivery"]["method"] is None
    assert "chưa được áp dụng" in result["rows"][0]["settings"]["delivery"]["reason"].lower()
