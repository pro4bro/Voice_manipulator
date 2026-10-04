# LIVELINK-STT-19B4 — preserve internal quiet PCM

Date: 2026-10-05. Owner-running STT Studio reused at `127.0.0.1:18081`; no
Studio restart or isolated service. This bounded repair preserves sub-threshold
quiet PCM only when speech resumes. It retains the existing 4-second window and
0.5-second silence boundary. It does not alter queueing, recovery, project data,
source timing, or external API formats.

## Regression and repair

The regression sends voiced 250 ms PCM, one 250 ms zero-PCM chunk, another voiced
250 ms chunk, then 500 ms of trailing zero PCM. Before the repair, the recognizer
received 24,000 frames (0.5 seconds) instead of the 36,000-frame source span; the
internal quiet chunk had been discarded. The regression also checks mono PCM16,
48 kHz format and that the final event ends at the last voiced sample (0.75 s),
excluding the trailing 0.5 seconds.

The active utterance now keeps unconfirmed silence PCM pending. If voice resumes
before the unchanged 0.5-second threshold, it appends those bytes and frame count
to recognizer input. If the threshold is reached or the stream ends, pending
silence stays trimmed as a boundary. No persistent format or public API changed.

## Frozen 19A live replay

Replayed the same 16 curated Vietnamese utterances, two tracks, medium model,
Vietnamese language and 250 ms paced cadence against the fixed product adapter.
The medium model was already cached locally; the runner checked the cache and
made a separate warm-up import before capture. Studio reported CUDA/float16 ready
and no model error. Each recognizer WAV input was checked as mono PCM16/24 kHz;
input PCM hashes, peak/clipped-sample counts, source hashes and per-final source
frame coverage are in the companion metrics and ignored scratch output.

| Measure | Warm 19A persisted baseline | Fixed adapter replay | Budget |
| --- | ---: | ---: | ---: |
| Live CER | 22.97% (460/2,003) | 19.62% (393/2,003) | <=15% |
| Live whitespace-syllable WER | 26.62% (164/616) | 24.19% (149/616) | <=30% |
| Final event lag p95 | 14.344 s | 21.015 s | <=8 s when measured at real cadence |
| Final spans matching recognizer-input/source extent | Not retained in baseline | 29/29 | All |
| Event-level request errors | 0 | 0 | 0 |

Character edits dropped by 67 and syllable edits by 15. Track results are mixed:
Track 1 CER changed from 19.12% to 21.39%, while Track 2 changed from 25.73% to
18.35%. The final-event lag value is a paced adapter replay measurement from the
first queued sample through final event persistence; it is not physical OBS to
browser latency. The replay took 119.390 seconds for 116.454 seconds of audio.

The original 16 curated clip hashes were unchanged. All 56 recognizer WAV input
payloads passed format checks, had zero clipped samples (maximum absolute sample
30,262), and produced 29/29 final event sample spans equal to summed recognizer
input frames. The targeted regression confirms the intervening quiet PCM bytes
are preserved exactly and trailing silence remains excluded.

## Disposition

The data-loss repair is verified, but 19A acceptance remains open: live CER
exceeds 15% and final-event lag p95 exceeds 8 seconds. Timing accuracy, silence
insertions from reviewed audio, seam/overlap review, physical OBS clocks and
owner-approved budgets are still separate gates. This round does not change
recognition settings or relax thresholds.

Artifacts: ignored `.scratch/livelink-stt-19b4/run-1/` contains the frozen corpus,
recognizer request metadata/hashes, event history, derived WAVs, media-integrity
checks and score. The tracked companion `livelink-stt-19b4-pcm-context-metrics.json`
contains aggregate evidence without transcript text.
