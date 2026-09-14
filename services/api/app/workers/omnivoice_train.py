"""Run `omnivoice.cli.train` unmodified, with one Windows fix applied around it.

Executed by the OmniVoice runtime's Python through `accelerate launch`. The
upstream dataloader builder hands `StreamLengthGroupDataset` a
`lambda s: s["length"]`. Windows starts dataloader workers by spawning and
pickling the dataset, a lambda cannot be pickled, so every run with workers
ended before its first step - and zero workers is refused by the builder's own
`prefetch_factor`. The fix swaps in a module-level function with the same
body; spawned workers re-import this file and find it by name.
"""

from __future__ import annotations

from omnivoice.training import builder as _builder


def sample_length(sample):
    return sample["length"]


class PicklableStreamLengthGroupDataset(_builder.StreamLengthGroupDataset):
    def __init__(self, *args, **kwargs):
        kwargs["length_fn"] = sample_length
        super().__init__(*args, **kwargs)


def main() -> None:
    _builder.StreamLengthGroupDataset = PicklableStreamLengthGroupDataset
    from omnivoice.cli.train import main as train_main

    train_main()


if __name__ == "__main__":
    main()
