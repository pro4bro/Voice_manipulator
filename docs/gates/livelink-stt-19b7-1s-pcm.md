# LIVELINK-STT-19B7 — 1.1-second boundary with preserved quiet PCM

Date: 2026-10-05. This is one isolated candidate replay against the frozen 19A
Vietnamese corpus: 16 utterances, two tracks, medium model, 4-second window,
and 250 ms paced chunks. It used the 19B4 PCM-preserving adapter and set its
instance `silence_seconds` to 1.1 in a separate profiling process. No product
default or production source changed.

## Result

The candidate produced 16 listening/final utterances, down from 29 in the 19B6
0.5-second baseline; partial events fell from 56 to 52. Recognizer calls fell
from 85 to 68. This confirms fewer segments on this corpus.

Recognition got worse than 19B6: CER rose from 19.62% (393/2,003 edits) to
20.92% (419/2,003), and whitespace-syllable WER rose from 24.19% (149/616) to
26.14% (161/616). CER remains above its 15% budget; WER remains within 30%.
There were zero silence insertions and zero event errors. All 16 final event
spans match their recognizer-input frame totals, and all 16 frozen source hashes
are unchanged.

The earlier 19B3 run also used a 1.1-second boundary, but dropped internal
sub-threshold quiet PCM. Its recognition result therefore tested a different
input and does not substitute for this candidate.

## Timing limitation

The replay overlapped the full backend pytest run, which started around 09:48.
At the end of this run Studio reported both `tiny` and `medium` loaded, with a
model load count of 2. Thus measured source-end p95 of 33.234 seconds, last
chunk offer p95 of 32.859 seconds, semaphore wait p95 of 10.609 seconds, and
per-final-session HTTP time p95 of 20.422 seconds are retained as diagnostic
observations only. Do not attribute them to the boundary change or compare them
as a performance verdict against 19B6. No repeat was run.

The candidate is rejected for product adoption because recognition quality
regressed. Keep the 0.5-second product default. Full LiveLink acceptance stays
open for the 19A CER budget, reviewed word timing anchors, and physical OBS
latency evidence. This paced replay does not measure physical OBS-to-browser
latency.

## Artifacts and checks

The aggregate is `docs/gates/livelink-stt-19b7-1s-pcm-metrics.json`. The ignored
`.scratch/livelink-stt-19b7/run-1-1s-pcm/` directory contains raw final events,
all recognizer timing rows, event persistence timings, the chunk offer schedule,
the frozen corpus manifest, and derived metrics. The isolated driver is
`scripts/profiling/livelink_stt_19b_1s_pcm_context.py`; it delegates to the
header-only timed harness used for 19B6.

Checks: the driver compiled with `.venv/Scripts/python.exe -m py_compile`; Studio
health/status reported CUDA/float16 and cached medium before replay; the replay
completed with 16 final events and zero recognizer/event errors; 16/16 source
hashes and 16/16 recognizer source spans matched. Timing comparison is limited
by the concurrent backend suite, as described above.
