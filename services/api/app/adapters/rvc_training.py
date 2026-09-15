"""RVC through Applio: the boundary between a Dataset Manifest and Applio's trainer.

Applio is not Pro4Bro's code and its checkout is not edited. It keeps every
experiment under `<Applio>/logs/<name>`; a run links that folder to its own
run directory, so what the trainer writes lands inside the project, and the
link is removed when the run ends.

Two things are supplied from outside the checkout:
  * `rvc_site/sitecustomize.py`, which lets a one-GPU run start on Windows
    (see that file);
  * `assets/config.json`, seeded from Applio's own template the way Applio's
    app does on first launch, because the trainer reads it to write a model.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.domain.models import DatasetSegment, TrainingProgressLine

Slicer = Callable[[Path, Path, float, float], None]
SITE_DIR = Path(__file__).resolve().parents[1] / "workers" / "rvc_site"
SAMPLE_RATE = 40000

REQUIRED_WEIGHTS = (
    "rvc/models/pretraineds/hifi-gan/f0G40k.pth",
    "rvc/models/pretraineds/hifi-gan/f0D40k.pth",
    "rvc/models/predictors/rmvpe.pt",
    "rvc/models/embedders/contentvec/pytorch_model.bin",
)


@dataclass(frozen=True)
class RvcPaths:
    applio: Path
    runtime: Path

    @property
    def python(self) -> Path:
        return self.runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

    def missing(self) -> list[str]:
        missing = []
        if not (self.applio / "rvc" / "train" / "train.py").is_file():
            missing.append(f"repo Applio ({self.applio})")
        if not self.python.is_file():
            missing.append(f"Python của runtime RVC ({self.runtime})")
        missing += [weight for weight in REQUIRED_WEIGHTS if not (self.applio / weight).is_file()]
        return missing

    def environment(self) -> dict[str, str]:
        existing = os.environ.get("PYTHONPATH")
        return {
            "PYTHONPATH": str(SITE_DIR) + (os.pathsep + existing if existing else ""),
            "PRO4BRO_RVC_SINGLE_GPU_GROUP": "1",
            "PYTHONIOENCODING": "utf-8",
            # The trainer prints an epoch line and then exits hard; unbuffered, the line arrives.
            "PYTHONUNBUFFERED": "1",
            "HF_HUB_OFFLINE": "1",
        }

    def ensure_config(self) -> None:
        config = self.applio / "assets" / "config.json"
        template = self.applio / "assets" / "config_template.json"
        if config.is_file() or not template.is_file():
            return
        data = json.loads(template.read_text(encoding="utf-8"))
        data["discord_presence"] = False
        config.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def experiment_link(self, name: str) -> Path:
        return self.applio / "logs" / name


def link_experiment(paths: RvcPaths, name: str, target: Path) -> Path:
    """Point `<Applio>/logs/<name>` at a folder of the run."""
    target.mkdir(parents=True, exist_ok=True)
    link = paths.experiment_link(name)
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.exists():
        unlink_experiment(link)
    if os.name == "nt":
        # A junction needs no administrator rights, unlike a symlink.
        subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)], check=True, capture_output=True)
    else:
        link.symlink_to(target, target_is_directory=True)
    return link


def unlink_experiment(link: Path) -> None:
    """Remove the link only; a real folder with content is never deleted here."""
    try:
        if link.is_symlink():
            link.unlink()
        else:
            os.rmdir(link)
    except OSError:
        pass


def export_rvc_dataset(segments: list[DatasetSegment], project_root: Path, folder: Path, slicer: Slicer) -> tuple[int, float]:
    """One WAV per segment. RVC has no dev split, so both splits are its material."""
    folder.mkdir(parents=True, exist_ok=True)
    seconds = 0.0
    for segment in segments:
        slicer((project_root / segment.audio_path).resolve(), folder / f"{segment.id}.wav", segment.start, segment.end)
        seconds += segment.duration
    if not segments:
        raise ValueError("Không có đoạn nào để train RVC.")
    return len(segments), seconds


def rvc_commands(paths: RvcPaths, name: str, dataset: Path, parameters: dict[str, Any]) -> list[tuple[str, list[str]]]:
    python = str(paths.python)
    cores = str(int(parameters.get("cpu_cores") or max(1, min(8, (os.cpu_count() or 2) - 1))))
    epochs = int(parameters.get("total_epoch") or 200)
    return [
        ("tokenize", [python, "rvc/train/preprocess/preprocess.py", f"logs/{name}", str(dataset), str(SAMPLE_RATE), cores,
                      str(parameters.get("cut_preprocess") or "Automatic"), "False", str(bool(parameters.get("noise_reduction"))),
                      str(parameters.get("clean_strength") or 0.7), str(parameters.get("chunk_len") or 3.0), str(parameters.get("overlap_len") or 0.3), "none"]),
        ("tokenize", [python, "rvc/train/extract/extract.py", f"logs/{name}", str(parameters.get("f0_method") or "rmvpe"), cores, "0",
                      str(SAMPLE_RATE), "contentvec", "None", "2"]),
        ("train", [python, "rvc/train/train.py", name, str(int(parameters.get("save_every_epoch") or 25)), str(epochs),
                   "rvc/models/pretraineds/hifi-gan/f0G40k.pth", "rvc/models/pretraineds/hifi-gan/f0D40k.pth", "0",
                   str(int(parameters.get("batch_size") or 8)), str(SAMPLE_RATE), "True", "True", "False", "False", "HiFi-GAN", "False"]),
        ("checkpoint", [python, "rvc/train/process/extract_index.py", f"logs/{name}", str(parameters.get("index_algorithm") or "Auto")]),
    ]


_EPOCH = re.compile(r"\|\s*epoch=(?P<epoch>\d+)\s*\|\s*step=(?P<step>\d+)\s*\|(?P<rest>.*)")
_LOWEST = re.compile(r"lowest_value=(?P<value>[\d.]+)")
_DONE = ("Preprocess completed", "Pitch extraction completed", "Embedding extraction completed", "Training has been successfully completed", "Lowest generator loss", "Loaded pretrained")


def rvc_line_parser(total_epoch: int) -> Callable[[str], TrainingProgressLine | None]:
    """Progress from Applio's log: one line per epoch, plus the step summaries."""

    def parse(raw: str) -> TrainingProgressLine | None:
        line = raw.strip()
        if not line:
            return None
        found = _EPOCH.search(line)
        if found:
            epoch, step = int(found.group("epoch")), int(found.group("step"))
            lowest = _LOWEST.search(found.group("rest"))
            # Steps per epoch are only known once an epoch has run; the run's
            # step count follows from them.
            total = round(step / epoch * total_epoch) if epoch else None
            return TrainingProgressLine(
                step_id="train",
                message=f"Epoch {epoch}/{total_epoch}" + (f" · generator loss thấp nhất {lowest.group('value')}" if lowest else ""),
                global_step=step,
                loss=float(lowest.group("value")) if lowest else None,
                done=step,
                total=total,
            )
        if any(marker in line for marker in _DONE):
            return TrainingProgressLine(step_id="train" if "Training" in line or "Lowest" in line or "Loaded" in line else "tokenize", message=line)
        return None

    return parse


def finished_model(folder: Path) -> tuple[Path | None, Path | None]:
    """The newest RVC weight file and the retrieval index a run produced."""
    weights = sorted(folder.glob("*.pth"), key=lambda path: path.stat().st_mtime)
    weights = [path for path in weights if not path.name.startswith(("G_", "D_"))]
    index = sorted(folder.glob("*.index"), key=lambda path: path.stat().st_mtime)
    return (weights[-1] if weights else None), (index[-1] if index else None)

