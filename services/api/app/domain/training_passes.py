"""How many times a run reads its data, and how many steps that allows.

OmniVoice counts training in optimizer steps, not in passes over the data. A
step count copied from a recipe made for hundreds of hours means something very
different on a minute of one person's voice: 5,000 steps over 11 clips read
each clip about 950 times, and the model learned those clips by heart (train
loss near zero by step 1,000).

A pass cannot be known from seconds of audio alone: the length-grouped batcher
packs clips by token count into up to 20 length buckets per dataloader worker,
and every half-full bucket still becomes a batch at the end of a pass. So the
runner measures a pass with the real dataloader first, then caps the steps.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class StepPlan:
    steps: int
    requested_steps: int
    steps_per_epoch: float
    max_epochs: int
    capped: bool

    @property
    def epochs(self) -> float:
        return self.steps / self.steps_per_epoch if self.steps_per_epoch > 0 else 0.0

    @property
    def requested_epochs(self) -> float:
        return self.requested_steps / self.steps_per_epoch if self.steps_per_epoch > 0 else 0.0


def plan_steps(requested_steps: int, steps_per_epoch: float, max_epochs: int | None) -> StepPlan:
    """The steps to train: the requested count, or fewer if it reads the data too often.

    `max_epochs` of 0 or None means no limit. The cap never goes below one pass.
    """
    limit = int(max_epochs or 0)
    if limit <= 0 or steps_per_epoch <= 0:
        return StepPlan(requested_steps, requested_steps, steps_per_epoch, limit, False)
    allowed = max(1, math.ceil(limit * steps_per_epoch))
    if requested_steps <= allowed:
        return StepPlan(requested_steps, requested_steps, steps_per_epoch, limit, False)
    return StepPlan(allowed, requested_steps, steps_per_epoch, limit, True)
