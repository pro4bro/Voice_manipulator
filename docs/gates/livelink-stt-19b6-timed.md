# LIVELINK-STT-19B6 — timed latency attribution

Date: 2026-10-05. This offline paced replay uses the same frozen 16-utterance,
two-track 19A corpus, the 19B4 PCM-preserving product adapter, the medium model
with Vietnamese, a 4-second recognition window, a 0.5-second silence boundary,
and 250 ms source chunks. Studio reported CUDA/float16 before inference and
loaded the cached medium model once. No model download, product setting change,
OBS source, or physical OBS-to-browser latency measurement was involved.

## Valid replay

The valid run is `.scratch/livelink-stt-19b6/run-3-corrected/`. It completed in
116.610 seconds for 116.454 seconds of source audio. It produced 29 listening,
56 partial, and 29 final events with zero event or recognizer errors. All 16
curated source hashes remained unchanged. All 29 final event spans equal the
total recognizer-input frames for their session.

The earlier `run-1` remains preserved but its timing is invalid: full JSON
probe snapshots were synchronously rewritten from the live replay path, which
stalled the event loop. The first `run-2-batched` replay also remains preserved;
it stopped with 26 final and 50 partial events, and its cause is unknown. No
latency conclusion uses either run.

For run-3, timing rows accumulated in memory during the replay and the JSON
probe artifacts were written after capture ended. WAV validation read only
header metadata on the request path; the detailed PCM integrity check remains
the one recorded in 19B4. The product adapter's own final-event persistence
still ran normally and was timed through completion of `_append_event`.

| Measure | p50 | p95 | max | Meaning |
| --- | ---: | ---: | ---: | --- |
| Onset to persisted final event | 8.797 s | 16.516 s | 19.563 s | Includes the utterance's audio duration; not post-end latency |
| Last source chunk offer to persisted final | 4.032 s | 6.734 s | 7.828 s | Monotonic time from actual replay offer of the final source chunk |
| Intended source-clock end to persisted final | 4.110 s | 6.891 s | 7.875 s | Uses replay epoch plus final sample index / 48 kHz |
| Semaphore wait, summed within final session | 0.640 s | 1.578 s | 1.906 s | Time waiting to enter serialized model calls |
| Recognizer HTTP time, summed within final session | 2.047 s | 4.610 s | 4.937 s | Request-to-response time; excludes semaphore wait |
| Final-event append and persistence | 0.078 s | 0.188 s | 0.328 s | Time awaiting the product adapter's event append |

The intended source-clock-end p95 is below the 8-second post-end diagnostic
threshold. The onset-to-final p95 remains 16.516 seconds because that measure
includes source speech duration; it is not comparable to a post-end threshold.
The 932 scheduled chunk offers had a source-clock skew p95 of 0.313 seconds and
maximum of 0.610 seconds. Across all 85 recognizer calls, semaphore-wait p95 was
0.890 seconds and HTTP elapsed p95 was 1.360 seconds.

## Recognition gate

The scorer returned CER 19.62% (393/2,003 character edits) against a 15%
maximum, so the CER gate still fails. Whitespace-syllable WER was 24.19%
(149/616 edits) against 30%, which passes that budget. Track 1 CER was 21.39%;
Track 2 CER was 18.35%. Silence insertions were zero. Timing accuracy remains
unmeasured without reviewed word anchors. The timed replay therefore closes
latency attribution only; it does not close 19A speech-quality acceptance.

The timing data show both serialized-model wait and recognizer service time
remain measurable contributors, while event persistence is comparatively
small. This does not justify removing or widening the semaphore. The next
bounded hypothesis is one isolated replay of a 1.1-second silence boundary
using the repaired 19B4 PCM-preserving adapter. The earlier 19B3 attempt used
the same boundary while dropping sub-threshold internal quiet, so it did not
test this combination. Compare fragmentation count, CER/WER, and this same
post-end timing on the frozen corpus and budgets. Keep product defaults frozen;
do not infer physical OBS latency from this replay.

## Artifacts and verification

Aggregate: `docs/gates/livelink-stt-19b6-timed-metrics.json`. The ignored run
directory contains final events, all recognizer-call timing rows, event append
timings, the source offer schedule, corpus WAVs and hash manifest, and the
derived metrics. The harness is `scripts/profiling/livelink_stt_19b_timed_context.py`.

Checks run: `.venv/Scripts/python.exe -m py_compile
scripts/profiling/livelink_stt_19b_timed_context.py` passed; a header-only WAV
probe returned mono PCM16/24 kHz/96,000 frames for the 4-second fixture; the
16 frozen source hashes matched; 29/29 recognizer input frame totals matched
the final source spans; all metrics and event artifacts parsed; the paced
replay completed on the cached medium model without errors. No backend, frontend,
or product settings were changed for this profiling round.
