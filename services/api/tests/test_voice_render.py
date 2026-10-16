from __future__ import annotations

import json
import shutil
import struct
import wave

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.adapters.file_voice_script import ScriptRevisionConflict
from app.adapters.voice_edit_preview import VoiceEditPreview
from app.adapters.voice_render_routes import make_voice_render_router
from app.domain.voice_edits import StretchOperation, VoiceEditCommand
from app.domain.voice_script_document import ScriptSettings
from test_voice_edits import setup_store


def setup_render(tmp_path, *, sample: int = 4000):
    projects, project, output_id, edits = setup_store(tmp_path)
    source = edits.outputs.audio_path(project.id, output_id)
    with wave.open(str(source), "wb") as pcm:
        pcm.setparams((1, 2, 24000, 0, "NONE", "none"))
        pcm.writeframes(struct.pack("<h", sample) * 240000)
    script = edits.scripts.get(project.id)
    row = script.rows[0].model_copy(update={"voice_id": "v"})
    script = script.model_copy(update={"rows": [row]})
    script = edits.scripts.save(project.id, script)
    app = FastAPI()
    app.include_router(make_voice_render_router(edits, edits.scripts))
    return project, output_id, edits, source, script, TestClient(app)


def post(client: TestClient, project_id: str, output_id: str, *, script_revision: int = 2, edit_revision: int = 0):
    return client.post(f"/api/projects/{project_id}/voice-outputs/{output_id}/render", json={
        "expectedScriptRevision": script_revision,
        "expectedEditRevision": edit_revision,
    })


def read_pcm(path):
    with wave.open(str(path), "rb") as wav:
        return wav.getframerate(), list(struct.unpack(f"<{wav.getnframes()}h", wav.readframes(wav.getnframes())))


def test_render_applies_inherited_clip_gain_once_and_returns_identical_audio(tmp_path):
    project, output_id, edits, source, script, client = setup_render(tmp_path)
    before_source = source.read_bytes()
    before_output = edits.outputs.get(project.id, output_id).model_dump(mode="json")
    script.settings.gain_db = 6
    edits.scripts.save(project.id, script)

    with client:
        response = post(client, project.id, output_id, script_revision=3)
        assert response.status_code == 200, response.text
        packet = response.json()
        audio = client.get(packet["audioUrl"])
        latest = client.get(f"/api/projects/{project.id}/voice-outputs/{output_id}/render")
        overview = client.get(packet["audioUrl"].replace("/audio", "/waveform"))

    assert audio.status_code == latest.status_code == overview.status_code == 200
    assert audio.headers["content-disposition"].endswith('filename="voice-render.wav"')
    assert latest.json() == packet
    assert overview.json()["duration"] == pytest.approx(10)
    rendered = tmp_path / "download.wav"
    rendered.write_bytes(audio.content)
    _, samples = read_pcm(rendered)
    assert samples[48000 + 120:96000 - 120] == [round(4000 * 10 ** (6 / 20))] * (48000 - 240)
    assert packet["report"]["regions"][0]["requestedGainDb"] == 0
    assert packet["report"]["regions"][0]["requestedTotalGainDb"] == 6
    assert packet["output"]["duration"] == 10
    assert packet["sourceFrameCount"] == 240000
    assert source.read_bytes() == before_source
    assert edits.outputs.get(project.id, output_id).model_dump(mode="json") == before_output


def test_render_accepts_resolved_output_voice_for_same_profile_but_rejects_other_profile(tmp_path):
    project, output_id, edits, _, script, client = setup_render(tmp_path)
    script.rows[0].voice_id = None
    script.rows[0].speaker_profile_id = "s"
    script.settings.gain_db = -3
    saved = edits.scripts.save(project.id, script)
    with client:
        response = post(client, project.id, output_id, script_revision=saved.revision)
        assert response.status_code == 200, response.text
        saved.rows[0].speaker_profile_id = "other-profile"
        saved = edits.scripts.save(project.id, saved)
        assert post(client, project.id, output_id, script_revision=saved.revision).status_code == 409


@pytest.mark.parametrize("excess,expected", [(2, 200), (13, 400)])
def test_render_only_snaps_final_endpoint_within_three_decimal_precision(tmp_path, excess, expected):
    project, output_id, edits, source, script, client = setup_render(tmp_path)
    output = edits.outputs.get(project.id, output_id)
    output.segments[0].end = 10
    edits.outputs.save(project.id, output)
    with wave.open(str(source), "wb") as pcm:
        pcm.setparams((1, 2, 24000, 0, "NONE", "none"))
        pcm.writeframes(struct.pack("<h", 4000) * (240000 - excess))
    script.settings.gain_db = -3
    saved = edits.scripts.save(project.id, script)
    with client:
        result = post(client, project.id, output_id, script_revision=saved.revision)
        assert result.status_code == expected, result.text
        if expected == 200:
            assert result.json()["sourceFrameCount"] == 239998
            assert result.json()["report"]["durationPrecisionClamps"] == [{"rowId": "r", "frames": 2}]


def test_gain_compares_normalized_script_speech_text(tmp_path):
    project, output_id, edits, _, script, client = setup_render(tmp_path)
    script.rows[0].text = "  Hello  \n"
    script.settings.gain_db = -3
    saved = edits.scripts.save(project.id, script)
    with client:
        response = post(client, project.id, output_id, script_revision=saved.revision)
        assert response.status_code == 200, response.text


def test_row_gain_replaces_clip_inherited_value_and_locked_segment_blocks_row_override(tmp_path):
    project, output_id, edits, source, script, client = setup_render(tmp_path)
    script.settings.gain_db = 6
    row = script.rows[0].model_copy(update={"settings": ScriptSettings(gainDb=-6)})
    script = edits.scripts.save(project.id, script.model_copy(update={"rows": [row]}))

    with client:
        first = post(client, project.id, output_id, script_revision=3)
        assert first.status_code == 200, first.text
        region = first.json()["report"]["regions"][0]
        assert region["requestedGainDb"] == -6
        assert region["requestedTotalGainDb"] == 0
        assert region["appliedTotalGainDb"] == pytest.approx(0)

        script = edits.scripts.get(project.id)
        segment = script.segments[0].model_copy(update={"settings": ScriptSettings(gainDb=3, locked=["gainDb"])})
        row = script.rows[0].model_copy(update={"settings": ScriptSettings(gainDb=-6)})
        script = edits.scripts.save(project.id, script.model_copy(update={"segments": [segment], "rows": [row]}))
        second = post(client, project.id, output_id, script_revision=4)
        assert second.status_code == 200, second.text
        region = second.json()["report"]["regions"][0]
        assert region["requestedGainDb"] == 3
        assert region["requestedTotalGainDb"] == 9

        script = edits.scripts.get(project.id)
        script.settings = ScriptSettings(gainDb=6, locked=["gainDb"])
        script = edits.scripts.save(project.id, script)
        third = post(client, project.id, output_id, script_revision=5)
        assert third.status_code == 200, third.text
        region = third.json()["report"]["regions"][0]
        assert region["requestedGainDb"] == 0
        assert region["requestedTotalGainDb"] == 6


@pytest.mark.parametrize("damage", ["wav", "report"])
def test_post_rebuilds_corrupt_render_cache(tmp_path, monkeypatch, damage):
    project, output_id, edits, _source, _script, client = setup_render(tmp_path)
    import app.adapters.voice_render as render_adapter
    original = render_adapter.render_loudness
    calls = []

    def tracked(*args, **kwargs):
        calls.append(1)
        return original(*args, **kwargs)

    monkeypatch.setattr(render_adapter, "render_loudness", tracked)
    with client:
        first = post(client, project.id, output_id)
        assert first.status_code == 200, first.text
        audio_path = edits.outputs.audio_path(project.id, output_id).parent / "rendered" / f"{first.json()['cacheKey']}.wav"
        if damage == "wav":
            audio_path.write_bytes(b"broken")
        else:
            report_path = audio_path.with_suffix(".json")
            report = json.loads(report_path.read_text(encoding="utf-8"))
            report["outputSha256"] = "bad"
            report_path.write_text(json.dumps(report), encoding="utf-8")
        second = post(client, project.id, output_id)

    assert second.status_code == 200, second.text
    assert len(calls) == 2
    assert second.json()["cacheKey"] == first.json()["cacheKey"]
    with wave.open(str(audio_path), "rb") as rendered:
        assert rendered.getnframes() == 240000


def test_active_stretch_preview_is_render_input_and_maps_segment_frames(tmp_path, monkeypatch):
    project, output_id, edits, source, _script, client = setup_render(tmp_path)

    def stretch(source_path, destination, operations):
        destination.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(destination), "wb") as pcm:
            pcm.setparams((1, 2, 24000, 0, "NONE", "none"))
            pcm.writeframes(struct.pack("<h", 4000) * 264000)
        return {"actualFrames": 264000, "clippedSamples": 0}

    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", stretch)
    edits.change(project.id, output_id, VoiceEditCommand(revision=0, scriptRevision=2,
        operation=StretchOperation(startFrame=48000, endFrame=96000, targetFrames=72000)))
    original = source.read_bytes()

    with client:
        response = post(client, project.id, output_id, edit_revision=1)

    assert response.status_code == 200, response.text
    packet = response.json()
    assert packet["sourceFrameCount"] == 264000
    assert packet["output"]["duration"] == pytest.approx(11)
    assert packet["report"]["frames"] == 264000
    region = packet["report"]["regions"][0]
    assert region["startFrame"] == 48000 and region["endFrame"] == 120000
    assert source.read_bytes() == original


def test_stale_script_change_during_render_discards_artifact_and_pointer(tmp_path, monkeypatch):
    project, output_id, edits, _source, script, client = setup_render(tmp_path)
    import app.adapters.voice_render as render_adapter
    original = render_adapter.render_loudness

    def edit_script_during_render(*args, **kwargs):
        result = original(*args, **kwargs)
        current = edits.scripts.get(project.id)
        edits.scripts.save(project.id, current.model_copy(update={"settings": current.settings.model_copy(update={"note": "changed"})}))
        return result

    monkeypatch.setattr(render_adapter, "render_loudness", edit_script_during_render)
    with client:
        response = post(client, project.id, output_id)
        latest = client.get(f"/api/projects/{project.id}/voice-outputs/{output_id}/render")

    assert response.status_code == 409
    assert latest.status_code == 404
    rendered = edits.outputs.audio_path(project.id, output_id).parent / "rendered"
    assert not list(rendered.glob("*.wav"))
    assert not (rendered / "latest-render.json").exists()


def test_stale_edit_change_during_render_discards_artifact_and_pointer(tmp_path, monkeypatch):
    project, output_id, edits, _source, _script, client = setup_render(tmp_path)
    import app.adapters.voice_render as render_adapter
    original = render_adapter.render_loudness

    def edit_timeline_during_render(*args, **kwargs):
        result = original(*args, **kwargs)
        edits.change(project.id, output_id, VoiceEditCommand(revision=0, scriptRevision=2,
            operation=StretchOperation(startFrame=48000, endFrame=96000, targetFrames=72000)))
        return result

    monkeypatch.setattr(render_adapter, "render_loudness", edit_timeline_during_render)
    with client:
        response = post(client, project.id, output_id)

    assert response.status_code == 409
    rendered = edits.outputs.audio_path(project.id, output_id).parent / "rendered"
    assert not list(rendered.glob("*.wav"))
    assert not (rendered / "latest-render.json").exists()


def test_get_render_is_404_when_missing_or_stale_and_script_must_match_output(tmp_path):
    project, output_id, edits, _source, script, client = setup_render(tmp_path)
    with client:
        assert client.get(f"/api/projects/{project.id}/voice-outputs/{output_id}/render").status_code == 404
        row = script.rows[0].model_copy(update={"text": "Changed", "voice_id": "other"})
        edits.scripts.save(project.id, script.model_copy(update={"rows": [row]}))
        stale = post(client, project.id, output_id)
    assert stale.status_code == 409


def test_latest_pointer_survives_project_move_and_returns_404_after_revision_change(tmp_path):
    project, output_id, edits, _source, _script, client = setup_render(tmp_path)
    with client:
        rendered = post(client, project.id, output_id)
        assert rendered.status_code == 200, rendered.text
    moved = tmp_path / "moved-project"
    shutil.move(project.project_path, moved)
    edits.outputs.projects.open(moved)
    with client:
        restored = client.get(f"/api/projects/{project.id}/voice-outputs/{output_id}/render")
        assert restored.status_code == 200, restored.text
        current = edits.scripts.get(project.id)
        edits.scripts.save(project.id, current.model_copy(update={"settings": ScriptSettings(note="new revision")}))
        assert client.get(f"/api/projects/{project.id}/voice-outputs/{output_id}/render").status_code == 404


def test_stale_expected_revisions_return_conflict(tmp_path):
    project, output_id, _edits, _source, _script, client = setup_render(tmp_path)
    with client:
        assert post(client, project.id, output_id, script_revision=1).status_code == 409
        assert post(client, project.id, output_id, edit_revision=1).status_code == 409
