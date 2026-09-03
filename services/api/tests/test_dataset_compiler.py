from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.project_dataset_compiler import (
    SEGMENT_MAX_SECONDS,
    SEGMENT_MIN_SECONDS,
    DatasetCompilationError,
    ProjectDatasetCompiler,
)
from app.domain.models import (
    MediaAssetCreate,
    ProjectCreate,
    SpeakerProfile,
    TrainingCatalog,
)


def word(text, start, end, **overrides):
    """A word as the recogniser actually emits it.

    `timingSource` is not decoration: W2 marks any word without processor
    provenance untrusted, so a fixture that omits it is testing a case the
    library refuses rather than the case the compiler is for.
    """
    return {
        "text": text,
        "start": start,
        "end": end,
        "timingTrusted": True,
        "timingSource": "faster-whisper-dtw",
        "confidence": 0.9,
        **overrides,
    }


def steady_words(count: int, seconds: float = 0.5, gap: float = 0.0, **overrides):
    """Evenly spaced words with no pause, so one run is one segment."""
    out = []
    at = 0.0
    for index in range(count):
        out.append(word(f"tu{index}", round(at, 3), round(at + seconds, 3), **overrides))
        at += seconds + gap
    return out


class Fixture:
    def __init__(self, tmp_path: Path):
        self.projects = FileProjectRepository(tmp_path / "registry")
        self.project = self.projects.create(ProjectCreate(name="Dataset"))
        self.library = FileMediaLibrary(self.projects)
        self.catalogs = FileTrainingCatalog(self.projects)
        self.speaker = SpeakerProfile(name="Nam Anh")
        self.catalogs.save(self.project.id, TrainingCatalog(speakers=[self.speaker]))
        self.compiler = ProjectDatasetCompiler(self.projects, self.library, self.catalogs)

    def add(self, asset_id: str, words=None, **overrides):
        root = Path(self.project.project_path)
        analysis = root / "assets" / "media" / asset_id / "analysis.wav"
        analysis.parent.mkdir(parents=True, exist_ok=True)
        analysis.write_bytes(b"RIFF....WAVE")
        supplied = words if words is not None else steady_words(16)
        payload = {
            "name": f"{asset_id}.wav",
            "source_extension": ".wav",
            "media_kind": "audio",
            "source_path": f"assets/media/{asset_id}/source.wav",
            "analysis_path": f"assets/media/{asset_id}/analysis.wav",
            "origin": "import",
            "text": "một hai ba bốn",
            "duration": round(max((w["end"] for w in supplied), default=8.0), 3),
            "training_selected": True,
            # What a finished STT pass declares. Left at the model default of
            # `unverified`, W2 treats the whole asset as a provenance failure and
            # trusts no word in it - which is a different test, below.
            "word_timing_quality": "source",
            "speaker_profile_ids": [self.speaker.id],
            "words": supplied,
            **overrides,
        }
        return self.library.create(self.project.id, MediaAssetCreate(**payload), asset_id)


def test_only_selected_footage_is_compiled(tmp_path):
    fixture = Fixture(tmp_path)
    fixture.add("asset-in")
    fixture.add("asset-out", training_selected=False)

    manifest = fixture.compiler.compile(fixture.project.id)

    assert manifest.source_asset_ids == ["asset-in"]
    assert {segment.asset_id for segment in manifest.segments} == {"asset-in"}


def test_every_segment_lands_inside_the_engines_duration_window(tmp_path):
    fixture = Fixture(tmp_path)
    fixture.add("asset-1", words=steady_words(40))

    manifest = fixture.compiler.compile(fixture.project.id)

    assert manifest.segments
    for segment in manifest.segments:
        assert SEGMENT_MIN_SECONDS <= segment.duration <= SEGMENT_MAX_SECONDS


def test_a_guided_take_becomes_one_segment_with_the_card_as_its_text(tmp_path):
    fixture = Fixture(tmp_path)
    fixture.add(
        "asset-card",
        capture_tier="guided",
        origin="record",
        duration=4.2,
        text="Tôi đã nhắc chuyện đó ba lần rồi.",
        words=[],
    )

    manifest = fixture.compiler.compile(fixture.project.id)

    assert len(manifest.segments) == 1
    segment = manifest.segments[0]
    assert segment.text == "Tôi đã nhắc chuyện đó ba lần rồi."
    assert segment.text_provenance == "script"
    assert segment.capture_tier == "guided"
    assert (segment.start, segment.end) == (0.0, 4.2)


def test_a_segment_never_crosses_a_speaker_change(tmp_path):
    fixture = Fixture(tmp_path)
    other = SpeakerProfile(name="Người thứ hai")
    fixture.catalogs.save(
        fixture.project.id, TrainingCatalog(speakers=[fixture.speaker, other])
    )
    words = steady_words(8, speakerId=fixture.speaker.id) + [
        word(f"kia{i}", round(4.0 + i * 0.5, 3), round(4.5 + i * 0.5, 3), speakerId=other.id)
        for i in range(8)
    ]
    fixture.add("asset-two", words=words, speaker_profile_ids=[fixture.speaker.id, other.id])

    manifest = fixture.compiler.compile(fixture.project.id)

    owners = {segment.speaker_profile_id for segment in manifest.segments}
    assert owners == {fixture.speaker.id, other.id}
    for segment in manifest.segments:
        assert segment.speaker_profile_id is not None


def test_mixed_speaker_footage_is_refused_while_any_word_is_unowned(tmp_path):
    fixture = Fixture(tmp_path)
    other = SpeakerProfile(name="Người thứ hai")
    fixture.catalogs.save(
        fixture.project.id, TrainingCatalog(speakers=[fixture.speaker, other])
    )
    words = steady_words(8, speakerId=fixture.speaker.id) + steady_words(4)
    fixture.add("asset-mixed", words=words, speaker_profile_ids=[fixture.speaker.id, other.id])

    with pytest.raises(DatasetCompilationError):
        fixture.compiler.compile(fixture.project.id)

    readiness = fixture.compiler.readiness(fixture.project.id)
    assert [rejection.reason for rejection in readiness.rejections] == ["mixed-speaker-unresolved"]


def test_untrusted_word_timing_never_becomes_a_cut_point(tmp_path):
    fixture = Fixture(tmp_path)
    words = steady_words(16)
    words[6]["end"] = words[6]["start"] - 0.1     # ends before it starts
    fixture.add("asset-untrusted", words=words)

    manifest = fixture.compiler.compile(fixture.project.id)

    for segment in manifest.segments:
        assert "tu6" not in segment.text


@pytest.mark.parametrize(
    "overrides, reason",
    [
        ({"status": "no-audio", "analysis_path": None}, "no-audio"),
        ({"text": "   "}, "empty-text"),
        ({"speaker_profile_ids": []}, "unassigned-speaker"),
        ({"speaker_profile_ids": ["speaker-ghost"]}, "unknown-speaker"),
        ({"words": []}, "no-word-timing"),
    ],
)
def test_each_unusable_asset_says_why_rather_than_vanishing(tmp_path, overrides, reason):
    fixture = Fixture(tmp_path)
    fixture.add("asset-bad", **overrides)

    readiness = fixture.compiler.readiness(fixture.project.id)

    assert [rejection.reason for rejection in readiness.rejections] == [reason]
    assert readiness.rejections[0].detail


def test_footage_whose_timing_was_never_verified_cannot_become_training_data(tmp_path):
    """W2's guarantee has to survive into the dataset, not stop at the Script.

    An asset still marked `unverified` has word intervals nobody measured. Those
    intervals would become cut points, so the compiler must inherit the refusal
    rather than re-derive plausibility of its own.
    """
    fixture = Fixture(tmp_path)
    fixture.add("asset-unverified", word_timing_quality="unverified")

    readiness = fixture.compiler.readiness(fixture.project.id)

    assert [rejection.reason for rejection in readiness.rejections] == ["no-usable-segment"]


def test_compiling_nothing_usable_is_an_error_not_an_empty_manifest(tmp_path):
    fixture = Fixture(tmp_path)
    fixture.add("asset-bad", speaker_profile_ids=[])

    with pytest.raises(DatasetCompilationError):
        fixture.compiler.compile(fixture.project.id)


def test_the_dev_split_is_deterministic_and_never_empty(tmp_path):
    fixture = Fixture(tmp_path)
    fixture.add("asset-1", words=steady_words(60, gap=0.4))

    first = fixture.compiler.compile(fixture.project.id)
    second = fixture.compiler.compile(fixture.project.id)

    assert [(s.id, s.split) for s in first.segments] == [(s.id, s.split) for s in second.segments]
    assert first.stats.dev_segments >= 1
    assert first.stats.train_segments + first.stats.dev_segments == first.stats.segments


def test_a_tiny_project_still_gets_a_dev_segment(tmp_path):
    """OmniVoice's data config needs a dev list; an all-train split fails at launch."""
    fixture = Fixture(tmp_path)
    fixture.add("asset-a", capture_tier="guided", duration=3.0, words=[])
    fixture.add("asset-b", capture_tier="guided", duration=3.5, words=[])

    manifest = fixture.compiler.compile(fixture.project.id)

    assert manifest.stats.segments == 2
    assert manifest.stats.dev_segments == 1


def test_emotion_becomes_an_instruct_string_except_when_it_is_neutral(tmp_path):
    fixture = Fixture(tmp_path)
    fixture.add("asset-angry", capture_tier="guided", duration=3.0, words=[], emotion="angry")
    fixture.add("asset-plain", capture_tier="guided", duration=3.0, words=[], emotion="normal")

    manifest = fixture.compiler.compile(fixture.project.id)
    instructs = {segment.asset_id: segment.instruct for segment in manifest.segments}

    assert instructs["asset-angry"] == "angry"
    assert instructs["asset-plain"] == ""


def test_a_mix_asset_does_not_label_its_segments_with_a_non_delivery(tmp_path):
    fixture = Fixture(tmp_path)
    fixture.add("asset-mix", emotion="mix", words=steady_words(16))

    manifest = fixture.compiler.compile(fixture.project.id)

    assert {segment.emotion for segment in manifest.segments} == {"normal"}


def test_the_manifest_survives_moving_the_whole_project(tmp_path):
    fixture = Fixture(tmp_path)
    fixture.add("asset-1")
    manifest = fixture.compiler.compile(fixture.project.id)
    stored = Path(fixture.project.project_path) / "assets" / "training" / "datasets"

    assert str(tmp_path) not in (stored / f"{manifest.id}.json").read_text(encoding="utf-8")
    for segment in manifest.segments:
        assert not Path(segment.audio_path).is_absolute()

    original = Path(fixture.project.project_path)
    moved = tmp_path / "after" / original.name
    moved.parent.mkdir(parents=True)
    shutil.move(str(original), str(moved))
    fixture.projects.open(moved)

    for segment in fixture.compiler.compile(fixture.project.id).segments:
        assert (moved / segment.audio_path).is_file()


def test_readiness_reports_coverage_without_compiling_anything(tmp_path):
    fixture = Fixture(tmp_path)
    fixture.add("asset-1", words=steady_words(20))
    fixture.add("asset-2", capture_tier="guided", duration=4.0, words=[], emotion="sad")

    readiness = fixture.compiler.readiness(fixture.project.id)

    assert readiness.selected_assets == 2
    assert readiness.ready_assets == 2
    assert readiness.segments > 0
    assert readiness.speaker_profile_ids == [fixture.speaker.id]
    assert set(readiness.segments_by_tier) == {"import", "guided"}
    assert "sad" in readiness.seconds_by_emotion
    assert not list((Path(fixture.project.project_path) / "assets" / "training").glob("datasets/*"))
