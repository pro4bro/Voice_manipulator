# ADR 0008: Refine DTW Phrase Edges With Unpadded VAD

## Status

Accepted

## Context

The real PDCA sample showed a repeated apparent offset: the first word of many
phrases began about 0.3–0.4 seconds before visible speech, while phrase endings
were already close to the waveform. MP3 and analysis-WAV clocks differed by
only about 23 milliseconds, so a global timeline offset would fix one phrase
and damage others. Faster-Whisper's recognition VAD intentionally pads speech
chunks, and native DTW occasionally assigns that leading padding to the first
word.

Reducing recognition VAD padding changed or dropped Vietnamese words in the
probe. That trades text quality for prettier timing and is not acceptable.

## Decision

Keep the recognition pass unchanged: `large-v3`, beam size 5, native
cross-attention/DTW word timestamps, and the established recognition VAD. Once
recognition completes, run Silero VAD a second time with zero speech padding and
short-silence detection. Group DTW words by Whisper `segmentIndex` first and by
a 0.20-second natural phrase gap second. Snap only the first word's onset and
last word's offset to the nearest Silero edge within ±0.40 seconds. Do not warp
the words between those edges.

Record only words whose boundary actually moved as
`faster-whisper-dtw+silero-edge`. If no nearby edge exists, retain the original
DTW timestamp and record explicitly in `word_timing_note` that refinement was
not applied.

## 2026-08-30 Measurement

The former 0.52-second gap produced 17 groups on the 236-second sample
(median 9.94 seconds, maximum 37.36 seconds) and refined only 6/665 words. On
the 9,881-second PDCA asset it produced 1,126 groups (median 4.72 seconds,
maximum 108.30 seconds) and refined 0/33,912 words. The conservative scale
guard correctly rejected linear warps across groups that long; grouping and
whole-group warping were the failed design assumptions.

## Consequences

- Recognition text quality and model configuration do not change.
- Phrase onset/offset can match visible waveform speech without changing every
  word in a long utterance.
- DTW still owns every middle-word boundary; this is not a substitute
  for future phoneme-level forced alignment of a user-supplied script.
- Existing completed assets must rerun finalized STT to receive refined timing.
