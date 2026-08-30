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

## 2026-08-30 Re-Test Of The Forced Alignment Rejection

The 2026-08-29 note above rejected the default WhisperX Vietnamese aligner. That
judgement was correct but its stated cause was incomplete, and because nobody
could re-run it, it stood unexamined while the runtime changed around it. It has
now been re-measured with `scripts/probe_forced_alignment.py` against the 236
second `conviction` sample, scoring how far each phrase-opening word sits from
the unpadded Silero speech onset.

| Timing source | mean | median | p90 | conf > 0.3 |
| --- | --- | --- | --- | --- |
| DTW as shipped | 107 ms | 50 ms | 230 ms | n/a |
| `wav2vec2-base-vi-vlsp2020` (WhisperX default) | 1051 ms | 251 ms | 2560 ms | 0.0% |
| `wav2vec2-base-vietnamese-250h` | 188 ms | 35 ms | 358 ms | 89.3% |
| `mms-300m-1130-forced-aligner` | 1071 ms | 349 ms | 3418 ms | 58.5% |

Three things follow.

The default model is **mis-loaded, not unsuitable**: it carries a
`feature_transform` head that `Wav2Vec2ForCTC` silently discards, which is why
its confidence sits at 0.011. ADR-0007 read that as evidence against forced
alignment for Vietnamese. It was evidence against that checkpoint under that
loader. Any future attempt should start from the 250h checkpoint.

MMS-300M expects romanized input. Vietnamese diacritics fall outside its
vocabulary and WhisperX does not romanize, so it degrades to noise here.

The best candidate is **better in the middle and worse in the tail**: median
onset error improves from 50 ms to 35 ms, but the mean rises from 107 ms to
188 ms and p90 from 230 ms to 358 ms. Gating on the aligner's own confidence does
not rescue it - at a 0.7 floor the median reaches 26 ms while the mean stays at
177 ms, and raising the floor to 0.9 makes every figure worse. The outliers are
therefore words the aligner is *confidently* wrong about, which is worse for this
application than a word it is unsure of: nothing downstream can detect them.

## Decision

Do not replace DTW timing with forced alignment on this evidence. The recogniser
keeps ownership of word boundaries, as this ADR already requires.

This is a measurement on one 236 second sample with 31 speech spans, scored
against a VAD proxy rather than human-marked ground truth. It is enough to
decline spending the integration work; it is not enough to conclude that forced
alignment cannot help. Re-run the probe before revisiting - that is what it is
for.

Forced alignment of a user-supplied known script remains a separate contract in
Phase 03. That processor answers a different question - did the speaker read what
the script says - and does not depend on beating DTW on onset accuracy.
