"""Count the optimizer steps in one pass over a run's training data.

Executed by the OmniVoice runtime's Python before training. It builds the train
dataloader exactly as training will (the engine's builder, with the launcher's
Windows fixes applied) and iterates it the way the trainer does, so the count
includes the half-full length buckets every pass ends with. No model is loaded
and nothing touches the GPU.

Prints one JSON line after REPLY_PREFIX:
    {"batchesPerEpoch": [5, 6], "gradientAccumulation": 1, "stepsPerEpoch": 5.5, "seconds": 12.3}
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import omnivoice_train as launcher  # noqa: E402

REPLY_PREFIX = "@@PRO4BRO@@"

# The engine adds these to the text tokenizer before training
# (omnivoice/training/builder.py, build_model_and_tokenizer); text lengths, and
# with them the batches, depend on it.
SPECIAL_TOKENS = [
    "<|denoise|>",
    "<|lang_start|>",
    "<|lang_end|>",
    "<|instruct_start|>",
    "<|instruct_end|>",
    "<|text_start|>",
    "<|text_end|>",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train_config", required=True)
    parser.add_argument("--data_config", required=True)
    parser.add_argument("--epochs", type=int, default=2)
    args = parser.parse_args()

    began = time.perf_counter()
    launcher.apply()
    from omnivoice.models.omnivoice import _resolve_model_path
    from omnivoice.training import builder
    from omnivoice.training.config import TrainingConfig
    from transformers import AutoTokenizer

    config = TrainingConfig.from_json(args.train_config)
    config.data_config = args.data_config
    tokenizer = AutoTokenizer.from_pretrained(_resolve_model_path(config.init_from_checkpoint or config.llm_name_or_path))
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    missing = [token for token in SPECIAL_TOKENS if token not in tokenizer.get_vocab()]
    if missing:
        tokenizer.add_special_tokens({"additional_special_tokens": missing})

    train_loader, _ = builder.build_dataloaders(config, tokenizer)
    counts: list[int] = []
    for epoch in range(max(1, args.epochs)):
        train_loader.dataset.set_epoch(epoch)
        counts.append(sum(1 for _ in train_loader))

    accumulation = max(1, int(config.gradient_accumulation_steps))
    reply = {
        "batchesPerEpoch": counts,
        "gradientAccumulation": accumulation,
        "stepsPerEpoch": sum(counts) / len(counts) / accumulation,
        "seconds": round(time.perf_counter() - began, 1),
    }
    print(REPLY_PREFIX + json.dumps(reply), flush=True)


if __name__ == "__main__":
    main()
