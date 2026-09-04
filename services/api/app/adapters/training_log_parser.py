from __future__ import annotations

import re

from app.domain.models import TrainingProgressLine

# What `TrainLogger.log_metrics` writes, from
# `omnivoice/training/checkpoint.py:105`:
#   Step 1500 | train/loss: 2.3145 | train/learning_rate: 1.00e-04 | ...
_STEP = re.compile(r"^Step\s+(?P<step>\d+)\s*\|\s*(?P<metrics>.+)$")
_METRIC = re.compile(r"(?P<key>[\w/]+):\s*(?P<value>-?[\d.]+(?:e[-+]?\d+)?)")

# `trainer.py:244`: logger.info(f"Eval Loss: {final_eval_loss:.4f}")
_EVAL = re.compile(r"Eval Loss:\s*(?P<loss>-?[\d.]+(?:e[-+]?\d+)?)")

# `trainer.py:213`: logger.info(f"Resumed from step {self.global_step}")
_RESUMED = re.compile(r"Resumed from step\s+(?P<step>\d+)")

# tqdm's bar for `extract_audio_tokens`, whose desc is "Extracting Audio Tokens".
_TQDM = re.compile(r"(?P<done>\d+)\s*/\s*(?P<total>\d+)\s*\[")

# `extract_audio_tokens.py:611`
_MANIFEST = re.compile(r"Manifest written to:\s*(?P<path>.+?)\s*\((?P<shards>\d+)\s*shards?\)")

# accelerate prints this once LoRA is attached; it is the only honest source for
# "did the adapter actually take" and worth surfacing rather than assuming.
_TRAINABLE = re.compile(
    r"trainable params:\s*(?P<trainable>[\d,]+).*?all params:\s*(?P<total>[\d,]+).*?"
    r"trainable%:\s*(?P<percent>[\d.]+)",
    re.IGNORECASE,
)


def parse_train_line(raw: str) -> TrainingProgressLine | None:
    """One line of trainer output, or None when it carries no measurement.

    Returning None for an unrecognised line is deliberate. A parser that guessed
    would put a plausible wrong number on the one screen a person uses to decide
    whether to keep waiting; an unparsed line simply is not reported.
    """
    line = raw.strip()
    if not line:
        return None

    resumed = _RESUMED.search(line)
    if resumed:
        return TrainingProgressLine(
            step_id="train",
            message=line,
            global_step=int(resumed.group("step")),
        )

    trainable = _TRAINABLE.search(line)
    if trainable:
        return TrainingProgressLine(step_id="load-model", message=line)

    evaluation = _EVAL.search(line)
    if evaluation:
        return TrainingProgressLine(
            step_id="train", message=line, dev_loss=float(evaluation.group("loss"))
        )

    step = _STEP.match(line)
    if step:
        metrics = {
            match.group("key"): float(match.group("value"))
            for match in _METRIC.finditer(step.group("metrics"))
        }
        return TrainingProgressLine(
            step_id="train",
            message=line,
            global_step=int(step.group("step")),
            loss=metrics.get("train/loss"),
            learning_rate=metrics.get("train/learning_rate"),
            steps_per_second=metrics.get("train/steps_per_sec"),
        )
    return None


def parse_tokenize_line(raw: str) -> TrainingProgressLine | None:
    """Tokenization reports in shards and samples, which is its own unit.

    It is not a fraction of the run: tokenizing can take tens of minutes before
    a single training step happens, and calling that "3% complete" is how a first
    run comes to look broken.
    """
    line = raw.strip()
    if not line:
        return None

    manifest = _MANIFEST.search(line)
    if manifest:
        return TrainingProgressLine(
            step_id="tokenize",
            message=line,
            done=int(manifest.group("shards")),
            total=int(manifest.group("shards")),
        )

    bar = _TQDM.search(line)
    if bar and "Extracting Audio Tokens" in line:
        return TrainingProgressLine(
            step_id="tokenize",
            done=int(bar.group("done")),
            total=int(bar.group("total")),
        )
    return None


def split_carriage_returns(chunk: str) -> list[str]:
    """tqdm redraws with `\\r`, so a read can hold many bar states at once."""
    return [part for part in re.split(r"[\r\n]+", chunk) if part.strip()]
