"""Run `omnivoice.cli.train` unmodified, with two Windows fixes applied around it.

Executed by the OmniVoice runtime's Python through `accelerate launch`.

1. Picklable length function. The upstream dataloader builder hands
   `StreamLengthGroupDataset` a `lambda s: s["length"]`. Windows starts
   dataloader workers by spawning and pickling the dataset, a lambda cannot be
   pickled, so every run with workers ended before its first step - and zero
   workers is refused by the builder's own `prefetch_factor`. The fix swaps in a
   module-level function with the same body; spawned workers re-import this file
   and find it by name.

2. Workers kept across epochs. At the end of every epoch the trainer calls
   `set_epoch` and `iter(train_loader)` again, and a plain DataLoader starts new
   workers for it. Spawning a worker on Windows re-imports torch and the engine:
   about 18 s for two workers. A voice dataset of a few minutes is an epoch every
   handful of steps, so a run spent most of its time starting processes (measured
   on an 11-clip set: ~0.4 s of GPU per step, ~4 s per step overall).

   The train loader is built with `persistent_workers=True`. A kept worker holds
   its own copy of the dataset, so the trainer's `set_epoch` in the main process
   no longer reaches it; the dataset therefore advances its own epoch each time a
   worker starts a new pass. Every epoch still reshuffles shards and the sample
   buffer with the epoch as seed, exactly as upstream, and epoch boundaries are
   unchanged: the loader still ends a pass only when every worker is exhausted.
   The dev loader is left as upstream builds it.
"""

from __future__ import annotations

import torch
from omnivoice.training import builder as _builder


def sample_length(sample):
    return sample["length"]


class WorkerEpochs:
    """Advance the epoch inside a kept-alive dataloader worker.

    `_epoch` is only set once the trainer has called `set_epoch`, which it does
    for the train set and never for the dev set, so only the train set advances.
    In the main process (no workers) the trainer's own calls are the only ones.
    """

    _epoch: int | None = None
    _passes: int = 0

    def set_epoch(self, epoch: int) -> None:
        self._epoch = epoch
        super().set_epoch(epoch)

    def __iter__(self):
        if torch.utils.data.get_worker_info() is not None and self._epoch is not None:
            if self._passes > 0:
                self.set_epoch(self._epoch + 1)
            self._passes += 1
        return super().__iter__()


class PicklableStreamLengthGroupDataset(WorkerEpochs, _builder.StreamLengthGroupDataset):
    def __init__(self, *args, **kwargs):
        kwargs["length_fn"] = sample_length
        super().__init__(*args, **kwargs)


class EpochPackingIterableDataset(WorkerEpochs, _builder.PackingIterableDataset):
    pass


def is_dev_set(dataset) -> bool:
    return bool(getattr(getattr(dataset, "dataset", None), "evaluation", False))


class KeptWorkersDataLoader(_builder.DataLoader):
    def __init__(self, dataset, *args, **kwargs):
        if kwargs.get("num_workers", 0) > 0 and not is_dev_set(dataset):
            kwargs.setdefault("persistent_workers", True)
        super().__init__(dataset, *args, **kwargs)


def apply() -> None:
    _builder.StreamLengthGroupDataset = PicklableStreamLengthGroupDataset
    _builder.PackingIterableDataset = EpochPackingIterableDataset
    _builder.DataLoader = KeptWorkersDataLoader


def main() -> None:
    apply()
    from omnivoice.cli.train import main as train_main

    train_main()


if __name__ == "__main__":
    main()
