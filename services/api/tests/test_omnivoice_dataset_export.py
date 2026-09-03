from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.adapters.omnivoice_dataset_export import (
    DatasetExportError,
    OmniVoiceDatasetExporter,
)
from app.domain.models import DatasetManifest, DatasetSegment, SpeakerProfile

SPEAKER = SpeakerProfile(name="Nam Anh", language="vi", language_id="vi")


def segment(segment_id, **overrides):
    base = {
        "id": segment_id,
        "asset_id": "asset-1",
        "audio_path": "assets/media/asset-1/analysis.wav",
        "start": 1.0,
        "end": 5.0,
        "text": "Tôi đã nhắc chuyện đó ba lần rồi.",
        "speaker_profile_id": SPEAKER.id,
        "emotion": "angry",
        "instruct": "angry",
        "capture_tier": "import",
        "text_provenance": "stt",
        "split": "train",
    }
    return DatasetSegment(**{**base, **overrides})


def manifest_of(*segments):
    return DatasetManifest(id="dataset-1", segments=list(segments))


class FakeExporter(OmniVoiceDatasetExporter):
    """Records the cuts instead of shelling out to FFmpeg."""

    def __init__(self):
        super().__init__(ffmpeg_path="ffmpeg")
        self.cuts: list[tuple[str, float, float]] = []

    def _slice(self, source: Path, destination: Path, start: float, end: float) -> None:
        self.cuts.append((destination.name, start, end))
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"RIFF....WAVE")


@pytest.fixture
def project(tmp_path):
    audio = tmp_path / "project" / "assets" / "media" / "asset-1" / "analysis.wav"
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"RIFF....WAVE")
    return tmp_path / "project"


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line]


def test_each_line_is_one_sample_with_an_absolute_audio_path(project, tmp_path):
    exporter = FakeExporter()

    report = exporter.export(
        manifest_of(segment("seg-1"), segment("seg-2", split="dev")),
        project,
        tmp_path / "run",
        [SPEAKER],
    )
    train = read_jsonl(report.train_jsonl)

    assert len(train) == 1
    assert Path(train[0]["audio_path"]).is_absolute()
    assert train[0]["id"] == "seg-1"
    assert train[0]["text"].startswith("Tôi đã")


def test_the_manifest_stays_relative_while_the_export_goes_absolute(project, tmp_path):
    """Portable record, machine-local scratch. Both are correct at once."""
    exporter = FakeExporter()
    source = manifest_of(segment("seg-1"), segment("seg-2", split="dev"))

    exporter.export(source, project, tmp_path / "run", [SPEAKER])

    assert all(not Path(item.audio_path).is_absolute() for item in source.segments)


def test_a_span_inside_longer_footage_becomes_a_real_file(project, tmp_path):
    exporter = FakeExporter()

    report = exporter.export(
        manifest_of(segment("seg-1", start=2.5, end=9.25), segment("seg-2", split="dev")),
        project,
        tmp_path / "run",
        [SPEAKER],
    )

    assert ("seg-1.wav", 2.5, 9.25) in exporter.cuts
    assert report.sliced_segments == 2


def test_a_guided_take_is_referenced_rather_than_re_encoded(project, tmp_path):
    exporter = FakeExporter()

    report = exporter.export(
        manifest_of(
            segment("seg-1", capture_tier="guided", start=0.0, end=4.2),
            segment("seg-2", capture_tier="guided", start=0.0, end=3.1, split="dev"),
        ),
        project,
        tmp_path / "run",
        [SPEAKER],
    )

    assert exporter.cuts == []
    assert report.reused_segments == 2
    assert report.sliced_segments == 0


def test_the_split_decides_which_file_a_sample_lands_in(project, tmp_path):
    exporter = FakeExporter()

    report = exporter.export(
        manifest_of(
            segment("seg-1"),
            segment("seg-2"),
            segment("seg-3", split="dev"),
        ),
        project,
        tmp_path / "run",
        [SPEAKER],
    )

    assert (report.train_samples, report.dev_samples) == (2, 1)
    assert [item["id"] for item in read_jsonl(report.dev_jsonl)] == ["seg-3"]


def test_the_instruct_string_reaches_the_sample_that_carries_it(project, tmp_path):
    exporter = FakeExporter()

    report = exporter.export(
        manifest_of(
            segment("seg-1", emotion="angry", instruct="angry"),
            segment("seg-2", emotion="normal", instruct="", split="dev"),
        ),
        project,
        tmp_path / "run",
        [SPEAKER],
    )

    assert read_jsonl(report.train_jsonl)[0]["instruct"] == "angry"
    # Neutral carries no instruction, and an absent key is not an empty one.
    assert "instruct" not in read_jsonl(report.dev_jsonl)[0]


def test_language_comes_from_the_speaker_and_falls_back_to_the_project(project, tmp_path):
    exporter = FakeExporter()
    unknown = segment("seg-2", speaker_profile_id="speaker-other", split="dev")

    report = exporter.export(
        manifest_of(segment("seg-1"), unknown), project, tmp_path / "run", [SPEAKER], "en"
    )

    assert read_jsonl(report.train_jsonl)[0]["language_id"] == "vi"
    assert read_jsonl(report.dev_jsonl)[0]["language_id"] == "en"


def test_missing_audio_stops_the_export_instead_of_writing_a_dead_path(project, tmp_path):
    exporter = FakeExporter()

    with pytest.raises(DatasetExportError, match="Thiếu audio"):
        exporter.export(
            manifest_of(segment("seg-1", audio_path="assets/media/gone/analysis.wav")),
            project,
            tmp_path / "run",
            [SPEAKER],
        )


def test_an_export_with_no_dev_sample_fails_here_not_after_tokenizing(project, tmp_path):
    exporter = FakeExporter()

    with pytest.raises(DatasetExportError, match="dev"):
        exporter.export(manifest_of(segment("seg-1")), project, tmp_path / "run", [SPEAKER])


def test_the_data_config_is_written_only_once_shards_exist(project, tmp_path):
    exporter = FakeExporter()
    run = tmp_path / "run"
    (run / "data").mkdir(parents=True)

    path = exporter.write_data_config(run, run / "tokens/train/data.lst", run / "tokens/dev/data.lst")
    config = json.loads(path.read_text(encoding="utf-8"))

    assert Path(config["train"][0]["manifest_path"][0]).is_absolute()
    assert config["dev"][0]["repeat"] == 1
