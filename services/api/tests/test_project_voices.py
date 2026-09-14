from __future__ import annotations

import json
import sys
import textwrap
import threading
from pathlib import Path

import pytest

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.gpu_lease import GpuBusy, GpuLease
from app.adapters.engine_worker import REPLY_PREFIX, EngineWorkerError, EngineWorkerProcess
from app.adapters.omnivoice_generator import VoiceGenerationError, VoiceGenerator
from app.adapters.training_model_catalog import FileTrainingModelCatalog
from app.adapters.training_runner import TrainingRunner
from app.domain.models import (
    DatasetManifest,
    DatasetSegment,
    ProjectCreate,
    SpeakerProfile,
    TrainingCatalog,
    TrainingRunConfig,
    TrainingRuntimeReport,
    VoiceGenerateRequest,
)
from app.domain.voice_reference import NoReferenceSegment, choose_reference
from app.settings import Settings
from app.workers import omnivoice_worker, vibevoice_asr_worker

SETTINGS = Settings.from_env()


def segment(segment_id, start, end, **overrides):
    values = dict(id=segment_id, asset_id="asset-1", audio_path="assets/media/asset-1/analysis.wav",
                  start=start, end=end, text=f"câu {segment_id}", speaker_profile_id="speaker-an")
    values.update(overrides)
    return DatasetSegment(**values)


def copy_slicer(source: Path, destination: Path, start: float, end: float) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(source.read_bytes())


# ---------------------------------------------------------------- reference


def test_the_reference_is_a_whole_segment_inside_the_window_closest_to_eight_seconds():
    chosen = choose_reference([segment("short", 0, 2), segment("long", 0, 14), segment("five", 0, 5), segment("nine", 0, 9)])

    assert chosen.id == "nine"


def test_a_script_read_or_guided_clip_wins_over_plain_stt():
    chosen = choose_reference([
        segment("stt", 0, 8),
        segment("guided", 0, 5, capture_tier="guided", text_provenance="script"),
    ])

    assert chosen.id == "guided"


def test_no_segment_in_the_window_says_how_long_the_longest_was():
    with pytest.raises(NoReferenceSegment, match="dài nhất 2.0 giây"):
        choose_reference([segment("a", 0, 1.5), segment("b", 0, 2)])


# ---------------------------------------------------------------- voices


def project_with_audio(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Voices", location=str(tmp_path / "projects")))
    audio = Path(project.project_path) / "assets" / "media" / "asset-1" / "analysis.wav"
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"RIFF-fake-wave")
    return projects, project


def test_a_published_voice_keeps_project_relative_paths(tmp_path):
    projects, project = project_with_audio(tmp_path)
    voices = FileProjectVoices(projects, copy_slicer)

    voice = voices.publish(project.id, name="An · nhái giọng", speaker_profile_id="speaker-an", kind="clone",
                           reference=segment("nine", 1, 10), language="vi", source_run_id="run-1")

    assert voice.reference_audio == f"assets/voices/{voice.id}/reference.wav"
    assert voices.absolute(project.id, voice.reference_audio).is_file()
    assert voice.reference_text == "câu nine" and voice.reference_seconds == 9
    assert voices.list(project.id) == [voice]
    record = (Path(project.project_path) / "assets" / "voices" / voice.id / "voice.json").read_text(encoding="utf-8")
    assert str(tmp_path) not in record


# ---------------------------------------------------------------- runner


class ReadyRuntime:
    python = Path("python.exe")

    def report(self):
        return TrainingRuntimeReport(root="runtime", ready=True)


class StoredManifest:
    def __init__(self, manifest):
        self.manifest = manifest

    def load(self, _project_id, _manifest_id):
        return self.manifest


def test_zero_shot_clone_publishes_one_voice_per_target_without_the_gpu(tmp_path):
    projects, project = project_with_audio(tmp_path)
    catalogs = FileTrainingCatalog(projects)
    catalogs.save(project.id, TrainingCatalog(speakers=[
        SpeakerProfile(id="speaker-an", name="An", language_id="vi"),
        SpeakerProfile(id="speaker-binh", name="Bình", language_id="vi"),
    ]))
    manifest = DatasetManifest(id="dataset-1", segments=[
        segment("an-train", 0, 8), segment("an-dev", 8, 12, split="dev"),
        segment("binh-train", 0, 6, speaker_profile_id="speaker-binh"),
        segment("binh-dev", 6, 9, speaker_profile_id="speaker-binh", split="dev"),
    ])
    manifest_path = Path(project.project_path) / "assets" / "training" / "datasets" / "dataset-1.json"
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_text(manifest.model_dump_json(), encoding="utf-8")
    runs = FileTrainingRuns(projects)
    lease = GpuLease(tmp_path / "gpu.json")
    holder = lease.acquire("someone-else")  # clone must not need it
    voices = FileProjectVoices(projects, copy_slicer)
    runner = TrainingRunner(projects, StoredManifest(manifest), catalogs, runs, ReadyRuntime(), lease, tmp_path / "engine", voices=voices)  # type: ignore[arg-type]
    done = threading.Event()
    original = runner._build_clone_voice

    def build(run):
        original(run)
        if run.batch_index == run.batch_size - 1:
            done.set()

    runner._build_clone_voice = build  # type: ignore[method-assign]

    runner.start(project.id, "dataset-1", TrainingRunConfig(model_id="omnivoice-zero-shot-clone", mode="zero-shot-clone"),
                 speaker_profile_ids=["speaker-an", "speaker-binh"])

    assert done.wait(timeout=5)
    assert {run.status for run in runs.list(project.id)} == {"complete"}
    published = {voice.speaker_profile_id: voice for voice in voices.list(project.id)}
    assert set(published) == {"speaker-an", "speaker-binh"}
    assert published["speaker-an"].reference_segment_id == "an-train"
    assert published["speaker-an"].kind == "clone" and published["speaker-an"].language == "vi"
    lease.release(holder.token)


# ---------------------------------------------------------------- worker protocol


FAKE_WORKER = textwrap.dedent(f"""
    import json, sys
    PREFIX = {REPLY_PREFIX!r}
    print("library chatter that is not a reply")
    print(PREFIX + json.dumps({{"ready": True}}), flush=True)
    for raw in sys.stdin:
        request = json.loads(raw)
        if request.get("command") == "shutdown":
            print(PREFIX + json.dumps({{"id": request["id"], "ok": True}}), flush=True)
            break
        if request["text"] == "boom":
            print(PREFIX + json.dumps({{"id": request["id"], "ok": False, "error": "RuntimeError: boom"}}), flush=True)
            continue
        print("Loading weights: 50%", flush=True)
        open(request["output"], "wb").write(b"RIFF-generated")
        print(PREFIX + json.dumps({{"id": request["id"], "ok": True, "output": request["output"], "seconds": 1.5}}), flush=True)
""")


def fake_worker(tmp_path):
    script = tmp_path / "fake_worker.py"
    script.write_text(FAKE_WORKER, encoding="utf-8")
    return EngineWorkerProcess(Path(sys.executable), script, idle_seconds=0, request_timeout=20)


def test_the_worker_protocol_ignores_chatter_and_survives_a_failed_request(tmp_path):
    worker = fake_worker(tmp_path)
    try:
        failed = worker.request({"text": "boom", "output": str(tmp_path / "x.wav")})
        worked = worker.request({"text": "xin chào", "output": str(tmp_path / "out.wav")})
    finally:
        worker.shutdown()

    assert failed["ok"] is False and "boom" in failed["error"]
    assert worked["ok"] is True and (tmp_path / "out.wav").read_bytes() == b"RIFF-generated"
    assert not worker.running


def test_every_worker_script_uses_the_reply_prefix_the_api_reads():
    assert omnivoice_worker.REPLY_PREFIX == vibevoice_asr_worker.REPLY_PREFIX == REPLY_PREFIX


def test_a_missing_runtime_python_is_a_worker_error(tmp_path):
    worker = EngineWorkerProcess(tmp_path / "missing" / "python.exe", tmp_path / "worker.py", idle_seconds=0)

    with pytest.raises(EngineWorkerError, match="Không thấy Python"):
        worker.request({"text": "x"})


# ---------------------------------------------------------------- generator


def generator_fixture(tmp_path, worker):
    projects, project = project_with_audio(tmp_path)
    voices = FileProjectVoices(projects, copy_slicer)
    voice = voices.publish(project.id, name="An · nhái giọng", speaker_profile_id="speaker-an", kind="clone",
                           reference=segment("nine", 1, 10), language="vi")
    engine = tmp_path / "engine" / "omnivoice" / "cli"
    engine.mkdir(parents=True)
    (engine / "infer.py").write_text("", encoding="utf-8")
    generators = FileTrainingModelCatalog(SETTINGS.voice_generators_root, {"omnivoice": tmp_path / "engine"})
    media = FileMediaLibrary(projects)
    lease = GpuLease(tmp_path / "gpu.json")
    return project, voice, media, lease, VoiceGenerator(projects, voices, media, worker, lease, generators)


def test_generated_speech_lands_in_media_pool_with_its_voice(tmp_path):
    worker = fake_worker(tmp_path)
    project, voice, media, lease, generator = generator_fixture(tmp_path, worker)
    try:
        asset = generator.generate(project.id, voice.id, VoiceGenerateRequest(text="Xin chào mọi người", parameters={"num_step": 16}))
    finally:
        worker.shutdown()

    assert asset.origin == "generate"
    assert asset.speaker_profile_ids == ["speaker-an"]
    assert asset.text == "Xin chào mọi người"
    assert (Path(project.project_path) / asset.analysis_path).read_bytes() == b"RIFF-generated"
    assert media.get(project.id, asset.id).duration == 1.5
    assert lease.holder() is None


def test_generation_refuses_unknown_parameters_and_a_busy_gpu(tmp_path):
    class NeverCalled:
        def request(self, payload):
            raise AssertionError("the worker must not run")

    project, voice, _media, lease, generator = generator_fixture(tmp_path, NeverCalled())

    with pytest.raises(ValueError, match="không có tham số"):
        generator.generate(project.id, voice.id, VoiceGenerateRequest(text="x", parameters={"steps": 3}))
    holder = lease.acquire("training:run-1")
    with pytest.raises(GpuBusy):
        generator.generate(project.id, voice.id, VoiceGenerateRequest(text="x"))
    lease.release(holder.token)
    assert not list((Path(project.project_path) / "assets" / "media").glob("asset-*/source.wav"))


def test_a_failed_generation_leaves_no_half_made_asset(tmp_path):
    worker = fake_worker(tmp_path)
    project, voice, media, _lease, generator = generator_fixture(tmp_path, worker)
    try:
        with pytest.raises(VoiceGenerationError, match="boom"):
            generator.generate(project.id, voice.id, VoiceGenerateRequest(text="boom"))
    finally:
        worker.shutdown()

    assert [path.name for path in (Path(project.project_path) / "assets" / "media").iterdir()] == ["asset-1"]


# ---------------------------------------------------------------- descriptor values


@pytest.mark.skipif(not (SETTINGS.omnivoice_root / "omnivoice" / "models" / "omnivoice.py").is_file(), reason="OmniVoice checkout absent")
def test_generation_defaults_match_omnivoice_generation_config():
    import ast

    tree = ast.parse((SETTINGS.omnivoice_root / "omnivoice" / "models" / "omnivoice.py").read_text(encoding="utf-8"))
    config = next(node for node in ast.walk(tree) if isinstance(node, ast.ClassDef) and node.name == "OmniVoiceGenerationConfig")
    defaults = {item.target.id: ast.literal_eval(item.value) for item in config.body if isinstance(item, ast.AnnAssign) and item.value is not None}
    descriptor = json.loads((SETTINGS.voice_generators_root / "omnivoice-generate.json").read_text(encoding="utf-8"))

    checked = 0
    for spec in descriptor["parameters"]:
        if spec["key"] in defaults:
            assert spec["codeDefault"] == defaults[spec["key"]], spec["key"]
            assert spec["default"] == defaults[spec["key"]], spec["key"]
            checked += 1
    assert checked >= 8
