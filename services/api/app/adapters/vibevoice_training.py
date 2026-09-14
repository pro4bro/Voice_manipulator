"""Everything a VibeVoice training run needs from this machine, as plain functions.

VibeVoice is not Pro4Bro's engine and its checkouts stay untouched: the TTS
trainer comes from the community fork, the ASR trainer from Microsoft's repo,
and both run in the Microsoft checkout's own Python. What this module owns is
the boundary - where things are, whether they are importable, how a Dataset
Manifest becomes each trainer's input, and which command runs it.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.domain.models import DatasetSegment

Slicer = Callable[[Path, Path, float, float], None]

TTS_PACKAGES = ("peft", "datasets", "diffusers", "transformers")
ASR_PACKAGES = ("peft", "transformers")


@dataclass(frozen=True)
class VibeVoicePaths:
    root: Path

    @property
    def microsoft(self) -> Path:
        return self.root / "VibeVoice"

    @property
    def community(self) -> Path:
        return self.root / "VibeVoice-community"

    @property
    def models(self) -> Path:
        return self.root / "VibeVoice_models"

    @property
    def python(self) -> Path:
        scripts = "Scripts/python.exe" if os.name == "nt" else "bin/python"
        return self.microsoft / ".venv" / scripts

    def resolve_model(self, name: str) -> Path:
        """A Hugging Face id as the local copy under VibeVoice_models, or a path as given."""
        candidate = Path(name)
        if candidate.is_absolute() and candidate.is_dir():
            return candidate
        local = self.models / name.replace("\\", "/")
        if local.is_dir():
            return local
        raise FileNotFoundError(f"Chưa có model {name} trong {self.models}.")

    def tokenizer_for(self, model_dir: Path, fallback: str) -> Path:
        """The text tokenizer a VibeVoice checkpoint names, as a local folder.

        Checkpoints name it by Hub id; the machine runs offline, so the local
        copy is the only one that can load.
        """
        name = fallback
        config = model_dir / "preprocessor_config.json"
        if config.is_file():
            name = json.loads(config.read_text(encoding="utf-8")).get("language_model_pretrained_name") or fallback
        return self.resolve_model(name)

    def environment(self, repository: Path) -> dict[str, str]:
        env = {
            # The Microsoft checkout's editable install points at the folder it
            # was installed from. The checkout whose code should run goes first
            # on the path, which also lets the community fork's `vibevoice`
            # package shadow Microsoft's for TTS training.
            "PYTHONPATH": str(repository),
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "HF_DATASETS_OFFLINE": "1",
            "HF_HUB_DISABLE_TELEMETRY": "1",
            "HF_HOME": str(self.models / ".cache" / "huggingface"),
            "PYTHONIOENCODING": "utf-8",
            "WANDB_DISABLED": "true",
        }
        ffmpeg = self.microsoft / "tools" / "ffmpeg" / "bin"
        if ffmpeg.is_dir():
            env["PATH"] = str(ffmpeg) + os.pathsep + os.environ.get("PATH", "")
        return env


@dataclass
class VibeVoiceRuntime:
    """Whether the VibeVoice Python can import what a trainer needs.

    Asked of the interpreter itself, not of a package list on disk, and cached
    for a minute: the Train page polls, and a subprocess per poll is waste.
    """

    paths: VibeVoicePaths
    ttl_seconds: float = 60.0
    _cache: dict[tuple[str, ...], tuple[float, list[str]]] = field(default_factory=dict)

    def missing(self, packages: tuple[str, ...], repository: Path) -> list[str]:
        if not repository.is_dir():
            return [f"repo {repository.name}"]
        if not self.paths.python.is_file():
            return ["Python .venv của repo VibeVoice"]
        key = (str(repository), *packages)
        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] < self.ttl_seconds:
            return cached[1]
        probe = (
            "import importlib.util, json; "
            f"print(json.dumps([name for name in {list(packages)!r} if importlib.util.find_spec(name) is None]))"
        )
        try:
            result = subprocess.run(
                [str(self.paths.python), "-c", probe],
                capture_output=True,
                text=True,
                timeout=60,
                env={**os.environ, **self.paths.environment(repository)},
            )
            missing = json.loads(result.stdout.strip().splitlines()[-1]) if result.returncode == 0 else ["Python của VibeVoice không chạy được"]
        except (OSError, subprocess.TimeoutExpired, ValueError, IndexError):
            missing = ["Python của VibeVoice không chạy được"]
        self._cache[key] = (time.monotonic(), missing)
        return missing


def write_processor_dir(model_dir: Path, tokenizer_dir: Path, target: Path) -> Path:
    """A copy of the checkpoint's processor config that names the local tokenizer."""
    target.mkdir(parents=True, exist_ok=True)
    source = model_dir / "preprocessor_config.json"
    config: dict[str, Any] = json.loads(source.read_text(encoding="utf-8")) if source.is_file() else {}
    config["language_model_pretrained_name"] = str(tokenizer_dir)
    (target / "preprocessor_config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    return target


@dataclass(frozen=True)
class ExportCounts:
    train: int
    dev: int


def export_tts_jsonl(
    segments: list[DatasetSegment],
    project_root: Path,
    data_dir: Path,
    slicer: Slicer,
    voice_prompt: Path | None,
) -> tuple[Path, Path, ExportCounts]:
    """Rows the community trainer reads: `Speaker 1: text`, an audio file, a voice prompt.

    One speaker per run, so every line is Speaker 1 and every row shares the
    same reference clip as its prompt - another utterance of the same person,
    which is what cloning at inference will give it.
    """
    clips = data_dir / "segments"
    clips.mkdir(parents=True, exist_ok=True)
    lines: dict[str, list[str]] = {"train": [], "dev": []}
    for segment in segments:
        audio = (clips / f"{segment.id}.wav").resolve()
        slicer((project_root / segment.audio_path).resolve(), audio, segment.start, segment.end)
        row: dict[str, Any] = {"text": f"Speaker 1: {segment.text.strip()}", "audio": str(audio)}
        if voice_prompt is not None:
            row["voice_prompts"] = [str(voice_prompt.resolve())]
        lines[segment.split].append(json.dumps(row, ensure_ascii=False))
    if not lines["train"]:
        raise ValueError("Không có mẫu train nào cho VibeVoice.")
    train = data_dir / "train.jsonl"
    dev = data_dir / "validation.jsonl"
    train.write_text("\n".join(lines["train"]) + "\n", encoding="utf-8")
    dev.write_text("\n".join(lines["dev"]) + ("\n" if lines["dev"] else ""), encoding="utf-8")
    return train, dev, ExportCounts(len(lines["train"]), len(lines["dev"]))


def export_asr_dataset(
    segments: list[DatasetSegment],
    project_root: Path,
    data_dir: Path,
    slicer: Slicer,
    context: list[str] | None = None,
) -> tuple[Path, int]:
    """Audio plus a JSON label per sample, the layout `lora_finetune.py` globs.

    Dev segments are left out: that script has no evaluation split, and
    training on them would only hide what the dev list is for.
    """
    folder = data_dir / "asr"
    folder.mkdir(parents=True, exist_ok=True)
    count = 0
    for segment in segments:
        if segment.split != "train":
            continue
        audio = folder / f"{segment.id}.wav"
        slicer((project_root / segment.audio_path).resolve(), audio, segment.start, segment.end)
        label: dict[str, Any] = {
            "audio_duration": round(segment.duration, 3),
            "audio_path": audio.name,
            "segments": [{"speaker": 0, "text": segment.text.strip(), "start": 0.0, "end": round(segment.duration, 3)}],
        }
        if context:
            label["customized_context"] = context
        (folder / f"{segment.id}.json").write_text(json.dumps(label, ensure_ascii=False, indent=2), encoding="utf-8")
        count += 1
    if not count:
        raise ValueError("Không có mẫu train nào cho VibeVoice-ASR.")
    return folder, count


def cli_flags(parameters: dict[str, Any], skip: set[str] = frozenset()) -> list[str]:
    """Descriptor values as `--key value` flags, the names each trainer declares."""
    flags: list[str] = []
    for key, value in parameters.items():
        if key in skip or value is None:
            continue
        flags += [f"--{key}", ("True" if value else "False") if isinstance(value, bool) else str(value)]
    return flags


def tts_command(
    paths: VibeVoicePaths,
    model_dir: Path,
    processor_dir: Path,
    train_jsonl: Path,
    dev_jsonl: Path | None,
    output_dir: Path,
    parameters: dict[str, Any],
) -> list[str]:
    command = [
        str(paths.python), "-m", "vibevoice.finetune.train_vibevoice",
        "--model_name_or_path", str(model_dir),
        "--processor_name_or_path", str(processor_dir),
        "--train_jsonl", str(train_jsonl),
        "--text_column_name", "text",
        "--audio_column_name", "audio",
        "--voice_prompts_column_name", "voice_prompts",
        "--output_dir", str(output_dir),
        "--do_train",
        "--remove_unused_columns", "False",
        "--report_to", "none",
    ]
    if dev_jsonl is not None:
        command += ["--validation_jsonl", str(dev_jsonl)]
    return command + cli_flags(parameters, skip={"model_name_or_path"})


def asr_command(
    paths: VibeVoicePaths,
    wrapper: Path,
    model_dir: Path,
    data_dir: Path,
    output_dir: Path,
    parameters: dict[str, Any],
) -> list[str]:
    return [
        str(paths.python), str(wrapper),
        "--model_path", str(model_dir),
        "--data_dir", str(data_dir),
        "--output_dir", str(output_dir),
        "--report_to", "none",
        *cli_flags(parameters, skip={"model_path"}),
    ]
