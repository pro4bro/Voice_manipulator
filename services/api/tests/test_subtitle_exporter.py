from __future__ import annotations

from pathlib import Path

from app.adapters.subtitle_exporter import SubtitleExporter
from app.domain.models import MediaAssetCreate, ProjectCreate, ProjectMediaAsset, ProjectRecord, SpeakerProfile


def make_project(tmp_path: Path) -> ProjectRecord:
    project_path = tmp_path / "subtitle-project"
    project_path.mkdir()
    return ProjectRecord.create("project-subtitle", ProjectCreate(name="Subtitle Export"), project_path)


def make_asset() -> ProjectMediaAsset:
    return ProjectMediaAsset.create(
        "asset-subtitle",
        MediaAssetCreate(
            name="Lời thoại bản thử.wav",
            source_extension=".wav",
            media_kind="audio",
            source_path="assets/media/asset-subtitle/source.wav",
            duration=3,
            text="Xin chào bạn, đây là đoạn cần bỏ qua.",
            words=[
                {"text": "Xin", "start": 0, "end": 0.2},
                {"text": "chào", "start": 0.2, "end": 0.45},
                {"text": "bạn,", "start": 0.45, "end": 0.7},
                {"text": "đây", "start": 0.7, "end": 0.9},
                {"text": "là", "start": 0.9, "end": 1.05},
                {"text": "đoạn", "start": 1.05, "end": 1.25},
                {"text": "bỏ", "start": 1.25, "end": 1.4},
                {"text": "qua.", "start": 1.4, "end": 1.75},
            ],
            removed_ranges=[{"start": 1.0, "end": 1.45}],
            origin="import",
        ),
    )


def test_sentence_srt_is_project_owned_and_respects_timeline_cuts(tmp_path: Path):
    project = make_project(tmp_path)
    output = SubtitleExporter().export(project, make_asset(), "sentence")

    assert output.parent == Path(project.project_path) / "exports" / "subtitles"
    rendered = output.read_text(encoding="utf-8")
    assert "00:00:00,000 -->" in rendered
    assert "bỏ" not in rendered
    assert "Xin chào bạn" in rendered
    assert "SUBTITLE_EXPORTED" in (Path(project.project_path) / "activity" / "events.jsonl").read_text(encoding="utf-8")


def test_word_srt_keeps_one_cue_per_non_removed_word(tmp_path: Path):
    output = SubtitleExporter().export(make_project(tmp_path), make_asset(), "word")
    rendered = output.read_text(encoding="utf-8")

    assert output.name.endswith("--word.srt")
    assert rendered.count("-->") == 6
    assert "1\n00:00:00,000 --> 00:00:00,200\nXin" in rendered


def test_partial_sentence_srt_skips_only_cues_with_untrusted_words_and_reports_count(tmp_path: Path):
    asset = make_asset().model_copy(update={
        "duration": 5,
        "removed_ranges": [],
        "word_timing_quality": "partial",
        "words": [
            {"text": "Xin", "start": 0.0, "end": 0.4, "timingTrusted": True},
            {"text": "chào", "start": 0.4, "end": 0.8, "timingTrusted": True},
            {"text": "mọi", "start": 0.8, "end": 1.1, "timingTrusted": True},
            {"text": "người.", "start": 1.1, "end": 1.4, "timingTrusted": True},
            {"text": "lỗi.", "start": 2.2, "end": 2.5, "timingTrusted": False},
            {"text": "Tạm", "start": 3.5, "end": 3.9, "timingTrusted": True},
            {"text": "biệt", "start": 3.9, "end": 4.3, "timingTrusted": True},
            {"text": "nhé.", "start": 4.3, "end": 4.8, "timingTrusted": True},
        ],
    })

    output = SubtitleExporter().export(make_project(tmp_path), asset, "sentence")
    rendered = output.read_text(encoding="utf-8")

    assert rendered.startswith("# Pro4Bro: đã bỏ 1 dòng subtitle")
    assert "Xin chào mọi người." in rendered
    assert "lỗi." not in rendered
    assert "Tạm biệt nhé." in rendered
    assert rendered.count("-->") == 2

def test_speaker_srt_preserves_each_word_boundary_and_uses_profile_color(tmp_path: Path):
    asset = make_asset().model_copy(update={
        "removed_ranges": [],
        "words": [
            {"text": "Chào", "start": 0.125, "end": 0.205, "diarizationSpeakerId": "speaker-1", "speakerId": "speaker-a"},
            {"text": "bạn", "start": 0.205, "end": 0.330, "diarizationSpeakerId": "speaker-1", "speakerId": "speaker-a"},
            {"text": "nhé", "start": 0.500, "end": 0.940, "diarizationSpeakerId": "speaker-2"},
        ],
    })
    profile = SpeakerProfile(id="speaker-a", name="Anh Vũ", color="#18d9ff")

    output = SubtitleExporter().export(make_project(tmp_path), asset, "word", [profile])
    rendered = output.read_text(encoding="utf-8")

    assert "00:00:00,125 --> 00:00:00,205" in rendered
    assert '<font color="#18d9ff">Anh Vũ</font>: Chào' in rendered
    assert '<font color="#F3F0E7">Speaker 2</font>: nhé' in rendered


def test_script_table_export_groups_contiguous_speaker_rows(tmp_path: Path):
    asset = make_asset().model_copy(update={
        "removed_ranges": [],
        "words": [
            {"text": "Một", "start": 0, "end": 0.2, "diarizationSpeakerId": "speaker-1"},
            {"text": "hai", "start": 0.2, "end": 0.4, "diarizationSpeakerId": "speaker-1"},
            {"text": "ba", "start": 0.4, "end": 0.7, "diarizationSpeakerId": "speaker-2"},
        ],
    })

    output = SubtitleExporter().export(make_project(tmp_path), asset, "table")
    rendered = output.read_text(encoding="utf-8-sig")

    assert output.name.endswith("--table.csv")
    assert "Speaker,Content,Start,End" in rendered
    assert "Speaker 1,Một hai,0.000,0.400" in rendered
    assert "Speaker 2,ba,0.400,0.700" in rendered
