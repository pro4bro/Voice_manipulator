import asyncio
from io import BytesIO

from fastapi import UploadFile

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.media_import_processor import MediaImportProcessor, TranscriptionChunk
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

def test_long_audio_is_split_into_ten_minute_stt_chunks_with_overlap():
    chunks = MediaImportProcessor._stt_chunks(1201.0)

    assert chunks == [
        TranscriptionChunk(0.0, 602.0, 0.0, 600.0),
        TranscriptionChunk(598.0, 1201.0, 600.0, 1200.0),
        TranscriptionChunk(1198.0, 1201.0, 1200.0, 1201.0),
    ]


def test_chunk_results_keep_original_timestamps_and_drop_overlap_duplicates():
    chunks = MediaImportProcessor._stt_chunks(1200.0)
    merged = MediaImportProcessor._merge_studio_chunks(
        [
            (
                chunks[0],
                {
                    "id": "first",
                    "text": "xin duplicate",
                    "words": [
                        {"text": "xin", "start": 599.4, "end": 599.8},
                        {"text": "duplicate", "start": 600.1, "end": 600.5},
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
        1200.0,
    )

    assert merged["id"] == "second"
    assert merged["text"] == "xin chao"
    assert [(word["text"], word["start"]) for word in merged["words"]] == [
        ("xin", 599.4),
        ("chao", 600.7),
    ]
    assert merged["duration"] == 1200.0
