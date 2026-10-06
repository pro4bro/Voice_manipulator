from app.domain.models import MediaTimelineEditsUpdate
from app.domain.timeline_intervals import excluded_intervals, included_intervals, restore_span
from types import SimpleNamespace
import hashlib
import struct
import wave
import pytest
from app.adapters.timeline_audio import prepare_diarization_audio
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.media_import_processor import MediaImportProcessor
from app.domain.models import ProjectCreate, MediaAssetCreate, TimelineEditRange


def asset(**updates):
    payload = MediaTimelineEditsUpdate.model_validate(updates)
    return SimpleNamespace(duration=10, removed_ranges=payload.removed_ranges, working_range=payload.working_range)


def test_working_region_intersects_cuts_and_restores_without_touching_source():
    a = asset(workingRange={"id": "w", "start": 2, "end": 8}, removedRanges=[{"id": "c", "start": 4, "end": 6}])
    assert included_intervals(a) == [(2, 4), (6, 8)]
    assert [(r.start, r.end) for r in excluded_intervals(a)] == [(0, 2), (4, 6), (8, 10)]
    assert included_intervals(asset()) == [(0, 10)]


def test_diarization_span_never_crosses_removed_audio_on_restore():
    assert restore_span(1, 3, [(2, 4), (6, 8)]) == [(3, 4), (6, 7)]


def test_stt_word_start_and_end_use_opposite_sides_of_an_exact_cut_seam():
    item = {"words": [{"text": "before", "start": .8, "end": 1}, {"text": "after", "start": 1, "end": 1.2}]}
    restored = MediaImportProcessor._restore_original_timeline(item, [(0, 1), (2, 3)], 3)
    assert restored["words"][0]["end"] == 1
    assert restored["words"][1]["start"] == 2
    assert restored["words"][1]["end"] == pytest.approx(2.2)


def test_fully_removed_footage_has_no_processing_interval():
    assert included_intervals(asset(removedRanges=[{"id": "all", "start": 0, "end": 10}])) == []


def test_diarization_receives_only_kept_pcm_and_source_hash_is_unchanged(tmp_path):
    source = tmp_path / "analysis.wav"
    with wave.open(str(source), "wb") as stream:
        stream.setnchannels(1); stream.setsampwidth(2); stream.setframerate(1000)
        stream.writeframes(b"".join(struct.pack("<h", second) * 1000 for second in range(10)))
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    path, kept = prepare_diarization_audio(source, asset(workingRange={"start": 2, "end": 8}, removedRanges=[{"start": 4, "end": 6}]))
    assert kept == [(2, 4), (6, 8)]
    with wave.open(str(path), "rb") as stream:
        samples = struct.unpack("<4000h", stream.readframes(4000))
    assert samples == tuple(value for second in [2, 3, 6, 7] for value in [second] * 1000)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash


def test_marks_and_cut_points_persist_and_invalid_marks_do_not_overwrite(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Range persistence"))
    library = FileMediaLibrary(projects)
    a = library.create(project.id, MediaAssetCreate(name="test.wav", source_extension=".wav", media_kind="audio", source_path="assets/media/test.wav", duration=10, origin="import"))
    library.update_timeline_edits(project.id, a.id, [], [], TimelineEditRange(start=2, end=8), [3, 7])
    restored = FileMediaLibrary(projects).get(project.id, a.id)
    assert restored.working_range.start == 2
    assert restored.cut_points == [3, 7]
    with pytest.raises(ValueError):
        library.update_timeline_edits(project.id, a.id, [], [], TimelineEditRange(start=8, end=2), [])
    assert library.get(project.id, a.id).working_range.start == 2
