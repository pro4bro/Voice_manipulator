from __future__ import annotations

import hashlib
import threading
import time
import wave
from pathlib import Path

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.gpu_lease import GpuBusy, GpuLease
from app.adapters.omnivoice_generator import VoiceGenerationCancelled, VoiceGenerator
from app.adapters.training_model_catalog import FileTrainingModelCatalog
from app.adapters.voice_script_speaker import SAMPLE_RATE, StudioWordRecognizer, VoiceScriptSpeaker, read_pcm, trim_to_words
from app.domain.models import DatasetSegment, ProjectCreate, VoiceGenerateRequest, VoiceScriptRequest, VoiceScriptRow
from app.domain.script_word_alignment import align_script_words, script_tokens
from app.settings import Settings

SETTINGS = Settings.from_env()


def heard(*items):
    return [{"text": text, "start": start, "end": end} for text, start, end in items]


# ---------------------------------------------------------------- alignment


def test_words_recognition_heard_take_its_timing_and_the_script_spelling():
    words, quality = align_script_words("Xin chào, mọi người!", heard(("xin", 0.1, 0.3), ("chào", 0.3, 0.6), ("mọi", 0.7, 0.9), ("người", 0.9, 1.2)), 1.4)

    assert [word["text"] for word in words] == ["Xin", "chào,", "mọi", "người!"]
    assert [(word["start"], word["end"]) for word in words] == [(0.1, 0.3), (0.3, 0.6), (0.7, 0.9), (0.9, 1.2)]
    assert quality == "source" and all(word["timingTrusted"] for word in words)


def test_a_word_recognition_missed_sits_between_its_neighbours_and_is_not_trusted():
    words, quality = align_script_words("một hai ba bốn", heard(("một", 0.0, 0.2), ("bốn", 1.0, 1.2)), 1.5)

    hai, ba = words[1], words[2]
    assert 0.2 <= hai["start"] < hai["end"] <= ba["start"] < ba["end"] <= 1.0
    assert not hai["timingTrusted"] and hai["timingSource"] == "script-proportional"
    assert words[0]["timingTrusted"] and words[3]["timingTrusted"]
    assert quality == "partial"


def test_a_misheard_word_one_for_one_keeps_the_measured_interval():
    words, _ = align_script_words("Pro4Bro rất nhanh", heard(("pro", 0.0, 0.4), ("rất", 0.4, 0.6), ("nhanh", 0.6, 0.9)), 1.0)

    assert (words[0]["start"], words[0]["end"]) == (0.0, 0.4) and words[0]["timingTrusted"]


def test_without_recognition_the_row_is_spread_by_length_and_flagged():
    words, quality = align_script_words("a dài", [], 1.2)

    assert words[0]["start"] == 0.0 and words[-1]["end"] == 1.2
    assert words[1]["end"] - words[1]["start"] > words[0]["end"] - words[0]["start"]
    assert quality == "needs-alignment" and not any(word["timingTrusted"] for word in words)


def test_punctuation_on_its_own_stays_with_the_word_before_it():
    assert script_tokens("Vâng , được - thôi") == ["Vâng,", "được -", "thôi"]


# ---------------------------------------------------------------- speaker


def write_tone(path: Path, seconds: float, rate: int = SAMPLE_RATE, sample: int = 0x10) -> None:
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(sample.to_bytes(2, "little", signed=True) * int(seconds * rate))


class FakeEngine:
    """Speaks 0.25 s per word, at 16 kHz to prove the output is resampled."""

    def __init__(self, fail_on: str | None = None) -> None:
        self.spoken: list[str] = []
        self.fail_on = fail_on

    def request(self, payload):
        if payload["text"] == self.fail_on:
            return {"ok": False, "error": "RuntimeError: out of memory"}
        self.spoken.append(payload["text"])
        seconds = 0.25 * len(payload["text"].split())
        write_tone(Path(payload["output"]), seconds, rate=16000)
        return {"ok": True, "seconds": seconds}


class RevisionEngine(FakeEngine):
    def request(self, payload):
        if payload["text"] == self.fail_on:
            return {"ok": False, "error": "RuntimeError: out of memory"}
        self.spoken.append(payload["text"])
        seconds = 0.25 * len(payload["text"].split())
        write_tone(Path(payload["output"]), seconds, rate=16000, sample=100 * len(self.spoken))
        return {"ok": True, "seconds": seconds}


class BlockingEngine(FakeEngine):
    def __init__(self, *, cancelable: bool = False) -> None:
        super().__init__()
        self.entered = threading.Event()
        self.release = threading.Event()
        self.cancelable = cancelable

    def request(self, payload):
        self.entered.set()
        self.release.wait(timeout=5)
        if self.cancelable and not self.release.is_set():
            return {"ok": False, "error": "cancelled"}
        return super().request(payload)

    def cancel_request(self, cancellation_id: str) -> bool:
        if not self.cancelable:
            return False
        self.cancelable = False
        self.release.set()
        return True


class FakeRecognizer:
    def __init__(self) -> None:
        self.languages: list[str | None] = []

    def recognize(self, audio: Path, language: str | None):
        self.languages.append(language)
        with wave.open(str(audio)) as handle:
            seconds = handle.getnframes() / handle.getframerate()
        text = CLIP_TEXT.pop(0)
        step = seconds / len(text.split())
        return [{"text": word, "start": index * step, "end": (index + 1) * step} for index, word in enumerate(text.split())]


class BlockingRecognizer:
    def __init__(self) -> None:
        self.entered = threading.Event()
        self.release = threading.Event()
        self.cancellation_id: str | None = None

    def recognize(self, audio: Path, language: str | None, cancellation_id: str | None = None):
        self.cancellation_id = cancellation_id
        self.entered.set()
        self.release.wait(timeout=5)
        raise RuntimeError("recognition cancelled")

    def cancel_request(self, cancellation_id: str) -> bool:
        assert cancellation_id == self.cancellation_id
        self.release.set()
        return True


CLIP_TEXT: list[str] = []


def test_same_voice_id_with_changed_reference_does_not_reuse_old_audio(tmp_path):
    engine = FakeEngine()
    project, an, _, outputs, _, speaker, _ = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    request = VoiceScriptRequest(rows=[VoiceScriptRow(id="r1", voice_id=an.id, text="Xin chào")])
    first = speaker.start(project.id, request, background=False)
    reference = speaker.generator.voices.absolute(project.id, an.reference_audio)
    reference.write_bytes(b"different reference bytes")
    second = speaker.start(project.id, request, background=False)
    assert second.status == "complete" and second.reused == 0
    assert first.output.segments[0].clip != second.output.segments[0].clip
    assert len(engine.spoken) == 2


def test_corrupt_cached_clip_is_regenerated_without_rewriting_old_revision(tmp_path):
    engine = FakeEngine()
    project, an, _, outputs, _, speaker, _ = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    request = VoiceScriptRequest(rows=[VoiceScriptRow(id="r1", voice_id=an.id, text="Xin chào")])
    first = speaker.start(project.id, request, background=False)
    old = outputs.clips_root(project.id) / first.output.segments[0].clip / "audio.wav"
    old.write_bytes(b"broken")
    second = speaker.start(project.id, request, background=False)
    assert second.status == "complete" and second.reused == 0
    assert second.output.segments[0].clip != first.output.segments[0].clip
    assert old.read_bytes() == b"broken"
    with wave.open(str(outputs.audio_path(project.id, second.output.id))) as audio:
        assert audio.getframerate() == SAMPLE_RATE and audio.getnframes() > 0


def segment(segment_id: str, speaker: str) -> DatasetSegment:
    return DatasetSegment(id=segment_id, asset_id="asset-1", audio_path="assets/media/asset-1/analysis.wav",
                          start=0, end=8, text=f"mẫu {segment_id}", speaker_profile_id=speaker)


def copy_slicer(source: Path, destination: Path, start: float, end: float) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(source.read_bytes())


def speaker_fixture(tmp_path, engine: FakeEngine):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Script", location=str(tmp_path / "projects")))
    audio = Path(project.project_path) / "assets" / "media" / "asset-1" / "analysis.wav"
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"RIFF")
    voices = FileProjectVoices(projects, copy_slicer)
    an = voices.publish(project.id, name="An · nhái giọng", speaker_profile_id="speaker-an", kind="clone", reference=segment("an", "speaker-an"), language="vi")
    binh = voices.publish(project.id, name="Bình · nhái giọng", speaker_profile_id="speaker-binh", kind="clone", reference=segment("binh", "speaker-binh"), language="vi")
    engine_root = tmp_path / "engine" / "omnivoice" / "cli"
    engine_root.mkdir(parents=True)
    (engine_root / "infer.py").write_text("", encoding="utf-8")
    generators = FileTrainingModelCatalog(SETTINGS.voice_generators_root, {"omnivoice": tmp_path / "engine"})
    outputs = FileVoiceOutputs(projects)
    lease = GpuLease(tmp_path / "gpu.json")
    generator = VoiceGenerator(projects, voices, outputs, engine, lease, generators)  # type: ignore[arg-type]
    recognizer = FakeRecognizer()
    speaker = VoiceScriptSpeaker(projects, outputs, generator, lease, recognizer=recognizer)
    return project, an, binh, outputs, lease, speaker, recognizer


def test_a_script_is_read_row_by_row_into_one_output_with_words_on_its_timeline(tmp_path):
    engine = FakeEngine()
    project, an, binh, outputs, lease, speaker, recognizer = speaker_fixture(tmp_path, engine)
    CLIP_TEXT[:] = ["xin chào", "chào anh nhé", "tạm biệt"]
    request = VoiceScriptRequest(gap_seconds=0.5, rows=[
        VoiceScriptRow(id="r1", voice_id=an.id, text="Xin chào"),
        VoiceScriptRow(id="r2", voice_id=binh.id, text="Chào  anh nhé"),
        VoiceScriptRow(id="r3", voice_id=an.id, text="Tạm biệt"),
    ])

    job = speaker.start(project.id, request, background=False)

    assert job.status == "complete" and job.done == 3 and job.reused == 0
    output = job.output
    assert [(s.row_id, s.speaker_profile_id, s.start, s.end) for s in output.segments] == [
        ("r1", "speaker-an", 0.0, 0.5), ("r2", "speaker-binh", 1.0, 1.75), ("r3", "speaker-an", 2.25, 2.75),
    ]
    assert output.duration == 2.75 and output.text == "Xin chào\nChào anh nhé\nTạm biệt"
    assert [w["text"] for w in output.words] == ["Xin", "chào", "Chào", "anh", "nhé", "Tạm", "biệt"]
    assert output.words[2]["start"] == 1.0 and output.words[2]["speakerId"] == "speaker-binh" and output.words[2]["segmentIndex"] == 1
    assert output.word_timing_quality == "source"
    with wave.open(str(outputs.audio_path(project.id, output.id))) as handle:
        # Resampling the 16 kHz engine output may drop a frame or two at each row's end.
        assert handle.getframerate() == SAMPLE_RATE and abs(handle.getnframes() - 2.75 * SAMPLE_RATE) < 10
    assert recognizer.languages == ["vi", "vi", "vi"]
    assert lease.holder() is None
    assert outputs.list(project.id) == [output]


def test_terminal_generation_status_waits_until_gpu_lease_is_released(tmp_path, monkeypatch):
    project, an, _binh, _outputs, lease, speaker, _recognizer = speaker_fixture(tmp_path, FakeEngine())
    speaker.recognizer = None
    releasing = threading.Event()
    allow_release = threading.Event()
    release = lease.release

    def delayed_release(token):
        releasing.set()
        assert allow_release.wait(3)
        release(token)

    monkeypatch.setattr(lease, "release", delayed_release)
    job = speaker.start(project.id, VoiceScriptRequest(rows=[
        VoiceScriptRow(id="r1", voice_id=an.id, text="xin chào"),
    ]))
    try:
        assert releasing.wait(3)
        assert lease.holder() is not None
        assert speaker.job(project.id, job.id).status == "running"
    finally:
        allow_release.set()
    deadline = time.monotonic() + 3
    while speaker.job(project.id, job.id).status == "running" and time.monotonic() < deadline:
        time.sleep(.01)
    assert speaker.job(project.id, job.id).status == "complete"
    assert lease.holder() is None


def test_voice_output_exports_wav_and_one_srt_cue_per_script_row_without_word_alignment(tmp_path):
    from dataclasses import replace
    from fastapi.testclient import TestClient
    from app.main import create_app

    project, an, binh, outputs, _lease, speaker, _recognizer = speaker_fixture(tmp_path, FakeEngine())
    speaker.recognizer = None
    job = speaker.start(project.id, VoiceScriptRequest(gap_seconds=0.5, rows=[
        VoiceScriptRow(id="r1", voice_id=an.id, text="Xin chào"),
        VoiceScriptRow(id="r2", voice_id=binh.id, text="Tạm biệt"),
    ]), background=False)
    output = job.output
    assert output.word_timing_quality == "needs-alignment"
    client = TestClient(create_app(project_repository=speaker.projects,
                                   settings=replace(Settings.from_env(), data_root=tmp_path / "data")))
    route = f"/api/projects/{project.id}/voice-outputs/{output.id}"

    audio = client.get(f"{route}/audio")
    lines = client.get(f"{route}/subtitles", params={"mode": "line"})

    assert audio.status_code == 200
    assert audio.content == outputs.audio_path(project.id, output.id).read_bytes()
    assert lines.status_code == 200
    assert lines.headers["x-pro4bro-skipped-cues"] == "0"
    assert lines.headers["content-disposition"].endswith(f'{output.id}--line.srt"')
    assert lines.text.count("-->") == 2
    assert "00:00:00,000 --> 00:00:00,500" in lines.text
    assert "00:00:01,000 --> 00:00:01,500" in lines.text
    assert "Xin chào" in lines.text and "Tạm biệt" in lines.text
    assert (Path(project.project_path) / "exports" / "subtitles" / f"{output.id}--line.srt").is_file()
    assert client.get(f"{route}/subtitles", params={"mode": "word"}).status_code == 400
    output.words = [
        {"text": "Xin", "start": 0.1, "end": 0.3, "timingTrusted": True},
        {"text": "unsafe", "start": 0.3, "end": 0.4, "timingTrusted": False},
    ]
    outputs.save(project.id, output)
    words = client.get(f"{route}/subtitles", params={"mode": "word"})
    assert words.status_code == 200
    assert words.headers["x-pro4bro-skipped-cues"] == "1"
    assert words.text.count("-->") == 1 and "unsafe" not in words.text


def test_reading_again_speaks_only_the_rows_that_changed(tmp_path):
    engine = FakeEngine()
    project, an, binh, outputs, _lease, speaker, _ = speaker_fixture(tmp_path, engine)
    CLIP_TEXT[:] = ["một", "hai"]
    rows = [VoiceScriptRow(id="r1", voice_id=an.id, text="một"), VoiceScriptRow(id="r2", voice_id=binh.id, text="hai")]
    first = speaker.start(project.id, VoiceScriptRequest(rows=rows), background=False)
    CLIP_TEXT[:] = ["ba"]
    rows[1] = VoiceScriptRow(id="r2", voice_id=binh.id, text="ba")

    second = speaker.start(project.id, VoiceScriptRequest(rows=rows), background=False)

    assert engine.spoken == ["một", "hai", "ba"]
    assert second.reused == 1 and second.output.segments[0].clip == first.output.segments[0].clip

    outputs.delete(project.id, first.output.id)
    assert outputs.prune_clips(project.id, keep_recent_seconds=0) == 1  # "hai"; the second output still uses "một"
    assert {folder.name for folder in outputs.clips_root(project.id).iterdir()} == {segment.clip for segment in second.output.segments}
    outputs.delete(project.id, second.output.id)
    outputs.prune_clips(project.id, keep_recent_seconds=0)
    assert list(outputs.clips_root(project.id).iterdir()) == []


def test_a_busy_gpu_or_a_missing_voice_is_refused_before_anything_is_spoken(tmp_path):
    engine = FakeEngine()
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, engine)

    with pytest.raises(ValueError, match="Voice của đoạn 2"):
        speaker.start(project.id, VoiceScriptRequest(rows=[VoiceScriptRow(id="a", voice_id=an.id, text="x"), VoiceScriptRow(id="b", voice_id="voice-gone", text="y")]), background=False)
    holder = lease.acquire("training:run-1")
    with pytest.raises(GpuBusy):
        speaker.start(project.id, VoiceScriptRequest(rows=[VoiceScriptRow(id="a", voice_id=an.id, text="x")]), background=False)
    lease.release(holder.token)
    assert engine.spoken == [] and outputs.list(project.id) == []


def test_a_failed_row_fails_the_job_and_frees_the_gpu(tmp_path):
    engine = FakeEngine(fail_on="hỏng")
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, engine)
    CLIP_TEXT[:] = ["tốt"]

    job = speaker.start(project.id, VoiceScriptRequest(rows=[VoiceScriptRow(id="a", voice_id=an.id, text="tốt"), VoiceScriptRow(id="b", voice_id=an.id, text="hỏng")]), background=False)

    assert job.status == "failed" and "out of memory" in job.error and job.done == 1
    assert lease.holder() is None and outputs.list(project.id) == []
    assert [folder.name for folder in outputs.clips_root(project.id).iterdir() if ".partial-" in folder.name] == []


def test_queue_stop_finishes_the_current_script_row_and_suppresses_later_rows(tmp_path):
    engine = BlockingEngine()
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, engine)
    CLIP_TEXT[:] = ["đang chạy"]
    job = speaker.start(project.id, VoiceScriptRequest(rows=[
        VoiceScriptRow(id="r1", voice_id=an.id, text="đang chạy"),
        VoiceScriptRow(id="r2", voice_id=an.id, text="không đọc"),
    ]))
    assert engine.entered.wait(timeout=2)

    stopped = speaker.stop(project.id)
    assert stopped is not None and stopped.status == "running"
    engine.release.set()
    deadline = time.monotonic() + 5
    while (speaker.job(project.id, job.id).status == "running" or lease.holder() is not None) and time.monotonic() < deadline:
        time.sleep(0.01)

    result = speaker.job(project.id, job.id)
    assert result.status == "stopped" and result.done == 1
    assert result.output is not None and [segment.row_id for segment in result.output.segments] == ["r1"]
    assert len(outputs.list(project.id)) == 1 and lease.holder() is None


def test_queue_stop_at_row_boundary_publishes_the_completed_prefix(tmp_path, monkeypatch):
    import app.adapters.voice_script_speaker as module

    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, FakeEngine())
    CLIP_TEXT[:] = ["một", "hai"]
    boundary = threading.Event()
    release_boundary = threading.Event()
    assembling = threading.Event()
    release_assembly = threading.Event()
    original_update = module.CENTER.update_task
    original_assemble = speaker._assemble

    def block_after_first_row(task_id, **changes):
        original_update(task_id, **changes)
        if changes.get("fraction") == 0.5:
            boundary.set()
            release_boundary.wait(timeout=5)

    def block_assembly(*args, **kwargs):
        assembling.set()
        release_assembly.wait(timeout=5)
        return original_assemble(*args, **kwargs)

    monkeypatch.setattr(module.CENTER, "update_task", block_after_first_row)
    monkeypatch.setattr(speaker, "_assemble", block_assembly)
    job = speaker.start(project.id, VoiceScriptRequest(rows=[
        VoiceScriptRow(id="r1", voice_id=an.id, text="một"),
        VoiceScriptRow(id="r2", voice_id=an.id, text="hai"),
    ]))
    assert boundary.wait(timeout=3)

    boundary_stop = speaker.stop(project.id)
    assert boundary_stop is not None and boundary_stop.status == "running"
    release_boundary.set()
    assert assembling.wait(timeout=3)
    assembly_stop = speaker.stop(project.id)
    assert assembly_stop is not None and assembly_stop.status == "running"
    release_assembly.set()

    deadline = time.monotonic() + 5
    while speaker.job(project.id, job.id).status == "running" and time.monotonic() < deadline:
        time.sleep(0.01)
    result = speaker.job(project.id, job.id)
    assert result.status == "stopped" and result.done == 1
    assert result.output is not None and [segment.row_id for segment in result.output.segments] == ["r1"]
    assert outputs.list(project.id) == [result.output]
    assert lease.holder() is None


def test_queue_stop_during_assembly_completes_when_all_rows_are_read(tmp_path, monkeypatch):
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, FakeEngine())
    CLIP_TEXT[:] = ["một"]
    entered = threading.Event()
    release = threading.Event()
    original_assemble = speaker._assemble

    def blocked_assemble(*args, **kwargs):
        entered.set()
        release.wait(timeout=5)
        return original_assemble(*args, **kwargs)

    monkeypatch.setattr(speaker, "_assemble", blocked_assemble)
    job = speaker.start(project.id, VoiceScriptRequest(rows=[VoiceScriptRow(id="r1", voice_id=an.id, text="một")]))
    assert entered.wait(timeout=3)
    stopped = speaker.stop(project.id)
    assert stopped is not None and stopped.status == "running"
    release.set()

    deadline = time.monotonic() + 5
    while speaker.job(project.id, job.id).status == "running" and time.monotonic() < deadline:
        time.sleep(0.01)
    result = speaker.job(project.id, job.id)
    assert result.status == "complete" and result.done == 1 and result.output is not None
    assert outputs.list(project.id) == [result.output]
    assert lease.holder() is None


def test_all_stop_cancels_active_script_row_without_publishing_output(tmp_path, monkeypatch):
    engine = BlockingEngine(cancelable=True)
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, engine)
    released = threading.Event()
    release_lease = lease.release

    def release_and_signal(token: str) -> bool:
        result = release_lease(token)
        released.set()
        return result

    monkeypatch.setattr(lease, "release", release_and_signal)
    CLIP_TEXT[:] = ["đang chạy"]
    job = speaker.start(project.id, VoiceScriptRequest(rows=[
        VoiceScriptRow(id="r1", voice_id=an.id, text="đang chạy"),
        VoiceScriptRow(id="r2", voice_id=an.id, text="không đọc"),
    ]))
    assert engine.entered.wait(timeout=2)

    stopped = speaker.stop(project.id, include_active=True)
    assert released.wait(timeout=5)

    result = speaker.job(project.id, job.id)
    assert stopped is not None and stopped.status == "cancelled"
    assert result.status == "cancelled" and result.output is None
    assert outputs.list(project.id) == [] and lease.holder() is None
    assert list(outputs.clips_root(project.id).iterdir()) == []


def _artifact_hashes(paths: list[Path]) -> dict[str, str]:
    return {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}


def test_force_regenerate_speaks_again_and_keeps_previous_output_and_clip(tmp_path):
    engine = RevisionEngine()
    project, an, _binh, outputs, _lease, speaker, _ = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    rows = [VoiceScriptRow(id="row-1", voice_id=an.id, text="same words")]
    first = speaker.start(project.id, VoiceScriptRequest(rows=rows), background=False)
    old_clip = outputs.clips_root(project.id) / first.output.segments[0].clip
    old_hashes = _artifact_hashes([
        outputs.audio_path(project.id, first.output.id),
        old_clip / "audio.wav",
        old_clip / "clip.json",
    ])
    old_output_audio = outputs.audio_path(project.id, first.output.id).read_bytes()

    forced = VoiceScriptRequest.model_validate({
        "rows": [{"id": rows[0].id, "voiceId": rows[0].voice_id, "text": rows[0].text}],
        "forceRegenerate": True,
    })
    assert forced.force_regenerate is True
    second = speaker.start(project.id, forced, background=False)

    assert second.status == "complete" and second.reused == 0
    assert engine.spoken == ["same words", "same words"]
    assert second.output.segments[0].clip != first.output.segments[0].clip
    assert outputs.audio_path(project.id, first.output.id).read_bytes() == old_output_audio
    assert _artifact_hashes([
        outputs.audio_path(project.id, first.output.id),
        old_clip / "audio.wav",
        old_clip / "clip.json",
    ]) == old_hashes
    assert outputs.audio_path(project.id, second.output.id).is_file()
    with wave.open(str(outputs.audio_path(project.id, second.output.id))) as handle:
        assert handle.getframerate() == SAMPLE_RATE and handle.getnframes() > 0


def test_failed_forced_regeneration_keeps_previous_output_and_clip(tmp_path):
    engine = RevisionEngine(fail_on="same words")
    project, an, _binh, outputs, _lease, speaker, _ = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    rows = [VoiceScriptRow(id="row-1", voice_id=an.id, text="same words")]
    engine.fail_on = None
    first = speaker.start(project.id, VoiceScriptRequest(rows=rows), background=False)
    old_clip = outputs.clips_root(project.id) / first.output.segments[0].clip
    old_paths = [outputs.audio_path(project.id, first.output.id), old_clip / "audio.wav", old_clip / "clip.json"]
    old_hashes = _artifact_hashes(old_paths)
    engine.fail_on = "same words"

    failed = speaker.start(
        project.id,
        VoiceScriptRequest(rows=rows, force_regenerate=True),
        background=False,
    )

    assert failed.status == "failed" and "out of memory" in failed.error
    assert [output.id for output in outputs.list(project.id)] == [first.output.id]
    assert _artifact_hashes(old_paths) == old_hashes
    assert [folder.name for folder in outputs.clips_root(project.id).iterdir() if ".partial-" in folder.name] == []


def test_cancelled_forced_regeneration_keeps_previous_output_and_clip(tmp_path):
    engine = BlockingEngine(cancelable=True)
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, engine)
    speaker.recognizer = None
    request = VoiceScriptRequest(rows=[VoiceScriptRow(id="row-1", voice_id=an.id, text="same words")])
    first_job = speaker.start(project.id, request)
    assert engine.entered.wait(timeout=2)
    engine.release.set()
    deadline = time.monotonic() + 5
    while speaker.job(project.id, first_job.id).status == "running" and time.monotonic() < deadline:
        time.sleep(0.01)
    first = speaker.job(project.id, first_job.id)
    assert first.status == "complete" and first.output is not None

    old_clip = outputs.clips_root(project.id) / first.output.segments[0].clip
    old_paths = [outputs.audio_path(project.id, first.output.id), old_clip / "audio.wav", old_clip / "clip.json"]
    old_hashes = _artifact_hashes(old_paths)
    engine.entered.clear()
    engine.release.clear()
    engine.cancelable = True
    forced_job = speaker.start(project.id, request.model_copy(update={"force_regenerate": True}))
    assert engine.entered.wait(timeout=2)

    cancelled = speaker.stop(project.id, include_active=True)
    assert cancelled is not None and cancelled.status == "cancelled"
    deadline = time.monotonic() + 5
    while lease.holder() is not None and time.monotonic() < deadline:
        time.sleep(0.01)

    assert speaker.job(project.id, forced_job.id).status == "cancelled"
    assert [output.id for output in outputs.list(project.id)] == [first.output.id]
    assert _artifact_hashes(old_paths) == old_hashes
    assert [folder.name for folder in outputs.clips_root(project.id).iterdir() if ".partial-" in folder.name] == []


def test_all_stop_cancels_blocking_word_recognition(tmp_path):
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, FakeEngine())
    recognizer = BlockingRecognizer()
    speaker.recognizer = recognizer
    CLIP_TEXT[:] = ["xin chào"]
    errors: list[Exception] = []

    def start_script() -> None:
        try:
            speaker.start(project.id, VoiceScriptRequest(rows=[VoiceScriptRow(id="r1", voice_id=an.id, text="Xin chào")]), background=False)
        except Exception as exc:
            errors.append(exc)

    thread = threading.Thread(target=start_script, daemon=True)
    thread.start()
    assert recognizer.entered.wait(timeout=3)

    stopped = speaker.stop(project.id, include_active=True)
    thread.join(timeout=3)

    assert not thread.is_alive() and not errors
    assert stopped is not None and stopped.status == "cancelled"
    assert recognizer.cancellation_id and recognizer.cancellation_id.endswith("-words")
    assert outputs.list(project.id) == []
    assert list(outputs.clips_root(project.id).iterdir()) == []
    assert lease.holder() is None


def test_studio_recognizer_uses_progress_id_and_accepts_pre_dispatch_cancel_ack(tmp_path, monkeypatch):
    import app.adapters.voice_script_speaker as module

    calls = []

    class Response:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"cancelled": False} if "/cancel" in calls[-1][0] else {"item": {"words": []}}

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setattr(module.httpx, "post", post)
    recognizer = StudioWordRecognizer("http://studio")
    audio = tmp_path / "clip.wav"
    write_tone(audio, 0.1)

    assert recognizer.recognize(audio, "vi", cancellation_id="owned-token") == []
    assert calls[0][0] == "http://studio/api/audio/import"
    assert calls[0][1]["data"]["progress_id"] == "owned-token"
    assert recognizer.cancel_request("owned-token") is True
    assert calls[1][0] == "http://studio/api/audio/import/owned-token/cancel"


def test_generation_stop_cancels_project_owned_single_request_without_output(tmp_path):
    engine = BlockingEngine(cancelable=True)
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, engine)
    errors: list[Exception] = []

    def generate() -> None:
        try:
            speaker.generator.generate(project.id, an.id, VoiceGenerateRequest(text="đang chạy"))
        except Exception as exc:
            errors.append(exc)

    thread = threading.Thread(target=generate, daemon=True)
    thread.start()
    assert engine.entered.wait(timeout=2)

    assert speaker.generator.stop(project.id) is True
    thread.join(timeout=5)

    assert not thread.is_alive() and errors
    assert isinstance(errors[0], VoiceGenerationCancelled)
    assert outputs.list(project.id) == [] and lease.holder() is None


def test_script_stop_during_planning_is_retained_until_start_returns(tmp_path, monkeypatch):
    engine = FakeEngine()
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, engine)
    entered = threading.Event()
    release = threading.Event()
    original_plan = speaker._plan

    def blocking_plan(project_id, request):
        entered.set()
        release.wait(timeout=5)
        return original_plan(project_id, request)

    monkeypatch.setattr(speaker, "_plan", blocking_plan)
    started: list = []
    thread = threading.Thread(
        target=lambda: started.append(speaker.start(project.id, VoiceScriptRequest(rows=[
            VoiceScriptRow(id="r1", voice_id=an.id, text="chào"),
        ]))),
        daemon=True,
    )
    thread.start()
    assert entered.wait(timeout=2)

    queued = speaker.stop(project.id)
    cancelled = speaker.stop(project.id, include_active=True)
    assert queued is not None and queued.status == "stopped"
    assert cancelled is not None and cancelled.status == "cancelled"
    release.set()
    thread.join(timeout=5)

    assert not thread.is_alive() and started[0].status == "cancelled"
    assert outputs.list(project.id) == [] and lease.holder() is None


def test_reserved_script_stop_before_thread_dispatch_skips_planning(tmp_path, monkeypatch):
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, FakeEngine())
    request = VoiceScriptRequest(rows=[VoiceScriptRow(id="r1", voice_id=an.id, text="không đọc")])
    reservation = speaker.reserve(project.id, request)
    stopped = speaker.stop(project.id)
    assert stopped is not None and stopped.status == "stopped"

    def unexpected_plan(*_args):
        raise AssertionError("reserved stopped job must not plan")

    monkeypatch.setattr(speaker, "_plan", unexpected_plan)
    result = speaker.start(project.id, request, reserved_job_id=reservation)

    assert result.status == "stopped"
    assert outputs.list(project.id) == [] and lease.holder() is None


def test_single_generation_stop_during_voice_preparation_raises_cancelled(tmp_path, monkeypatch):
    engine = FakeEngine()
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, engine)
    entered = threading.Event()
    release = threading.Event()
    original_prepare = speaker.generator.prepare

    def blocking_prepare(*args, **kwargs):
        entered.set()
        release.wait(timeout=5)
        return original_prepare(*args, **kwargs)

    monkeypatch.setattr(speaker.generator, "prepare", blocking_prepare)
    errors: list[Exception] = []

    def generate() -> None:
        try:
            speaker.generator.generate(project.id, an.id, VoiceGenerateRequest(text="chào"))
        except Exception as exc:
            errors.append(exc)

    thread = threading.Thread(target=generate, daemon=True)
    thread.start()
    assert entered.wait(timeout=2)
    assert speaker.generator.stop(project.id) is True
    release.set()
    thread.join(timeout=5)

    assert not thread.is_alive() and len(errors) == 1
    assert isinstance(errors[0], VoiceGenerationCancelled)
    assert outputs.list(project.id) == [] and lease.holder() is None


def test_reserved_generation_stop_before_thread_dispatch_skips_preparation(tmp_path, monkeypatch):
    project, an, _binh, outputs, lease, speaker, _ = speaker_fixture(tmp_path, FakeEngine())
    reservation = speaker.generator.reserve(project.id)
    assert speaker.generator.stop(project.id) is True

    def unexpected_prepare(*_args, **_kwargs):
        raise AssertionError("reserved stopped generation must not prepare")

    monkeypatch.setattr(speaker.generator, "prepare", unexpected_prepare)
    with pytest.raises(VoiceGenerationCancelled):
        speaker.generator.generate(
            project.id, an.id, VoiceGenerateRequest(text="không tạo"), cancellation_id=reservation,
        )

    assert outputs.list(project.id) == [] and lease.holder() is None


def test_long_silence_around_measured_speech_is_cut_and_the_words_follow():
    frames = b"\x00\x00" * (SAMPLE_RATE * 5)
    words = [
        {"text": "được", "start": 3.1, "end": 3.4, "timingTrusted": True},
        {"text": "không", "start": 3.4, "end": 3.9, "timingTrusted": True},
    ]

    trimmed, shifted, head, tail = trim_to_words(frames, words)

    assert (head, tail) == (2.9, 0.8)
    assert len(trimmed) // 2 == int(1.3 * SAMPLE_RATE)
    assert [(word["start"], word["end"]) for word in shifted] == [(0.2, 0.5), (0.5, 1.0)]


def test_an_estimated_edge_is_never_cut_at():
    frames = b"\x00\x00" * (SAMPLE_RATE * 5)
    words = [{"text": "à", "start": 3.1, "end": 3.4, "timingTrusted": False}]

    trimmed, shifted, head, tail = trim_to_words(frames, words)

    assert head == 0.0 and shifted[0]["start"] == 3.1


def test_float_or_stereo_audio_becomes_mono_pcm_at_the_output_rate(tmp_path):
    source = tmp_path / "stereo.wav"
    with wave.open(str(source), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(48000)
        handle.writeframes(b"\x00\x10\x00\x10" * 48000)

    frames = read_pcm(source)

    assert len(frames) // 2 == SAMPLE_RATE
