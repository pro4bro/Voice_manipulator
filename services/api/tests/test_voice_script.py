from __future__ import annotations

import wave
from pathlib import Path

import pytest

from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_voice_outputs import FileVoiceOutputs
from app.adapters.gpu_lease import GpuBusy, GpuLease
from app.adapters.omnivoice_generator import VoiceGenerator
from app.adapters.training_model_catalog import FileTrainingModelCatalog
from app.adapters.voice_script_speaker import SAMPLE_RATE, VoiceScriptSpeaker, read_pcm, trim_to_words
from app.domain.models import DatasetSegment, ProjectCreate, VoiceScriptRequest, VoiceScriptRow
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


def write_tone(path: Path, seconds: float, rate: int = SAMPLE_RATE) -> None:
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"\x10\x00" * int(seconds * rate))


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


CLIP_TEXT: list[str] = []


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
