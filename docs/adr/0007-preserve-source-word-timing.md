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

## 2026-08-29 Implementation Note

Finalized STT now obtains word boundaries directly from Faster-Whisper's
cross-attention plus dynamic-time-warping path at 20 ms acoustic-frame
resolution. The non-batched decoder is intentional: on the same Vietnamese
sample, batched decoding pulled a word onset backward across more than one
second of silence, while non-batched decoding preserved the gap.

Every trusted word records `timingSource: faster-whisper-dtw` and recognition
confidence. Legacy, provisional, or structurally plausible words without a
processor provenance are never upgraded to `source`; Timeline and timed SRT
hide/reject them until STT is rerun. If native decoding returns transcript text
without word boundaries, the app keeps the text but does not synthesize evenly
distributed timestamps.

The former default Vietnamese WhisperX CTC aligner is not used for finalized
word timing. In the validated runtime it both depended on an inaccessible NLTK
data path and produced near-zero-confidence, compressed word intervals after
that path issue was removed. Forced alignment of a user-supplied known Script
remains a separate Phase 03 processor contract.
