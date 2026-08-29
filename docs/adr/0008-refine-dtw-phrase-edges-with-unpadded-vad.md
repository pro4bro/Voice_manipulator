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
short-silence detection. Group DTW words by natural phrase gaps and linearly
map a group onto overlapping acoustic speech edges only when the start/end
shift and duration scale stay inside conservative bounds.

Record refined words as `faster-whisper-dtw+silero-boundary`. If the boundary
pass fails or a candidate would require an implausible stretch, retain the
original DTW timestamps and provenance.

## Consequences

- Recognition text quality and model configuration do not change.
- Phrase onset/offset matches visible waveform speech much more closely.
- DTW still owns relative boundaries inside a phrase; this is not a substitute
  for future phoneme-level forced alignment of a user-supplied script.
- Existing completed assets must rerun finalized STT to receive refined timing.
