from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.adapters.training_model_catalog import (
    FileTrainingModelCatalog,
    TrainingModelUnavailable,
)
from app.domain.models import TrainingModelDescriptor, TrainingRunConfig
RESOURCES = Path(__file__).resolve().parents[1] / "app" / "resources"
TRAINING = RESOURCES / "training-models"
GENERATORS = RESOURCES / "voice-generators"
ENGINES = {
    "f5-tts": {
        "clone": "f5-tts-zero-shot-clone",
        "train": "f5-tts-finetune",
        "generator": "f5-tts-generate",
        "root": "f5-tts",
        "entrypoint": "src/f5_tts/api.py",
    },
    "vivoice": {
        "clone": "vivoice-zero-shot-clone",
        "train": "vivoice-finetune",
        "generator": "vivoice-generate",
        "root": "f5-tts",
        "entrypoint": "src/f5_tts/api.py",
    },
    "indextts25": {
        "clone": "indextts25-zero-shot-clone",
        "train": "indextts25-finetune",
        "generator": "indextts25-generate",
        "root": "indextts25",
        "entrypoint": "indextts/infer_v2_5.py",
    },
    "fish-s2-pro": {
        "clone": "fish-s2-pro-zero-shot-clone",
        "train": "fish-s2-pro-finetune",
        "generator": "fish-s2-pro-generate",
        "root": "fish-s2-pro",
        "entrypoint": "fish_speech/inference_engine/__init__.py",
    },
}


def read_descriptor(folder: Path, descriptor_id: str) -> dict:
    return json.loads((folder / f"{descriptor_id}.json").read_text(encoding="utf-8"))


def parameters(descriptor: dict) -> dict[str, dict]:
    return {spec["key"]: spec for spec in descriptor["parameters"]}


def test_each_engine_has_a_valid_clone_training_and_generation_descriptor():
    training_ids = {path.stem for path in TRAINING.glob("*.json")}
    generator_ids = {path.stem for path in GENERATORS.glob("*.json")}
    for engine, expected in ENGINES.items():
        clone = read_descriptor(TRAINING, expected["clone"])
        training = read_descriptor(TRAINING, expected["train"])
        generator = read_descriptor(GENERATORS, expected["generator"])

        assert expected["clone"] in training_ids
        assert expected["train"] in training_ids
        assert expected["generator"] in generator_ids
        assert TrainingModelDescriptor.model_validate(clone).engine == engine
        assert TrainingModelDescriptor.model_validate(training).engine == engine
        assert TrainingModelDescriptor.model_validate(generator).engine == engine
        assert clone["mode"] == "zero-shot-clone" and clone["category"] == "clone" and clone["runnable"]
        assert training["category"] == "train" and not training["runnable"]
        assert training["blockedReason"]
        assert generator["mode"] == "generate" and generator["runnable"] and generator["readinessRequired"]
        assert generator["tasks"] == ["voice-over", "voice-patch"]
        assert generator["capabilities"]["nativeDuration"] is False
        assert generator["capabilities"]["wordTiming"] == "none"
        assert clone["repository"]["root"] == expected["root"]
        assert clone["repository"]["entrypoint"] == expected["entrypoint"]


def test_reference_choices_and_duration_bounds_match_each_engine():
    expected_models = {
        "f5-tts-zero-shot-clone": "SWivid/F5-TTS",
        "vivoice-zero-shot-clone": "hynt/F5-TTS-Vietnamese-ViVoice",
        "indextts25-zero-shot-clone": "IndexTeam/IndexTTS-2.5",
        "fish-s2-pro-zero-shot-clone": "fishaudio/s2-pro",
    }
    for descriptor_id, model_id in expected_models.items():
        clone = read_descriptor(TRAINING, descriptor_id)
        specs = parameters(clone)
        assert specs["model_name_or_path"]["default"] == model_id
        assert specs["model_name_or_path"]["options"][0]["value"] == model_id
        assert specs["model_name_or_path"]["runField"] == "base_model"

    for descriptor_id in ("f5-tts-zero-shot-clone", "vivoice-zero-shot-clone", "indextts25-zero-shot-clone"):
        specs = parameters(read_descriptor(TRAINING, descriptor_id))
        assert specs["reference_min_seconds"]["min"] <= 3.0
        assert specs["reference_max_seconds"]["default"] == 10.0
        assert specs["reference_max_seconds"]["max"] == 15

    fish_specs = parameters(read_descriptor(TRAINING, "fish-s2-pro-zero-shot-clone"))
    assert fish_specs["reference_max_seconds"]["max"] == 30


def test_generator_parameters_only_expose_controls_for_that_engine():
    f5_expected = {
        "speed", "nfe_step", "cfg_strength", "sway_sampling_coef",
        "cross_fade_duration", "target_rms", "remove_silence", "seed",
    }
    for descriptor_id in ("f5-tts-generate", "vivoice-generate"):
        f5 = read_descriptor(GENERATORS, descriptor_id)
        specs = parameters(f5)
        assert set(specs) == f5_expected
        assert specs["nfe_step"]["default"] == 32
        assert specs["speed"]["min"] == 0.5 and specs["speed"]["max"] == 2

    index = read_descriptor(GENERATORS, "indextts25-generate")
    index_specs = parameters(index)
    assert set(index_specs) == {
        "language", "emotion_mode", "emo_alpha", "emo_text", "emo_happy", "emo_angry",
        "emo_sad", "emo_afraid", "emo_disgusted", "emo_melancholic", "emo_surprised",
        "emo_calm", "duration_factor", "use_random", "seed",
    }
    assert {option["value"] for option in index_specs["language"]["options"]} == {"EN", "ZH", "JA", "ES", "AR"}
    assert "speed" not in index_specs

    fish = read_descriptor(GENERATORS, "fish-s2-pro-generate")
    fish_specs = parameters(fish)
    assert set(fish_specs) == {
        "instruction", "temperature", "top_p", "max_new_tokens", "chunk_length", "seed",
    }
    assert "speed" not in fish_specs and "language" not in fish_specs and "repetition_penalty" not in fish_specs
    assert any("inline" in note.lower() for note in fish["notes"])


def test_f5_finetune_values_match_the_pinned_ui_and_cli_sources():
    expected_keys = {
        "exp_name", "learning_rate", "batch_size_per_gpu", "batch_size_type", "max_samples",
        "grad_accumulation_steps", "max_grad_norm", "epochs", "num_warmup_updates",
        "save_per_updates", "keep_last_n_checkpoints", "last_per_updates", "tokenizer_type",
        "tokenizer_file", "mixed_precision", "logger", "file_checkpoint_train", "finetune", "bnb_optimizer",
    }
    for descriptor_id in ("f5-tts-finetune", "vivoice-finetune"):
        training_specs = parameters(read_descriptor(TRAINING, descriptor_id))
        assert set(training_specs) == expected_keys
        assert training_specs["learning_rate"]["default"] == 1e-5
        assert training_specs["batch_size_per_gpu"]["default"] == 3200
        assert training_specs["num_warmup_updates"]["recipe"] == 100
        assert training_specs["num_warmup_updates"]["codeDefault"] == 20000
        assert training_specs["save_per_updates"]["recipe"] == 500
        assert training_specs["save_per_updates"]["codeDefault"] == 50000

    for descriptor_id in ("indextts25-finetune", "fish-s2-pro-finetune"):
        assert read_descriptor(TRAINING, descriptor_id)["parameters"] == []


def test_training_catalog_maps_clone_model_and_refuses_unknown_or_unimplemented_training(tmp_path):
    roots = {
        "omnivoice": tmp_path / "omnivoice",
        "vibevoice": tmp_path / "vibevoice",
        "vibevoice-models": tmp_path / "vibevoice-models",
        "f5-tts": tmp_path / "f5-tts",
        "indextts25": tmp_path / "indextts25",
        "fish-s2-pro": tmp_path / "fish-s2-pro",
        "hub": tmp_path / "hub",
    }
    for engine, expected in ENGINES.items():
        entrypoint = roots[expected["root"]] / expected["entrypoint"]
        entrypoint.parent.mkdir(parents=True, exist_ok=True)
        entrypoint.write_text("", encoding="utf-8")
        training_entry = read_descriptor(TRAINING, expected["train"])["repository"]["entrypoint"]
        training_path = roots[expected["root"]] / training_entry
        training_path.parent.mkdir(parents=True, exist_ok=True)
        training_path.write_text("", encoding="utf-8")

    models = FileTrainingModelCatalog(TRAINING, roots)
    options = {option.id: option for option in models.options()}
    for expected in ENGINES.values():
        assert options[expected["clone"]].available
        blocked = options[expected["train"]]
        assert blocked.installed
        assert not blocked.available
        assert blocked.status == read_descriptor(TRAINING, expected["train"])["blockedReason"]

    resolved = models.resolve(TrainingRunConfig(
        model_id="vivoice-zero-shot-clone",
        parameters={"model_name_or_path": "hynt/F5-TTS-Vietnamese-ViVoice"},
    ))
    assert resolved.engine == "vivoice"
    assert resolved.base_model == "hynt/F5-TTS-Vietnamese-ViVoice"
    with pytest.raises(ValueError, match="không có tham số"):
        models.resolve(TrainingRunConfig(model_id="f5-tts-zero-shot-clone", parameters={"lora_r": 8}))
    with pytest.raises(TrainingModelUnavailable, match="Trainer F5-TTS chưa được nối"):
        models.resolve(TrainingRunConfig(model_id="f5-tts-finetune"))
    with pytest.raises(TrainingModelUnavailable, match="S1-mini"):
        models.resolve(TrainingRunConfig(model_id="fish-s2-pro-finetune"))
