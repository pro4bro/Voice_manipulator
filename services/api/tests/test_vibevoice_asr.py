from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.adapters.engine_worker import EngineWorkerError
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.gpu_lease import GpuLease
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.training_model_catalog import FileTrainingModelCatalog
from app.adapters.vibevoice_asr_transcriber import (
    TIMING_SOURCE,
    VibeVoiceAsrError,
    VibeVoiceAsrTranscriber,
    segments_to_item,
)
from app.domain.models import MediaAssetCreate, ProjectCreate
from app.settings import Settings

SEGMENTS = [
    {"start_time": 0.0, "end_time": 2.0, "speaker_id": 0, "text": "Xin chào anh"},
    {"start_time": 2.5, "end_time": 3.5, "speaker_id": 1, "text": "ờ vâng"},
    {"start_time": 4.0, "end_time": 4.0, "speaker_id": 1, "text": "rỗng thời gian"},
    {"start_time": 5.0, "end_time": 6.0, "speaker_id": 0, "text": "   "},
]


def test_utterances_become_untrusted_words_inside_their_own_span():
    item = segments_to_item(SEGMENTS, duration=10.0)

    assert item["text"] == "Xin chào anh ờ vâng"
    assert item["word_timing_quality"] == "needs-alignment"
    assert [word["text"] for word in item["words"]] == ["Xin", "chào", "anh", "ờ", "vâng"]
    assert all(word["timingTrusted"] is False and word["timingSource"] == TIMING_SOURCE for word in item["words"])
    first = [word for word in item["words"] if word["segmentIndex"] == 0]
    assert first[0]["start"] == 0.0 and first[-1]["end"] == pytest.approx(2.0, abs=0.002)
    assert item["words"][3]["start"] == 2.5
    assert {word["asrSpeakerId"] for word in item["words"]} == {"speaker-1", "speaker-2"}
    assert "diarizationSpeakerId" not in item["words"][0]


class FakeWorker:
    def __init__(self, reply=None, error=None):
        self.reply = reply
        self.error = error
        self.requests = []

    def request(self, payload):
        self.requests.append(payload)
        if self.error:
            raise self.error
        return self.reply


def vibevoice_tree(tmp_path) -> Path:
    root = tmp_path / "VibeVoice"
    for relative in (
        "VibeVoice/vibevoice/modular/modeling_vibevoice_asr.py",
        "VibeVoice/.venv/Scripts/python.exe",
        "VibeVoice_models/microsoft/VibeVoice-ASR/config.json",
        "VibeVoice_models/Qwen/Qwen2.5-7B/tokenizer_config.json",
    ):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("", encoding="utf-8")
    return root


def test_the_transcriber_names_exactly_what_is_missing(tmp_path):
    lease = GpuLease(tmp_path / "gpu.json")
    root = vibevoice_tree(tmp_path)
    (root / "VibeVoice_models/Qwen/Qwen2.5-7B/tokenizer_config.json").unlink()

    transcriber = VibeVoiceAsrTranscriber(root, lease, worker=FakeWorker())

    assert "Qwen2.5-7B" in transcriber.unavailable_reason()
    with pytest.raises(VibeVoiceAsrError, match="tokenizer"):
        transcriber.transcribe(tmp_path / "a.wav", 3.0)
    assert VibeVoiceAsrTranscriber(tmp_path / "nowhere", lease, worker=FakeWorker()).unavailable_reason().startswith("Chưa thấy repo")


def test_the_transcriber_frees_the_gpu_before_and_after_and_reports_worker_failures(tmp_path):
    lease = GpuLease(tmp_path / "gpu.json")
    freed = []
    worker = FakeWorker(reply={"ok": True, "segments": SEGMENTS[:1]})
    transcriber = VibeVoiceAsrTranscriber(vibevoice_tree(tmp_path), lease, before_gpu_work=lambda: freed.append(True), worker=worker)

    item = transcriber.transcribe(tmp_path / "a.wav", 3.0)

    assert freed == [True] and lease.holder() is None
    assert item["text"] == "Xin chào anh"
    assert worker.requests[0]["model"].endswith("VibeVoice-ASR")

    failing = VibeVoiceAsrTranscriber(vibevoice_tree(tmp_path / "second"), lease, worker=FakeWorker(error=EngineWorkerError("Worker VibeVoice-ASR đã thoát.")))
    with pytest.raises(VibeVoiceAsrError, match="đã thoát"):
        failing.transcribe(tmp_path / "a.wav", 3.0)
    assert lease.holder() is None


def test_the_queue_model_value_routes_transcription_to_vibevoice(tmp_path, monkeypatch):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="ASR"))
    media = FileMediaLibrary(projects)
    analysis = Path(project.project_path) / "assets" / "media" / "asset-1" / "analysis.wav"
    analysis.parent.mkdir(parents=True)
    analysis.write_bytes(b"wav")
    asset = media.create(project.id, MediaAssetCreate(
        name="phong-van.wav", source_extension=".wav", media_kind="audio", source_path="assets/media/asset-1/analysis.wav",
        analysis_path="assets/media/asset-1/analysis.wav", origin="import", duration=10.0, transcription_status="queued",
    ), "asset-1")
    calls = []

    def engine(path, duration):
        calls.append((path, duration))
        return segments_to_item(SEGMENTS, duration)

    processor = MediaImportProcessor("http://studio", media, "ffmpeg", other_stt={"vibevoice-asr": engine})
    monkeypatch.setattr(processor, "_audio_duration", lambda _path: 10.0)

    async def studio_must_not_run(*_args, **_kwargs):
        raise AssertionError("the Studio sidecar must not run for VibeVoice-ASR")

    monkeypatch.setattr(processor, "_run_studio_import", studio_must_not_run)

    updated, _ = asyncio.run(processor.transcribe_existing(project, asset, model="vibevoice-asr"))

    assert calls and calls[0][1] == 10.0
    assert updated.text == "Xin chào anh ờ vâng"
    assert updated.word_timing_quality == "needs-alignment"
    assert all(word.get("timingTrusted") is False for word in updated.words)


def test_stt_engines_are_described_like_every_other_capability():
    settings = Settings.from_env()
    options = {option.id: option for option in FileTrainingModelCatalog(settings.stt_engines_root, {}).options()}

    whisper_models = next(spec for spec in options["faster-whisper"].parameters if spec.key == "model")
    assert [choice.value for choice in whisper_models.options] == ["tiny", "base", "small", "medium", "large-v3"]
    assert options["vibevoice-asr"].engine == "vibevoice-asr"


def test_the_whisper_model_choices_are_the_ones_the_studio_accepts():
    import ast

    server = Settings.from_env().project_root / "services" / "stt_studio" / "studio_app" / "server.py"
    tree = ast.parse(server.read_text(encoding="utf-8"))
    supported = next(
        ast.literal_eval(node.value)
        for node in tree.body
        if isinstance(node, ast.Assign) and any(getattr(target, "id", None) == "SUPPORTED_STT_MODELS" for target in node.targets)
    )
    settings = Settings.from_env()
    whisper = next(option for option in FileTrainingModelCatalog(settings.stt_engines_root, {}).options() if option.id == "faster-whisper")
    choices = {choice.value for spec in whisper.parameters if spec.key == "model" for choice in spec.options}

    assert choices == supported

