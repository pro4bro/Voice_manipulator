import asyncio
import hashlib
import json
import shutil
import subprocess
import wave
from io import BytesIO
from pathlib import Path

from fastapi import UploadFile
import pytest

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.local_media_source_registry import LocalMediaSourceRegistry
from app.adapters.media_import_processor import MediaImportProcessor, STT_CHUNK_SECONDS, TranscriptionChunk
from app.domain.models import ProjectCreate


def test_media_kind_uses_real_streams_before_container_extension():
    audio = {"codec_type": "audio", "codec_name": "opus"}
    video = {"codec_type": "video", "codec_name": "vp9"}

    assert MediaImportProcessor._media_kind(".webm", audio, None) == "audio"
    assert MediaImportProcessor._media_kind(".webm", audio, video) == "video"
    assert MediaImportProcessor._media_kind(".h265", None, None) == "video"


def test_import_can_extract_audio_without_running_transcription(tmp_path, monkeypatch):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Known Script"))
    processor = MediaImportProcessor("http://studio", FileMediaLibrary(projects), "ffmpeg")
    processor.ffprobe_path = "ffprobe"
    monkeypatch.setattr(
        processor,
        "_probe",
        lambda _path: {
            "streams": [{"codec_type": "audio", "codec_name": "pcm_s16le", "sample_rate": "48000"}],
            "format": {"duration": "3.5"},
        },
    )
    monkeypatch.setattr(processor, "_extract_audio", lambda _source, destination: destination.write_bytes(b"wav"))

    async def fail_if_transcribed(*_args):
        raise AssertionError("Studio transcription must be skipped")

    monkeypatch.setattr(processor, "_run_studio_import", fail_if_transcribed)
    upload = UploadFile(filename="known-script.wav", file=BytesIO(b"audio"))

    result = asyncio.run(processor.process(project, upload, "import", transcribe=False))

    assert result.item is None
    assert result.asset.transcription_status == "skipped"
    assert result.asset.sample_rate == 48000
    assert result.asset.analysis_path.endswith("analysis.wav")


@pytest.mark.parametrize("extension", ["mkv", "mov", "mp4"])
def test_import_preserves_each_audio_track_under_one_footage(tmp_path, extension):
    repo_root = Path(__file__).resolve().parents[3]
    bundled = repo_root / ".tools" / "ffmpeg" / "ffmpeg.exe"
    ffmpeg = str(bundled) if bundled.is_file() else shutil.which("ffmpeg")
    if not ffmpeg:
        pytest.skip("FFmpeg is not installed")
    source = tmp_path / f"two-tracks.{extension}"
    subprocess.run([
        ffmpeg, "-y", "-v", "error",
        "-f", "lavfi", "-i", "color=size=16x16:rate=10:duration=1",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
        "-f", "lavfi", "-i", "sine=frequency=880:duration=1",
        "-map", "0:v:0", "-map", "1:a:0", "-map", "2:a:0",
        "-c:v", "mpeg4", "-c:a", "aac", "-metadata:s:a:0", "title=Voice",
        "-metadata:s:a:1", "title=Desktop", str(source),
    ], check=True, capture_output=True)
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Multi-track"))
    library = FileMediaLibrary(projects)
    local = LocalMediaSourceRegistry(tmp_path / "machine")
    processor = MediaImportProcessor("http://studio", library, ffmpeg, local)

    result = asyncio.run(processor.process_local_path(project, str(source), cache_local=False))
    root = Path(project.project_path)
    children = [library.get(project.id, child_id) for child_id in result.track_asset_ids]
    assert len(children) == 2
    assert [child.source_archive_stream_index for child in children] == [1, 2]
    assert all(child.source_archive_asset_id == result.asset.id for child in children)
    assert result.asset.has_external_source and not result.asset.local_cache_enabled
    assert local.get(project.id, result.asset.id) == str(source)
    sounds = [(root / child.analysis_path).read_bytes() for child in children]
    assert all(sound.startswith(b"RIFF") for sound in sounds)
    assert hashlib.sha256(sounds[0]).digest() != hashlib.sha256(sounds[1]).digest()
    manifest = json.loads((root / result.asset.source_path).parent.joinpath("audio-tracks.json").read_text())
    assert [track["streamIndex"] for track in manifest["tracks"]] == [1, 2]

    cached = asyncio.run(processor.set_local_file_cache(project, result.asset, True))
    assert cached.local_cache_enabled
    assert (root / result.asset.source_path).is_file()
    library.send_to_recycle_bin(project.id, result.asset.id)
    assert all(library.get(project.id, child.id).deleted_at for child in children)
    library.remove(project.id, result.asset.id)
    assert not any(asset.id in {result.asset.id, *(child.id for child in children)}
                   for asset in library.list(project.id))

    upload = UploadFile(filename=source.name, file=BytesIO(source.read_bytes()))
    uploaded = asyncio.run(processor.process(project, upload, "import", transcribe=False))
    assert len(uploaded.track_asset_ids) == 2
    assert not uploaded.asset.has_external_source
    assert (root / uploaded.asset.source_path).read_bytes() == source.read_bytes()

    chosen = asyncio.run(processor.process_local_path(
        project, str(source), cache_local=False,
        stream_indexes=[2], transcribe_stream_indexes=[2],
    ))
    assert len(chosen.track_asset_ids) == 1
    selected_track = library.get(project.id, chosen.track_asset_ids[0])
    assert selected_track.source_archive_stream_index == 2
    assert selected_track.transcription_selected
    saved_parent = library.get(project.id, chosen.asset.id)
    assert [(track.stream_index, track.imported) for track in saved_parent.available_audio_tracks] == [
        (1, False), (2, True),
    ]
    chosen_manifest = json.loads((root / chosen.asset.source_path).parent.joinpath("audio-tracks.json").read_text())
    assert [(track["streamIndex"], track["imported"]) for track in chosen_manifest["availableTracks"]] == [
        (1, False), (2, True),
    ]

    original_bytes = source.read_bytes()
    first_analysis = (root / selected_track.analysis_path).read_bytes()
    added = asyncio.run(processor.materialize_audio_track(project, chosen.asset.id, 1))
    assert added.source_archive_asset_id == chosen.asset.id
    assert added.source_archive_stream_index == 1
    assert added.duration == pytest.approx(selected_track.duration, abs=0.05)
    assert added.sample_rate == 24000 and added.transcription_status == "skipped"
    assert source.read_bytes() == original_bytes
    assert (root / selected_track.analysis_path).read_bytes() == first_analysis
    assert asyncio.run(processor.materialize_audio_track(project, chosen.asset.id, 1)).id == added.id
    library.set_import_selected(project.id, added.id, False)
    assert asyncio.run(processor.materialize_audio_track(project, chosen.asset.id, 1)).import_selected
    reopened = FileMediaLibrary(FileProjectRepository(tmp_path / "registry"))
    assert all(track.imported for track in reopened.get(project.id, chosen.asset.id).available_audio_tracks)
    assert len([asset for asset in reopened.list(project.id)
                if asset.source_archive_asset_id == chosen.asset.id]) == 2

def test_long_audio_uses_bounded_stt_context_with_overlap():
    duration = STT_CHUNK_SECONDS + 1.0
    chunks = MediaImportProcessor._stt_chunks(duration)

    assert chunks == [
        TranscriptionChunk(0.0, duration, 0.0, STT_CHUNK_SECONDS),
        TranscriptionChunk(STT_CHUNK_SECONDS - 2.0, duration, STT_CHUNK_SECONDS, duration),
    ]


def test_chunk_results_keep_original_timestamps_and_drop_overlap_duplicates():
    duration = STT_CHUNK_SECONDS * 2
    chunks = MediaImportProcessor._stt_chunks(duration)
    merged = MediaImportProcessor._merge_studio_chunks(
        [
            (
                chunks[0],
                {
                    "id": "first",
                    "text": "xin duplicate",
                    "words": [
                        {"text": "xin", "start": STT_CHUNK_SECONDS - 0.6, "end": STT_CHUNK_SECONDS - 0.2},
                        # Conflicting context for the next owner's "chao".
                        {"text": "duplicate", "start": STT_CHUNK_SECONDS + 0.8, "end": STT_CHUNK_SECONDS + 1.1},
                    ],
                },
            ),
            (
                chunks[1],
                {
                    "id": "second",
                    "text": "xin chao",
                    "words": [
                        {"text": "xin", "start": 1.4, "end": 1.8},
                        {"text": "chao", "start": 2.7, "end": 3.0},
                    ],
                },
            ),
        ],
        duration,
    )

    assert merged["id"] == "second"
    assert merged["text"] == "xin chao"
    assert [(word["text"], word["start"]) for word in merged["words"]] == [
        ("xin", STT_CHUNK_SECONDS - 0.6),
        ("chao", STT_CHUNK_SECONDS + 0.7),
    ]
    assert merged["duration"] == duration


@pytest.mark.parametrize("partial_words", [[], [{"text": "timed", "start": 1.0, "end": 1.3}]])
def test_chunk_merge_rejects_recognized_untimed_text_instead_of_hiding_it(partial_words):
    chunks = MediaImportProcessor._stt_chunks(120.0)
    with pytest.raises(RuntimeError, match="thiếu word timestamp"):
        MediaImportProcessor._merge_studio_chunks([
            (chunks[0], {"text": "complete", "words": [{"text": "complete", "start": 1.0, "end": 1.3}]}),
            (chunks[1], {"text": "timed and an untimed segment", "words": partial_words,
                         "word_timing_quality": "needs-alignment"}),
        ], 120.0)


def test_chunk_merge_recovers_a_leading_overlap_word_missed_by_its_owner():
    chunks = MediaImportProcessor._stt_chunks(120.0)
    merged = MediaImportProcessor._merge_studio_chunks([
        (chunks[0], {"text": "earlier late", "words": [
            {"text": "earlier", "start": 20.0, "end": 20.4},
            {"text": "late", "start": 59.6, "end": 59.9},
        ]}),
        (chunks[1], {"text": "recovered later", "words": [
            {"text": "recovered", "start": 1.0, "end": 1.4},
            {"text": "later", "start": 3.0, "end": 3.4},
        ]}),
    ], 120.0)
    assert [(w["text"], w["start"]) for w in merged["words"]] == [
        ("earlier", 20.0), ("recovered", 59.0), ("late", 59.6), ("later", 61.0),
    ]


def test_overlap_recovery_cannot_replace_an_existing_word_with_conflicting_text():
    chunks = MediaImportProcessor._stt_chunks(120.0)
    merged = MediaImportProcessor._merge_studio_chunks([
        (chunks[0], {"text": "owner", "words": [{"text": "owner", "start": 59.0, "end": 59.4}]}),
        (chunks[1], {"text": "alternative", "words": [{"text": "alternative", "start": 1.1, "end": 1.5}]}),
    ], 120.0)
    assert [(w["text"], w["start"], w["end"]) for w in merged["words"]] == [("owner", 59.0, 59.4)]


def test_chunk_merge_recovers_trailing_context_only_after_its_owner_is_seen():
    chunks = MediaImportProcessor._stt_chunks(120.0)
    merged = MediaImportProcessor._merge_studio_chunks([
        (chunks[0], {"text": "earlier recovered", "words": [
            {"text": "earlier", "start": 20.0, "end": 20.4},
            {"text": "recovered", "start": 60.2, "end": 60.6},
        ]}),
        (chunks[1], {"text": "later", "words": [{"text": "later", "start": 3.0, "end": 3.4}]}),
    ], 120.0)
    assert [(w["text"], w["start"]) for w in merged["words"]] == [
        ("earlier", 20.0), ("recovered", 60.2), ("later", 61.0),
    ]


def test_stt_artifact_round_trip_preserves_timing_provenance_and_transcript(tmp_path):
    item = {
        "text": "Xin chào phần chưa time",
        "words": [
            {
                "text": "Xin",
                "start": 0.1234,
                "end": 0.4567,
                "confidence": 0.91,
                "timingSource": "faster-whisper-dtw",
            }
        ],
        "word_timing_quality": "needs-alignment",
    }

    canonical = MediaImportProcessor._write_and_read_stt_artifacts(tmp_path, item)

    assert canonical["text"] == "Xin chào phần chưa time"
    assert canonical["words"] == [
        {
            "text": "Xin",
            "start": 0.123,
            "end": 0.457,
            "confidence": 0.91,
            "timingSource": "faster-whisper-dtw",
        }
    ]


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg required")
def test_archive_stt_bounds_recognizer_context_and_retains_gap_words(tmp_path, monkeypatch):
    """Exercise the import caller where a long request omitted a spoken interval.

    Recognition itself is represented by the observed long/short response
    pattern; the real-media causal comparison is retained in STT-GAP-01.
    """
    source = tmp_path / "analysis.wav"
    with wave.open(str(source), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24000)
        audio.writeframes(b"\0\0" * (400 * 24000))
    processor = MediaImportProcessor("http://studio", None, shutil.which("ffmpeg"))
    offsets = {source: 0.0}
    rendered = processor._extract_stt_chunk
    durations = []

    def extract(path, chunk, destination):
        rendered(path, chunk, destination)
        offsets[destination] = chunk.source_start

    async def recognize(path, *args, **kwargs):
        with wave.open(str(path), "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
        durations.append(duration)
        offset = offsets[path]
        candidates = [("before", 239.0, 240.0), ("after", 269.0, 270.0)]
        if duration <= 64.01:
            candidates.insert(1, ("recovered", 245.0, 245.4))
        words = [{"text": text, "start": start - offset, "end": end - offset,
                  "timingSource": "faster-whisper-dtw"}
                 for text, start, end in candidates if offset <= start < offset + duration]
        return {"text": " ".join(w["text"] for w in words), "words": words}, 0.0

    monkeypatch.setattr(processor, "_extract_stt_chunk", extract)
    monkeypatch.setattr(processor, "_upload_studio_audio", recognize)
    item, _ = asyncio.run(processor._run_studio_import(source, "import", "", model="large-v3"))
    assert [(w["text"], w["start"], w["end"]) for w in item["words"]] == [
        ("before", 239.0, 240.0), ("recovered", 245.0, 245.4), ("after", 269.0, 270.0),
    ]
    assert max(durations) <= 64.01
    assert not (tmp_path / "cache/stt-chunks").exists()
