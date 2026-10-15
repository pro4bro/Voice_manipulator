import json
import wave

import pytest
from test_reference_bindings import fixture
from app.adapters.reference_resolver import ReferenceResolver
from app.adapters.file_voice_script import ScriptRevisionConflict
from app.domain.reference_bindings import ReferenceAssignment


def assigned(tmp_path):
    items = fixture(tmp_path)
    _, project, _, _, scripts, script, store, payload = items
    payload.update(scope={"kind": "script", "id": project.id, "revision": str(script.revision)}, targets=[{"id": "row", "rowIds": ["r1"], "text": script.rows[0].text}])
    document = store.assign(project.id, ReferenceAssignment.model_validate(payload))
    return items, document, ReferenceResolver(store)


def test_properties_keep_identity_and_report_measurements_without_conditioning(tmp_path):
    items, document, resolver = assigned(tmp_path)
    _, project, _, _, _, _, store, _ = items
    result = resolver.resolve(project.id, document.bindings[0].id, document.revision)
    props = result["units"][0]["properties"]
    assert props["timing"]["state"] == "measured"
    assert props["volume"]["source"]["features"]["duration"] == 1.5
    assert props["emotion"]["state"] == "unsupported" and props["whisper"]["state"] == "unsupported"
    assert result["identity"] == [{"rowId": "r1", "voiceId": None, "speakerProfileId": None}]
    assert result["applied"] is False
    second = resolver.resolve(project.id, document.bindings[0].id, document.revision)
    assert second["key"] == result["key"]
    assert len(list((store._path(project.id).parent.parent / "cache/reference-features").glob("*.json"))) == 2


def test_tied_sources_conflict_instead_of_first_file_wins_and_locks_win(tmp_path):
    items, document, resolver = assigned(tmp_path)
    _, project, _, _, scripts, script, store, payload = items
    payload["expectedRevision"] = 1
    payload["sources"][1].update(properties=["timing", "shout", "whisper"], priority=2)
    document = store.assign(project.id, ReferenceAssignment.model_validate(payload))
    result = resolver.resolve(project.id, document.bindings[0].id, 2)
    props = result["units"][0]["properties"]
    assert props["timing"]["state"] == "conflict"
    assert props["shout"]["state"] == props["whisper"]["state"] == "conflict"
    script.settings.duration = 3
    script.settings.locked = ["duration", "delivery"]
    scripts.save(project.id, script)
    result = resolver.resolve(project.id, document.bindings[0].id, 2)
    assert result["units"][0]["properties"]["timing"]["state"] == "locked"
    assert result["units"][0]["properties"]["timing"]["value"] == 3
    assert result["units"][0]["properties"]["shout"]["state"] == "locked"
    with pytest.raises(ScriptRevisionConflict): resolver.resolve(project.id, document.bindings[0].id, 1)


def test_changed_source_invalidates_only_affected_binding_and_ignores_global_revision(tmp_path):
    items, document, resolver = assigned(tmp_path)
    _, project, media, refs, _, _, store, payload = items
    first = resolver.resolve(project.id, document.bindings[0].id, 1)
    payload["expectedRevision"] = 1
    store.assign(project.id, ReferenceAssignment.model_validate(payload))
    same = resolver.resolve(project.id, document.bindings[0].id, 2)
    assert same["key"] == first["key"]
    with wave.open(str(media.resolve_audio_path(project.id, refs[0].id)), "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed")); audio.writeframes(b"\x20\x00" * 120000)
    changed = resolver.resolve(project.id, document.bindings[0].id, 2)
    assert changed["key"] != first["key"]
    assert changed["units"][0]["properties"]["timing"]["state"] == "stale"
    assert json.loads((store._path(project.id).parent / "reference-resolutions" / f"{document.bindings[0].id}.json").read_text())["key"] == changed["key"]
