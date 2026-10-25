import shutil
import pytest
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_voice_script import FileVoiceScript, ScriptRevisionConflict
from app.domain.models import ProjectCreate
from app.domain.voice_script_document import VoiceScriptDocument, group_legacy_script_rows, legacy_row_groups


def test_script_intent_survives_reopen_move_and_rejects_stale_save(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Script", location=str(tmp_path / "projects")))
    store = FileVoiceScript(projects)
    document = VoiceScriptDocument.model_validate({"segments": [{"id": "seg-1", "settings": {"emotion": "happy"}}],
        "rows": [{"id": "sentence-1", "segmentId": "seg-1", "text": "你好。", "originIds": ["old"], "tags": ["review"], "settings": {"duration": 2}}]})
    saved = store.save(project.id, document)
    assert saved.revision == 1
    with pytest.raises(ScriptRevisionConflict):
        store.save(project.id, document)
    moved = tmp_path / "moved"
    shutil.move(project.project_path, moved)
    projects.open(moved)
    assert FileVoiceScript(projects).get(project.id) == saved


def test_script_rejects_dangling_or_duplicate_sentence_identity():
    with pytest.raises(ValueError):
        VoiceScriptDocument.model_validate({"rows": [{"id": "r", "segmentId": "missing"}]})


def test_legacy_script_groups_only_consecutive_compatible_explicit_turns():
    document = VoiceScriptDocument.model_validate({
        "segments": [{"id": "a"}, {"id": "b"}, {"id": "c"}],
        "rows": [
            {"id": "a1", "segmentId": "a", "text": "A line", "voiceId": "voice-a", "speakerProfileId": "speaker-a", "originIds": ["o1"], "tags": ["x"]},
            {"id": "a2", "segmentId": "b", "text": "next", "voiceId": "voice-a", "speakerProfileId": "speaker-a", "originIds": ["o2"], "tags": ["y"]},
            {"id": "b1", "segmentId": "b", "text": "other", "voiceId": "voice-b", "speakerProfileId": "speaker-b"},
            {"id": "a3", "segmentId": "c", "text": "again", "voiceId": "voice-a", "speakerProfileId": "speaker-a"},
        ],
    })

    grouped = group_legacy_script_rows(document)

    assert [(row.id, row.text) for row in grouped.rows] == [
        ("a1", "A line\nnext"), ("b1", "other"), ("a3", "again")]
    assert grouped.rows[0].legacy_row_ids == ["a1", "a2"]
    assert grouped.rows[0].origin_ids == ["o1", "o2"]
    assert grouped.rows[0].tags == ["x", "y"]
    assert grouped.rows[0].segment_id == "a"
    assert grouped.turn_grouping_version == 1


def test_legacy_grouping_rebuilds_each_group_from_its_own_members():
    rows = []
    segments = []
    for row_id, voice, text in [
        ("a1", "a", "A first"), ("a2", "a", "A second"),
        ("b1", "b", "B first"), ("b2", "b", "B second"),
        ("a3", "a", "A third"), ("a4", "a", "A fourth"),
    ]:
        segments.append({"id": f"segment-{row_id}"})
        rows.append({"id": row_id, "segmentId": f"segment-{row_id}", "text": text,
            "voiceId": voice, "speakerProfileId": f"speaker-{voice}"})

    grouped = group_legacy_script_rows(VoiceScriptDocument.model_validate({"segments": segments, "rows": rows}))

    assert [(row.id, row.text, row.legacy_row_ids) for row in grouped.rows] == [
        ("a1", "A first\nA second", ["a1", "a2"]),
        ("b1", "B first\nB second", ["b1", "b2"]),
        ("a3", "A third\nA fourth", ["a3", "a4"]),
    ]


def test_legacy_grouping_leaves_ambiguous_duration_settings_and_long_rows_separate():
    doc = VoiceScriptDocument.model_validate({
        "segments": [{"id": str(i)} for i in range(8)],
        "rows": [
            {"id": "p1", "segmentId": "0", "text": "one", "voiceId": "v", "speakerProfileId": "p"},
            {"id": "p2", "segmentId": "1", "text": "two", "voiceId": "v", "speakerProfileId": "p", "settings": {"duration": 3}},
            {"id": "p3", "segmentId": "2", "text": "three", "voiceId": "v", "speakerProfileId": "p", "settings": {"duration": 3}},
            {"id": "p4", "segmentId": "3", "text": "four", "voiceId": "v", "speakerProfileId": "p", "settings": {"emotion": "happy"}},
            {"id": "p5", "segmentId": "4", "text": "five", "voiceId": "v", "speakerProfileId": "p", "settings": {"emotion": "sad"}},
            {"id": "u1", "segmentId": "5", "text": "unknown"},
            {"id": "u2", "segmentId": "6", "text": "still unknown"},
            {"id": "long", "segmentId": "7", "text": "x" * 4998, "voiceId": "v", "speakerProfileId": "p"},
        ],
    })
    # Use a second compatible row after the long one to prove aggregate length is bounded.
    doc = doc.model_copy(update={"rows": [*doc.rows, doc.rows[-1].model_copy(update={"id": "long2", "segment_id": "7", "text": "xxx"})]})
    grouped = group_legacy_script_rows(doc)
    assert [row.id for row in grouped.rows] == [row.id for row in doc.rows]


def test_voice_id_turns_group_only_when_profile_absent_and_settings_match():
    doc = VoiceScriptDocument.model_validate({"segments": [{"id": "s1"}, {"id": "s2"}], "rows": [
        {"id": "r1", "segmentId": "s1", "text": "first", "voiceId": "v"},
        {"id": "r2", "segmentId": "s2", "text": "second", "voiceId": "v"},
    ]})
    grouped = group_legacy_script_rows(doc)
    assert len(grouped.rows) == 1
    assert grouped.rows[0].text == "first\nsecond"


def test_legacy_grouping_uses_compatible_boundaries_across_version_snapshots():
    current = VoiceScriptDocument.model_validate({"segments": [{"id": "s1"}, {"id": "s2"}], "rows": [
        {"id": "r1", "segmentId": "s1", "text": "one", "voiceId": "v", "speakerProfileId": "p"},
        {"id": "r2", "segmentId": "s2", "text": "two", "voiceId": "v", "speakerProfileId": "p"},
    ]})
    generated = VoiceScriptDocument.model_validate({**current.model_dump(by_alias=True), "rows": [
        current.rows[0].model_dump(by_alias=True),
        {**current.rows[1].model_dump(by_alias=True), "settings": {"emotion": "sad"}}]})
    assert legacy_row_groups(current, [generated]) == [["r1"], ["r2"]]


def test_legacy_script_file_migrates_once_backs_up_and_keeps_future_rows_separate(tmp_path):
    import json
    from app.adapters.file_project_repository import FileProjectRepository
    from app.adapters.file_voice_script import FileVoiceScript
    from app.domain.models import ProjectCreate
    from app.domain.voice_script_document import ScriptSentence

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Legacy turns", location=str(tmp_path / "projects")))
    store = FileVoiceScript(projects)
    path = store._path(project.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    legacy = {"version": 1, "revision": 8, "settings": {}, "segments": [{"id": "s1"}, {"id": "s2"}],
        "rows": [
            {"id": "r1", "text": "one", "voiceId": "v", "speakerProfileId": "p", "segmentId": "s1"},
            {"id": "r2", "text": "two", "voiceId": "v", "speakerProfileId": "p", "segmentId": "s2"},
        ]}
    path.write_text(json.dumps(legacy), encoding="utf-8")

    migrated = store.get(project.id)
    backup = path.with_name(path.name + ".pre-turn-grouping")
    assert migrated.revision == 9 and migrated.turn_grouping_version == 1
    assert len(migrated.rows) == 1 and migrated.rows[0].id == "r1"
    assert migrated.rows[0].text == "one\ntwo" and migrated.rows[0].legacy_row_ids == ["r1", "r2"]
    assert json.loads(backup.read_text(encoding="utf-8")) == legacy

    later = migrated.model_copy(update={"rows": [*migrated.rows,
        ScriptSentence(id="r3", text="intentionally separate", voice_id="v", speaker_profile_id="p", segment_id="s2")]})
    saved = store.save(project.id, later)
    reopened = FileVoiceScript(projects).get(project.id)
    assert len(reopened.rows) == 2 and reopened.rows[1].id == "r3"
    assert reopened == saved


def test_sidecar_row_reference_keeps_legacy_row_addressable(tmp_path):
    import json
    from pathlib import Path
    from app.adapters.file_project_repository import FileProjectRepository
    from app.adapters.file_voice_script import FileVoiceScript
    from app.domain.models import ProjectCreate

    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Protected row", location=str(tmp_path / "projects")))
    store = FileVoiceScript(projects)
    scripts = Path(project.project_path) / "scripts"
    scripts.mkdir(parents=True, exist_ok=True)
    (scripts / "voice-over.json").write_text(json.dumps({"revision": 3, "segments": [{"id": "s1"}, {"id": "s2"}],
        "rows": [
            {"id": "r1", "segmentId": "s1", "text": "one", "voiceId": "v", "speakerProfileId": "p"},
            {"id": "r2", "segmentId": "s2", "text": "two", "voiceId": "v", "speakerProfileId": "p"},
        ]}), encoding="utf-8")
    (scripts / "timing-plans.json").write_text(json.dumps({"plans": [{"rowId": "r2"}]}), encoding="utf-8")
    migrated = store.get(project.id)
    assert [row.id for row in migrated.rows] == ["r1", "r2"]
