"""Progress from Hugging Face `Trainer` output, which both VibeVoice trainers use.

Trainer reports in two shapes: a tqdm bar (`37/300 [01:02<07:20, 1.68s/it]`)
and a Python dict per logging step (`{'loss': 1.93, 'learning_rate': 2e-05,
'epoch': 0.4}`). Both are read; anything else is left unreported rather than
guessed at.
"""

from __future__ import annotations

import ast
import re

from app.domain.models import TrainingProgressLine

_BAR = re.compile(r"(?P<done>\d+)\s*/\s*(?P<total>\d+)\s*\[[^\]]*?(?P<rate>[\d.]+)\s*(?P<unit>it/s|s/it)")
_DICT = re.compile(r"\{[^{}]*'(?:loss|eval_loss|train_loss|train_runtime)'[^{}]*\}")
_TRAINABLE = re.compile(r"trainable params:\s*[\d,]+", re.IGNORECASE)
_OTHER_BARS = ("Map", "Generating", "Loading", "Downloading", "Filter", "Casting", "shards", "examples")


def parse_hf_trainer_line(raw: str) -> TrainingProgressLine | None:
    line = raw.strip()
    if not line:
        return None

    if _TRAINABLE.search(line):
        return TrainingProgressLine(step_id="load-model", message=line)

    found = _DICT.search(line)
    if found:
        try:
            values = ast.literal_eval(found.group(0))
        except (ValueError, SyntaxError):
            return None
        if not isinstance(values, dict):
            return None
        return TrainingProgressLine(
            step_id="train",
            message=line if "train_runtime" in values else "",
            loss=_number(values.get("loss")),
            dev_loss=_number(values.get("eval_loss")),
            learning_rate=_number(values.get("learning_rate")),
        )

    bar = _BAR.search(line)
    # Dataset preparation and weight loading draw the same kind of bar; only the
    # unlabelled one is the training loop.
    if bar and not any(label in line for label in _OTHER_BARS):
        rate = float(bar.group("rate"))
        per_second = rate if bar.group("unit") == "it/s" else (1.0 / rate if rate > 0 else None)
        return TrainingProgressLine(
            step_id="train",
            global_step=int(bar.group("done")),
            done=int(bar.group("done")),
            total=int(bar.group("total")),
            steps_per_second=per_second,
        )
    return None


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)
