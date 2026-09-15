from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path

import pytest

from app.adapters.file_asr_adapters import FileAsrAdapters
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_project_voices import FileProjectVoices
from app.adapters.file_training_catalog import FileTrainingCatalog
from app.adapters.file_training_runs import FileTrainingRuns
from app.adapters.gpu_lease import GpuLease
from app.adapters.hf_trainer_log_parser import parse_hf_trainer_line
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.omnivoice_generator import SpeechRequest, VibeVoiceSpeech
from app.adapters.training_process import TrainingProcess
from app.adapters.training_runner import TrainingNotReady, TrainingRunner
from app.adapters.vibevoice_asr_transcriber import segments_to_item
from app.adapters.vibevoice_training import (
    VibeVoicePaths,
    export_asr_dataset,
    export_tts_jsonl,
    tts_command,
    write_processor_dir,
)
from app.domain.models import (
    DatasetManifest,
    DatasetSegment,
    MediaAssetCreate,
    ProjectCreate,
    ProjectVoice,
    SpeakerProfile,
    TrainingCatalog,
    TrainingRunConfig,
    TrainingRuntimeReport,
)


def segment(segment_id, start, end, split="train", **overrides):
    values = dict(id=segment_id, asset_id="asset-1", audio_path="assets/media/asset-1/analysis.wav", start=start, end=end,
                  text=f"câu {segment_id}", speaker_profile_id="speaker-an", split=split)
    values.update(overrides)
    return DatasetSegment(**values)


def copy_slicer(source: Path, destination: Path, start: float, end: float) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(b"RIFF" + source.name.encode())


def vibevoice_tree(root: Path) -> VibeVoicePaths:
    paths = VibeVoicePaths(root)
    for folder in (paths.community / "vibevoice", paths.microsoft / "finetuning-asr", paths.models / "Qwen" / "Qwen2.5-1.5B", paths.models / "Qwen" / "Qwen2.5-7B", paths.models / "microsoft" / "VibeVoice-ASR"):
        folder.mkdir(parents=True, exist_ok=True)
    model = paths.models / "microsoft" / "VibeVoice-1.5B"
    model.mkdir(parents=True)
    (model / "preprocessor_config.json").write_text(json.dumps({"speech_tok_compress_ratio": 3200, "language_model_pretrained_name": "Qwen/Qwen2.5-1.5B"}), encoding="utf-8")
    return paths


# ---------------------------------------------------------------- log parser


def test_trainer_dicts_and_the_training_bar_become_progress():
    logged = parse_hf_trainer_line("{'loss': 1.9321, 'grad_norm': 0.8, 'learning_rate': 2.5e-05, 'epoch': 0.4}")
    evaluated = parse_hf_trainer_line("{'eval_loss': 2.1, 'epoch': 1.0}")
    bar = parse_hf_trainer_line(" 37%|███▋      | 37/100 [01:02<01:46,  1.69s/it]")

    assert logged.loss == pytest.approx(1.9321) and logged.learning_rate == pytest.approx(2.5e-05)
    assert evaluated.dev_loss == pytest.approx(2.1)
    assert (bar.global_step, bar.total) == (37, 100)
    assert bar.steps_per_second == pytest.approx(1 / 1.69)


def test_dataset_and_loading_bars_are_not_training_steps():
    assert parse_hf_trainer_line("Map: 100%|██████████| 58/58 [00:00<00:00, 812.30 examples/s]") is None
    assert parse_hf_trainer_line("Loading checkpoint shards: 67%|██████▋ | 2/3 [00:03<00:01,  1.52s/it]") is None
    assert parse_hf_trainer_line("trainable params: 12,345 || all params: 1,000,000 || trainable%: 1.23").step_id == "load-model"
    assert parse_hf_trainer_line("some other line") is None


# ---------------------------------------------------------------- exports and commands


def test_tts_rows_speak_as_speaker_one_with_the_reference_as_prompt(tmp_path):
    project = tmp_path / "project"
    (project / "assets/media/asset-1").mkdir(parents=True)
    (project / "assets/media/asset-1/analysis.wav").write_bytes(b"RIFF")
    prompt = tmp_path / "prompt.wav"
    prompt.write_bytes(b"RIFF")

    train, dev, counts = export_tts_jsonl([segment("a", 0, 4), segment("b", 4, 8, split="dev")], project, tmp_path / "data", copy_slicer, prompt)

    row = json.loads(train.read_text(encoding="utf-8").splitlines()[0])
    assert row["text"] == "Speaker 1: câu a"
    assert Path(row["audio"]).is_file() and row["voice_prompts"] == [str(prompt.resolve())]
    assert (counts.train, counts.dev) == (1, 1)
    assert json.loads(dev.read_text(encoding="utf-8"))["text"] == "Speaker 1: câu b"


def test_asr_labels_follow_the_layout_lora_finetune_globs(tmp_path):
    project = tmp_path / "project"
    (project / "assets/media/asset-1").mkdir(parents=True)
    (project / "assets/media/asset-1/analysis.wav").write_bytes(b"RIFF")

    folder, count = export_asr_dataset([segment("a", 1, 5.5), segment("dev", 5, 8, split="dev")], project, tmp_path / "data", copy_slicer)

    label = json.loads((folder / "a.json").read_text(encoding="utf-8"))
    assert count == 1 and not (folder / "dev.json").exists()
    assert label == {"audio_duration": 4.5, "audio_path": "a.wav", "segments": [{"speaker": 0, "text": "câu a", "start": 0.0, "end": 4.5}]}
    assert (folder / "a.wav").is_file()


def test_the_tts_command_passes_descriptor_values_under_the_trainers_own_names(tmp_path):
    paths = vibevoice_tree(tmp_path / "VibeVoice")
    command = tts_command(paths, tmp_path / "model", tmp_path / "processor", tmp_path / "train.jsonl", None, tmp_path / "out",
                          {"lora_r": 8, "bf16": True, "gradient_checkpointing": False, "max_length": None})

    assert command[1:3] == ["-m", "vibevoice.finetune.train_vibevoice"]
    joined = " ".join(command)
    assert "--lora_r 8" in joined and "--bf16 True" in joined and "--gradient_checkpointing False" in joined
    assert "--max_length" not in joined and "--validation_jsonl" not in joined
    assert "--report_to none" in joined


def test_local_weights_and_tokenizer_are_found_by_hub_id_and_named_offline(tmp_path):
    paths = vibevoice_tree(tmp_path / "VibeVoice")
    model = paths.resolve_model("microsoft/VibeVoice-1.5B")
    tokenizer = paths.tokenizer_for(model, "Qwen/Qwen2.5-7B")
    processor = write_processor_dir(model, tokenizer, tmp_path / "processor")

    assert tokenizer == paths.models / "Qwen" / "Qwen2.5-1.5B"
    assert json.loads((processor / "preprocessor_config.json").read_text())["language_model_pretrained_name"] == str(tokenizer)
    with pytest.raises(FileNotFoundError, match="VibeVoice-Large"):
        paths.resolve_model("microsoft/VibeVoice-Large")
    assert paths.environment(paths.community)["PYTHONPATH"] == str(paths.community)


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


class FakeVibeRuntime:
    def __init__(self, missing=None):
        self.value = missing or []

    def missing(self, packages, repository):
        return self.value


def vibe_fixture(tmp_path, monkeypatch, *, runtime=None, output=None, lines=()):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Vibe", location=str(tmp_path / "projects")))
    audio = Path(project.project_path) / "assets" / "media" / "asset-1" / "analysis.wav"
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"RIFF")
    catalogs = FileTrainingCatalog(projects)
    catalogs.save(project.id, TrainingCatalog(speakers=[SpeakerProfile(id="speaker-an", name="An", language_id="en")]))
    manifest = DatasetManifest(id="dataset-1", segments=[segment("a", 0, 8), segment("b", 8, 12, split="dev")])
    manifest_path = Path(project.project_path) / "assets" / "training" / "datasets" / "dataset-1.json"
    manifest_path.parent.mkdir(parents=True)
    manifest_path.write_text(manifest.model_dump_json(), encoding="utf-8")
    runs = FileTrainingRuns(projects)
    voices = FileProjectVoices(projects, copy_slicer)
    adapters = FileAsrAdapters(projects)
    paths = vibevoice_tree(tmp_path / "VibeVoice")
    runner = TrainingRunner(
        projects, StoredManifest(manifest), catalogs, runs, ReadyRuntime(), GpuLease(tmp_path / "gpu.json"), tmp_path / "engine",  # type: ignore[arg-type]
        voices=voices, vibevoice_paths=paths, vibevoice_runtime=runtime or FakeVibeRuntime(), asr_adapters=adapters,
    )
    monkeypatch.setattr(runner.exporter, "_slice", copy_slicer)
    seen: dict[str, object] = {}

    def fake_run(process, command, parse, cwd=None, env=None):
        seen.update(command=command, cwd=cwd, env=env)
        for raw in lines:
            parsed = parse(raw)
            if parsed is not None:
                process.on_progress(parsed)
        output(command)
        return 0

    monkeypatch.setattr(TrainingProcess, "run", fake_run)
    return project, runs, voices, adapters, runner, seen


def run_batch(runner, runs, project, config):
    done = threading.Event()
    original = runner._execute_vibevoice

    def execute(run):
        original(run)
        done.set()

    runner._execute_vibevoice = execute  # type: ignore[method-assign]
    runner.start(project.id, "dataset-1", config, speaker_profile_ids=["speaker-an"])
    assert done.wait(timeout=10)
    return runs.list(project.id)[0]


def test_a_vibevoice_tts_lora_run_trains_and_publishes_a_vibevoice_voice(tmp_path, monkeypatch):
    def output(command):
        out = Path(command[command.index("--output_dir") + 1])
        (out / "lora").mkdir(parents=True)
        (out / "lora" / "adapter_config.json").write_text("{}", encoding="utf-8")

    project, runs, voices, _adapters, runner, seen = vibe_fixture(
        tmp_path, monkeypatch, output=output,
        lines=[" 50%|█████     | 5/10 [00:05<00:05,  1.00it/s]", "{'loss': 2.5, 'learning_rate': 2.5e-05, 'epoch': 0.5}"],
    )
    config = TrainingRunConfig(model_id="vibevoice-1.5b-tts-lora", engine="vibevoice", mode="tts-lora", base_model="microsoft/VibeVoice-1.5B",
                               parameters={"model_name_or_path": "microsoft/VibeVoice-1.5B", "lora_r": 8, "bf16": True})

    run = run_batch(runner, runs, project, config)

    assert run.status == "complete", run.error
    assert run.config.steps == 10
    assert seen["cwd"].name == "VibeVoice-community"
    assert seen["env"]["HF_HUB_OFFLINE"] == "1"
    train = Path(seen["command"][seen["command"].index("--train_jsonl") + 1])
    assert json.loads(train.read_text(encoding="utf-8").splitlines()[0])["text"].startswith("Speaker 1: ")
    voice = voices.list(project.id)[0]
    assert (voice.engine, voice.kind, voice.base_model) == ("vibevoice", "lora", "microsoft/VibeVoice-1.5B")
    assert voice.adapter_path.endswith(f"{run.id}/checkpoints")
    assert any("loss" in line.message or line.loss for line in runs.progress(project.id, run.id))


def test_a_vibevoice_asr_lora_run_adds_a_speech_to_text_adapter(tmp_path, monkeypatch):
    def output(command):
        out = Path(command[command.index("--output_dir") + 1])
        out.mkdir(parents=True, exist_ok=True)
        (out / "adapter_config.json").write_text("{}", encoding="utf-8")

    project, runs, voices, adapters, runner, seen = vibe_fixture(tmp_path, monkeypatch, output=output)
    config = TrainingRunConfig(model_id="vibevoice-asr-lora", engine="vibevoice", mode="asr-lora", parameters={"model_path": "microsoft/VibeVoice-ASR", "lora_r": 16})

    run = run_batch(runner, runs, project, config)

    assert run.status == "complete", run.error
    assert seen["command"][1].endswith("vibevoice_asr_lora_train.py")
    assert seen["env"]["PRO4BRO_ASR_TOKENIZER"].endswith("Qwen2.5-7B")
    assert Path(seen["command"][seen["command"].index("--data_dir") + 1]).joinpath("a.json").is_file()
    adapter = adapters.list(project.id)[0]
    assert adapter.base_model == "microsoft/VibeVoice-ASR" and adapter.speaker_profile_id == "speaker-an"
    assert adapters.weights(project.id, adapter.id).joinpath("adapter_config.json").is_file()
    assert voices.list(project.id) == []


def test_vibevoice_training_is_refused_until_its_python_has_the_packages(tmp_path, monkeypatch):
    project, runs, _voices, _adapters, runner, _seen = vibe_fixture(tmp_path, monkeypatch, runtime=FakeVibeRuntime(["peft", "datasets"]), output=lambda command: None)

    with pytest.raises(TrainingNotReady, match="peft, datasets"):
        runner.start(project.id, "dataset-1", TrainingRunConfig(engine="vibevoice", mode="tts-lora"), speaker_profile_ids=["speaker-an"])
    with pytest.raises(ValueError, match="chưa được runner"):
        runner.start(project.id, "dataset-1", TrainingRunConfig(engine="vibevoice", mode="full-finetune"), speaker_profile_ids=["speaker-an"])
    assert runs.list(project.id) == []


def test_omnivoice_full_finetune_uses_its_own_recipe_and_from_scratch_is_refused(tmp_path):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="Omni"))
    runs = FileTrainingRuns(projects)
    engine = tmp_path / "engine"
    (engine / "examples" / "config").mkdir(parents=True)
    for name, body in {
        "train_config_finetune_lora.json": {"use_lora": True},
        "train_config_finetune_sdpa.json": {"learning_rate": 1e-5, "init_from_checkpoint": "k2-fsa/OmniVoice"},
    }.items():
        (engine / "examples" / "config" / name).write_text(json.dumps(body), encoding="utf-8")
    runner = TrainingRunner(projects, StoredManifest(DatasetManifest(id="d")), FileTrainingCatalog(projects), runs, ReadyRuntime(), GpuLease(tmp_path / "gpu.json"), engine)  # type: ignore[arg-type]

    def written(config):
        run = runs.create(project.id, "d", config=config)
        run_dir = runs.run_dir(project.id, run.id)
        return json.loads(runner._write_train_config(run, run_dir).read_text(encoding="utf-8"))

    full = written(TrainingRunConfig(mode="full-finetune", use_lora=False, learning_rate=1e-5))

    assert full["use_lora"] is False and full["init_from_checkpoint"] == "k2-fsa/OmniVoice"
    with pytest.raises(ValueError, match="chưa được runner"):
        runner.start(project.id, "d", TrainingRunConfig(mode="from-scratch", use_lora=False), speaker_profile_ids=["speaker-an"])


# ---------------------------------------------------------------- generation and STT


def test_a_vibevoice_voice_is_spoken_with_its_local_model_processor_and_adapter(tmp_path):
    paths = vibevoice_tree(tmp_path / "VibeVoice")
    speech = VibeVoiceSpeech(worker=None, paths=paths, processor_cache=tmp_path / "processors")  # type: ignore[arg-type]
    voice = ProjectVoice(name="An · VibeVoice LoRA", speaker_profile_id="speaker-an", engine="vibevoice", kind="lora",
                         base_model="microsoft/VibeVoice-1.5B", reference_audio="r.wav", reference_text="hello")

    payload = speech.payload(SpeechRequest(voice=voice, reference=tmp_path / "r.wav", adapter=tmp_path / "adapter", model_dir=None, text="Hello there",
                                           generation={"cfg_scale": 1.5, "ddpm_steps": 20}, language="en", speed=None, duration=None, output=tmp_path / "o.wav"))

    assert payload["model"].endswith("VibeVoice-1.5B") and payload["lora_adapter"].endswith("adapter")
    assert json.loads((Path(payload["processor"]) / "preprocessor_config.json").read_text())["language_model_pretrained_name"].endswith("Qwen2.5-1.5B")
    assert (payload["cfg_scale"], payload["ddpm_steps"]) == (1.5, 20)


def test_a_project_adapter_choice_reaches_the_engine_with_its_project(tmp_path, monkeypatch):
    projects = FileProjectRepository(tmp_path / "registry")
    project = projects.create(ProjectCreate(name="ASR"))
    media = FileMediaLibrary(projects)
    analysis = Path(project.project_path) / "assets" / "media" / "asset-1" / "analysis.wav"
    analysis.parent.mkdir(parents=True)
    analysis.write_bytes(b"wav")
    asset = media.create(project.id, MediaAssetCreate(name="a.wav", source_extension=".wav", media_kind="audio", source_path="assets/media/asset-1/analysis.wav",
                                                      analysis_path="assets/media/asset-1/analysis.wav", origin="import", duration=4.0), "asset-1")
    calls = []

    def engine(path, duration, variant=None, project_id=None):
        calls.append((variant, project_id))
        return segments_to_item([{"start_time": 0, "end_time": 2, "speaker_id": 0, "text": "xin chào"}], duration)

    processor = MediaImportProcessor("http://studio", media, "ffmpeg", other_stt={"vibevoice-asr": engine})
    monkeypatch.setattr(processor, "_audio_duration", lambda _path: 4.0)

    asyncio.run(processor.transcribe_existing(project, asset, model="vibevoice-asr@asr-abc"))

    assert calls == [("asr-abc", project.id)]
