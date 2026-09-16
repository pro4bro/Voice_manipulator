from __future__ import annotations

import ast
import json
import re
from pathlib import Path

import pytest

from app.adapters.training_model_catalog import (
    FileTrainingModelCatalog,
    TrainingModelUnavailable,
)
from app.domain.models import TrainingRunConfig
from app.settings import Settings

SETTINGS = Settings.from_env()
SHIPPED = SETTINGS.training_models_root


def catalog(tmp_path, *, omnivoice=True, vibevoice=False, local=None, readiness=None):
    roots = {
        "omnivoice": tmp_path / "omnivoice",
        "vibevoice": tmp_path / "vibevoice",
        "vibevoice-models": tmp_path / "vibevoice" / "VibeVoice_models",
        "hub": tmp_path / "hub",
    }
    if omnivoice:
        entry = roots["omnivoice"] / "omnivoice" / "cli" / "train.py"
        entry.parent.mkdir(parents=True)
        entry.write_text("", encoding="utf-8")
    if vibevoice:
        for relative in (
            "VibeVoice-community/vibevoice/finetune/train_vibevoice.py",
            "VibeVoice-community/vibevoice/modular/modeling_vibevoice_inference.py",
            "VibeVoice/finetuning-asr/lora_finetune.py",
        ):
            entry = roots["vibevoice"] / relative
            entry.parent.mkdir(parents=True, exist_ok=True)
            entry.write_text("", encoding="utf-8")
        for weights in ("microsoft/VibeVoice-1.5B", "Qwen/Qwen2.5-1.5B"):
            (roots["vibevoice-models"] / weights).mkdir(parents=True)
    return FileTrainingModelCatalog(SHIPPED, roots, local, readiness=readiness)


def descriptor(**overrides):
    payload = {
        "schemaVersion": 1,
        "id": "demo-tts",
        "label": "Demo TTS",
        "family": "Demo",
        "engine": "demo",
        "mode": "lora",
        "runnable": False,
        "repository": {"root": "demo", "entrypoint": "train.py"},
        "parameters": [
            {"key": "epochs", "label": "Epochs", "kind": "int", "default": 2, "min": 1},
        ],
    }
    payload.update(overrides)
    return payload


def test_every_shipped_descriptor_loads():
    files = sorted(SHIPPED.glob("*.json"))
    options = FileTrainingModelCatalog(SHIPPED, {}).options()

    assert len(options) == len(files) >= 6
    assert {option.id for option in options} >= {
        "omnivoice-lora",
        "omnivoice-full",
        "vibevoice-1.5b-tts-lora",
        "vibevoice-7b-tts-lora",
        "vibevoice-asr-lora",
    }


def test_only_an_installed_option_with_a_runner_is_available(tmp_path):
    options = {option.id: option for option in catalog(tmp_path).options()}

    assert options["omnivoice-lora"].available
    assert options["omnivoice-full"].available
    assert "omnivoice-from-scratch" not in options
    vibe = options["vibevoice-1.5b-tts-lora"]
    assert not vibe.installed and not vibe.available
    assert "train_vibevoice.py" in vibe.status


def test_a_vibevoice_option_needs_its_weights_and_what_its_python_lacks(tmp_path):
    missing_packages = catalog(
        tmp_path / "a", vibevoice=True, readiness={"vibevoice": lambda d: "Python của VibeVoice còn thiếu: peft, datasets." if d.mode != "zero-shot-clone" else None}
    ).options()
    options = {option.id: option for option in missing_packages}

    small = options["vibevoice-1.5b-tts-lora"]
    assert small.installed and not small.available and "peft" in small.status
    assert options["vibevoice-1.5b-zero-shot-clone"].available
    assert not options["vibevoice-7b-tts-lora"].installed and "VibeVoice-7B" in options["vibevoice-7b-tts-lora"].status
    assert not options["vibevoice-asr-lora"].installed

    ready = {option.id: option for option in catalog(tmp_path / "b", vibevoice=True).options()}
    assert ready["vibevoice-1.5b-tts-lora"].available


def test_a_local_descriptor_adds_an_option_and_can_replace_a_shipped_one(tmp_path):
    local = tmp_path / "local"
    local.mkdir()
    (local / "demo.json").write_text(json.dumps(descriptor()), encoding="utf-8")
    shipped = json.loads((SHIPPED / "omnivoice-lora.json").read_text(encoding="utf-8"))
    shipped["label"] = "OmniVoice LoRA · máy này"
    (local / "omnivoice-lora.json").write_text(json.dumps(shipped), encoding="utf-8")

    options = {option.id: option for option in catalog(tmp_path, local=local).options()}

    assert options["demo-tts"].origin == "local"
    assert options["demo-tts"].parameters[0].key == "epochs"
    assert options["omnivoice-lora"].label == "OmniVoice LoRA · máy này"
    assert options["omnivoice-lora"].origin == "local"


@pytest.mark.parametrize(
    "broken",
    [
        "{not json",
        json.dumps(descriptor(parameters=[{"key": "x", "label": "X", "kind": "int", "default": 0, "min": 1}])),
        json.dumps(descriptor(parameters=[{"key": "c", "label": "C", "kind": "choice", "default": "a"}])),
        json.dumps(descriptor(parameters=[
            {"key": "x", "label": "X", "kind": "int", "default": 1},
            {"key": "x", "label": "X again", "kind": "int", "default": 1},
        ])),
    ],
)
def test_a_malformed_descriptor_is_skipped_not_fatal(tmp_path, broken):
    local = tmp_path / "local"
    local.mkdir()
    (local / "broken.json").write_text(broken, encoding="utf-8")

    options = catalog(tmp_path, local=local).options()

    assert "demo-tts" not in {option.id for option in options}
    assert "omnivoice-lora" in {option.id for option in options}


def test_resolve_fills_defaults_and_mirrors_run_fields(tmp_path):
    config = catalog(tmp_path).resolve(
        TrainingRunConfig(model_id="omnivoice-lora", parameters={"lora_r": 32, "steps": 1200})
    )

    assert config.engine == "omnivoice" and config.mode == "lora-finetune"
    assert config.parameters["lora_r"] == 32
    assert config.parameters["lora_dropout"] == 0.05
    assert config.lora_r == 32 and config.steps == 1200
    assert config.save_steps == 1000
    assert config.base_model == "k2-fsa/OmniVoice"


def test_resolve_refuses_what_the_descriptor_does_not_allow(tmp_path):
    models = catalog(tmp_path)

    with pytest.raises(ValueError, match="không có tham số"):
        models.resolve(TrainingRunConfig(model_id="omnivoice-lora", parameters={"lora_rank": 8}))
    with pytest.raises(ValueError, match="nhỏ hơn"):
        models.resolve(TrainingRunConfig(model_id="omnivoice-lora", parameters={"lora_r": 0}))
    with pytest.raises(ValueError, match="một trong"):
        models.resolve(TrainingRunConfig(model_id="omnivoice-lora", parameters={"attn_implementation": "eager"}))
    with pytest.raises(ValueError, match="Không có Model Training"):
        models.resolve(TrainingRunConfig(model_id="missing"))
    with pytest.raises(TrainingModelUnavailable):
        models.resolve(TrainingRunConfig(model_id="vibevoice-1.5b-tts-lora"))


def test_a_locked_parameter_keeps_its_default(tmp_path):
    config = catalog(tmp_path).resolve(
        TrainingRunConfig(model_id="omnivoice-lora", parameters={"use_lora": False})
    )

    assert config.parameters["use_lora"] is True
    assert config.use_lora is True


def test_a_request_without_a_model_id_passes_through_unchanged(tmp_path):
    original = TrainingRunConfig(steps=12)

    assert catalog(tmp_path).resolve(original) == original


# ---------------------------------------------------------------------------
# The shipped values against the repositories they claim to come from. These
# are the numbers people copy into a run; a typo here trains the wrong model.


def shipped(model_id):
    return json.loads((SHIPPED / f"{model_id}.json").read_text(encoding="utf-8"))


def same(left, right):
    if isinstance(left, (int, float)) and isinstance(right, (int, float)) and not isinstance(left, bool):
        return float(left) == float(right)
    return left == right


def dataclass_defaults(path: Path) -> dict[str, object]:
    """`name: type = default` and `field(default=...)` from every class in a file."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: dict[str, object] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        for item in node.body:
            if not isinstance(item, ast.AnnAssign) or not isinstance(item.target, ast.Name) or item.value is None:
                continue
            value = item.value
            if isinstance(value, ast.Call) and getattr(value.func, "id", None) == "field":
                value = next((kw.value for kw in value.keywords if kw.arg == "default"), None)
                if value is None:
                    continue
            try:
                found[item.target.id] = ast.literal_eval(value)
            except ValueError:
                continue
    return found


def cli_flags(text: str, script: str) -> dict[str, object]:
    """`--flag value` pairs from the fullest Markdown command that runs `script`.

    READMEs show a short "basic" command before the full recipe; the recipe is
    the one that sets the most flags.
    """
    blocks = [body for body in re.findall(r"```[a-z]*\n(.*?)```", text, re.S) if script in body]
    block = max(blocks, key=lambda body: body.count("--"))
    flags: dict[str, object] = {}
    for match in re.finditer(r"--(\w+)(?:[ =]+([^\s\\-][^\s\\]*))?", block):
        key, raw = match.group(1), match.group(2)
        if raw is None:
            flags[key] = True
            continue
        if raw in {"True", "False"}:
            flags[key] = raw == "True"
            continue
        try:
            flags[key] = float(raw) if any(ch in raw for ch in ".e") and not raw.isalpha() else int(raw)
        except ValueError:
            flags[key] = raw
    return flags


def check(model_id, recipe: dict[str, object], code: dict[str, object], every_recipe_flag: bool = False):
    mismatches = []
    if every_recipe_flag:
        declared = {spec["key"] for spec in shipped(model_id)["parameters"]}
        mismatches += [f"{key}: set by the recipe, missing from the descriptor" for key in sorted(set(recipe) - declared)]
    for spec in shipped(model_id)["parameters"]:
        key = spec["key"]
        if "recipe" in spec:
            if key not in recipe:
                mismatches.append(f"{key}: recipe claims {spec['recipe']!r} but the recipe does not set it")
            elif not same(spec["recipe"], recipe[key]):
                mismatches.append(f"{key}: recipe {spec['recipe']!r} != upstream {recipe[key]!r}")
        elif key in recipe:
            mismatches.append(f"{key}: upstream recipe sets {recipe[key]!r} but the descriptor records none")
        if key in code and "codeDefault" in spec and not same(spec["codeDefault"], code[key]):
            mismatches.append(f"{key}: codeDefault {spec['codeDefault']!r} != code {code[key]!r}")
    assert not mismatches, "\n".join(mismatches)


OMNIVOICE = SETTINGS.omnivoice_root


@pytest.mark.skipif(not (OMNIVOICE / "omnivoice" / "training" / "config.py").is_file(), reason="OmniVoice checkout absent")
@pytest.mark.parametrize(
    "model_id",
    ["omnivoice-lora", "omnivoice-full"],
)
def test_omnivoice_descriptors_match_the_engine(model_id):
    data = shipped(model_id)
    recipe = json.loads((OMNIVOICE / data["repository"]["recipe"]).read_text(encoding="utf-8"))
    code = dataclass_defaults(OMNIVOICE / "omnivoice" / "training" / "config.py")

    check(model_id, recipe, code)
    # OmniVoice drops keys its TrainingConfig does not declare, so a key outside
    # it would be a knob that silently does nothing.
    # max_epochs is read by Pro4Bro's runner, which turns it into a step cap.
    unknown = {spec["key"] for spec in data["parameters"]} - set(code) - {"lora_target_modules", "max_epochs"}
    assert not unknown


VIBEVOICE = SETTINGS.vibevoice_root
COMMUNITY = VIBEVOICE / "VibeVoice-community"
MICROSOFT = VIBEVOICE / "VibeVoice"


@pytest.mark.skipif(not (COMMUNITY / "FINETUNING.md").is_file(), reason="VibeVoice community checkout absent")
def test_vibevoice_tts_descriptor_matches_the_community_recipe():
    recipe = cli_flags((COMMUNITY / "FINETUNING.md").read_text(encoding="utf-8"), "train_vibevoice")
    code = dataclass_defaults(COMMUNITY / "vibevoice" / "finetune" / "train_vibevoice.py")
    # Flags that name data or reporting, not training behaviour.
    for key in ("dataset_name", "text_column_name", "audio_column_name", "voice_prompts_column_name",
                "output_dir", "report_to", "remove_unused_columns", "do_train"):
        recipe.pop(key, None)

    check("vibevoice-1.5b-tts-lora", recipe, code, every_recipe_flag=True)


@pytest.mark.skipif(not (COMMUNITY / "FINETUNING.md").is_file(), reason="VibeVoice community checkout absent")
def test_vibevoice_7b_borrows_the_1_5b_values_without_claiming_a_recipe():
    small = {spec["key"]: spec for spec in shipped("vibevoice-1.5b-tts-lora")["parameters"]}
    large = {spec["key"]: spec for spec in shipped("vibevoice-7b-tts-lora")["parameters"]}

    assert set(small) == set(large)
    for key, spec in large.items():
        if key != "model_name_or_path":
            assert spec["default"] == small[key]["default"], key
    assert "recipe" not in large["model_name_or_path"]


@pytest.mark.skipif(not (MICROSOFT / "finetuning-asr" / "README.md").is_file(), reason="VibeVoice checkout absent")
def test_vibevoice_asr_descriptor_matches_the_microsoft_recipe():
    recipe = cli_flags((MICROSOFT / "finetuning-asr" / "README.md").read_text(encoding="utf-8"), "lora_finetune.py")
    code = dataclass_defaults(MICROSOFT / "finetuning-asr" / "lora_finetune.py")
    for key in ("nproc_per_node", "data_dir", "output_dir", "report_to"):
        recipe.pop(key, None)

    check("vibevoice-asr-lora", recipe, code, every_recipe_flag=True)
