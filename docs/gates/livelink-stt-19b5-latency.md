# LIVELINK-STT-19B5 — retained-trace latency attribution

Date: 2026-10-05. Offline-only diagnosis over the ignored
`.scratch/livelink-stt-19b4/run-1/` trace. No model inference, Studio/runtime
request, OBS session, UI automation, or product source change was made.

## Finding

The 19B4 `lagSeconds` field is measured in
`ObsLiveLinkTranscription._append` as `time.monotonic() - utterance.queued_at`.
`queued_at` is initialized from the first audio chunk's queue time. The final
event therefore reports onset-to-event time, which includes the utterance's
source audio span. It is not a measure of time after the last source sample.

Across 29 final events, the retained onset-to-final-event lag has a 9.906 s
median and 21.015 s p95 (the gate reports p95; the arithmetic mean is 10.354 s).
The final source span median is
5.750 s and p95 is 12.000 s. Subtracting span from lag gives 3.344 s median and
10.218 s p95, but this is only a diagnostic subtraction: the first chunk's
queue timestamp and source start differ within the 250 ms cadence, and there
are no event wall-clock timestamps. Thus the 21.015 s figure overstates
post-source-end delay by utterance duration, while the remaining actual delay
cannot be recovered exactly from this trace.

The 85 persisted successful recognizer calls record HTTP elapsed time: 56 live
chunk calls total 60.797 s (median 0.946 s, p95 2.125 s), and 29 final flushes
total 8.981 s (median 0.281 s, p95 0.547 s). These HTTP durations exclude time
waiting to enter the adapter's shared `asyncio.Semaphore(1)`. The trace stores
no request start times or semaphore-wait durations, so it cannot attribute
queue delay between adapter serialization and Studio processing. The adapter
does serialize recognizer calls across tracks, but the trace does not prove
that changing this would improve latency or remain safe for the shared model.

## Recommendation

This evidence supports a latency-accounting correctness follow-up, not a
performance change. If the Lead approves product instrumentation, the minimal
candidate is to retain existing `lagSeconds` unchanged for compatibility and
add monotonic checkpoints for utterance-end detection, semaphore wait start and
acquire, HTTP request start and return, and event persistence. Report
post-source-end delay separately from onset-to-event duration; do not alter PCM,
source sample coordinates, 250 ms cadence, medium model, language, segmentation
threshold, window, scorer, or budgets. This will identify whether serialization
or Studio service time is the actionable bottleneck before considering a
concurrency change.

Expected latency reduction from this measurement candidate is **0 seconds**; it
improves attribution only. No performance candidate is justified yet. Removing
or widening the one-per-adapter semaphore is unproven and could increase GPU
contention; the retained trace has no lock-wait measurement to bound its effect.

The offline analyzer is `scripts/profiling/livelink_stt_19b_latency.py` and
writes the companion metrics file. Run it without a Studio/runtime dependency:

```powershell
.venv/Scripts/python.exe scripts/profiling/livelink_stt_19b_latency.py
```

It confirms 29 finals and all 85 request rows against the retained aggregate
metrics. No CER/WER rescore was performed; recognition inputs and scoring are
unchanged, so the existing 19B4 budgets remain open and unclaimed.
