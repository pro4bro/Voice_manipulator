import asyncio
import hashlib
import json
import shutil
import subprocess
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

def test_long_audio_uses_99_percent_of_the_ninety_minute_stt_ceiling_with_overlap():
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
                        {"text": "duplicate", "start": STT_CHUNK_SECONDS + 0.1, "end": STT_CHUNK_SECONDS + 0.5},
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
