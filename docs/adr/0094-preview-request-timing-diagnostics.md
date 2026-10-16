# 0094 — Separate request timings from persisted preview render time

Accepted2026-10-17, round36.

Preview packets expose additive `previewDiagnostics` in milliseconds: cacheHit,
lock wait, cache check, renderer, artifact validation and packet duration. The
draft preview route also reports candidate/handler duration and Server-Timing.
These are ephemeral request measurements; never persist them as audio provenance.
The saved report's processingSeconds describes its original render, even on a
later cache hit, and must not be used as current request latency.

Profiling uses existing natural Vietnamese8s PCM in an isolated project. Direct
renderer timing under cProfile locates CPU costs but includes profiler overhead;
HTTP timing is separately measured without cProfile. Compare identical operation
lists and fresh artifacts, not a cold baseline to a cache hit. None of these
measurements includes browser pointer debounce, waveform loading or playback.
