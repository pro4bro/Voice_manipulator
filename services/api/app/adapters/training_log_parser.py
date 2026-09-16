from __future__ import annotations

import re

from app.domain.models import TrainingProgressLine

# What `TrainLogger.log_metrics` writes, from
# `omnivoice/training/checkpoint.py:105`:
#   Step 1500 | train/loss: 2.3145 | train/learning_rate: 1.00e-04 | ...
# It writes through `progress_bar.write`, and on a pipe that text lands right
# after the bar's last redraw on the same line ("...lr=9.1e-05]Step 50 | ..."),
# so the line is searched, not anchored.
_STEP = re.compile(r"(?<![\w/])Step\s+(?P<step>\d+)\s*\|\s*(?P<metrics>.+)$")
_METRIC = re.compile(r"(?P<key>[\w/]+):\s*(?P<value>-?[\d.]+(?:e[-+]?\d+)?)")

# `trainer.py:244`: logger.info(f"Eval Loss: {final_eval_loss:.4f}")
_EVAL = re.compile(r"Eval Loss:\s*(?P<loss>-?[\d.]+(?:e[-+]?\d+)?)")

# `trainer.py:213`: logger.info(f"Resumed from step {self.global_step}")
_RESUMED = re.compile(r"Resumed from step\s+(?P<step>\d+)")

# The trainer's own bar, `TrainLogger` in checkpoint.py, redrawn every step:
#   Training:  20%|##        | 1005/5000 [1:03:08<4:53:41,  4.41s/it, loss=0.1019, lr=9.11e-05]
# It is the only thing that moves between two logged steps.
_TRAIN_BAR = re.compile(
    r"Training:\s*\d+%\|[^|]*\|\s*(?P<done>\d+)\s*/\s*(?P<total>\d+)\s*\["
)

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

    step = _STEP.search(line)
    if step:
        metrics = {
            match.group("key"): float(match.group("value"))
            for match in _METRIC.finditer(step.group("metrics"))
        }
        return TrainingProgressLine(
            step_id="train",
            message=line[step.start():],
            global_step=int(step.group("step")),
            loss=metrics.get("train/loss"),
            learning_rate=metrics.get("train/learning_rate"),
            steps_per_second=metrics.get("train/steps_per_sec"),
        )

    bar = _TRAIN_BAR.search(line)
    if bar:
        # Position only. The bar's loss is one step's, not the logged average the
        # chart is drawn from, and its rate is a short moving average that drops
        # to a fraction right after an evaluation pause - an ETA of 11 minutes
        # for 90 seconds of work. The "Step" lines carry the trainer's own rate.
        return TrainingProgressLine(
            step_id="train",
            global_step=int(bar.group("done")),
            done=int(bar.group("done")),
            total=int(bar.group("total")),
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


# Python logging as accelerate and the OmniVoice trainer format it, and as the
# tokenizer script formats it. Either can land after a bar redraw on one line.
_LOGGING_TRAINER = re.compile(
    r"\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2} - (?P<level>INFO|WARNING|ERROR|CRITICAL) - (?P<name>[\w.]+) - (?P<text>.*)$"
)
_LOGGING_TOKENIZER = re.compile(
    r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+ (?P<level>INFO|WARNING|ERROR|CRITICAL) \[(?P<name>[\w.]+):\d+\] (?P<text>.*)$"
)
_PY_WARNING = re.compile(r"\b(?P<kind>\w*Warning): (?P<text>.+)$")
_EXCEPTION = re.compile(r"^(?:[\w.]+\.)?(?P<kind>\w*(?:Error|Exception|Interrupt))(?::\s*(?P<text>.*))?$")
# Engine INFO lines that repeat every few steps and say nothing new.
_QUIET_INFO = re.compile(r"Epoch \d+ starting|Eval Loss:|Loaded Config:|Resumed from step")
NOTICE_MAX_CHARS = 400


def engine_notice(raw: str) -> tuple[str, str] | None:
    """A line of engine output worth a place in the run's log, as (level, text).

    Measurements are the parsers' job; this keeps what a person reads back when
    something went wrong: errors, warnings, and the trainer's own account of
    what it is doing ("Starting Training Loop", "Saved checkpoint to ...").
    Library INFO chatter and per-epoch lines stay in process.log only.
    """
    line = raw.strip()
    if not line:
        return None
    for pattern in (_LOGGING_TRAINER, _LOGGING_TOKENIZER):
        found = pattern.search(line)
        if not found:
            continue
        level, name, text = found.group("level"), found.group("name"), found.group("text").strip()
        if level in {"ERROR", "CRITICAL"}:
            return "error", _clip(f"{_short(name)}: {text}")
        if level == "WARNING":
            return "warning", _clip(f"{_short(name)}: {text}")
        engine_info = name.startswith("omnivoice") or name.endswith(".py")
        if engine_info and not _QUIET_INFO.search(text):
            return "info", _clip(f"{_short(name)}: {text}")
        return None
    if line.startswith("Traceback (most recent call last)"):
        return "error", "Python traceback - chi tiết từng dòng nằm trong Log đầy đủ."
    if "CUDA out of memory" in line or "OutOfMemoryError" in line:
        return "error", _clip(line)
    exception = _EXCEPTION.match(line)
    if exception:
        return "error", _clip(line)
    warning = _PY_WARNING.search(line)
    if warning:
        return "warning", _clip(f"{warning.group('kind')}: {warning.group('text')}")
    return None


def _short(name: str) -> str:
    return name.rsplit(".", 1)[-1] if not name.endswith(".py") else name[:-3]


def _clip(text: str) -> str:
    return text if len(text) <= NOTICE_MAX_CHARS else text[: NOTICE_MAX_CHARS - 1] + "…"
