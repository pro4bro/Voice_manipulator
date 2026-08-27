# ADR 0007: Preserve Source Word Timing Instead Of Fabricating Alignment

## Status

Accepted

## Context

The compatibility STT sidecar can occasionally return malformed per-word
intervals: one word may cover many seconds while neighboring words collapse to
milliseconds. Stretching, redistributing, or visually imposing a minimum width
would make the Timeline appear tidy but would claim speech timing the app does
not know.

## Decision

Store the recognizer’s valid timestamps unchanged and evaluate only their
structural quality. Mark anomalous data as `needs-alignment`; do not drive
word-by-word Timeline highlighting or timed SRT export from it. An explicit
forced-alignment processor is the only component allowed to replace timing with
aligned timing later.

## Consequences

- Good source timing remains lightweight and immediately usable.
- Bad timing is visible to the user rather than silently converted into false
  subtitle timing.
- A future aligner can be added behind an adapter without changing Script,
  Timeline, or subtitle export contracts.