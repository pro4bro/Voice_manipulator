# 0095 — Count PCM clipping endpoints without a per-frame Python generator

Accepted2026-10-17, round37.

Profiling identifies the PCM clipping scan as a meaningful CPU cost. Use native
signed-array counts for the exact two clipping endpoints(-32768 and32767).
Do not count byte substrings: they can straddle sample boundaries and produce
false positives. No threshold, rejection policy, render parameters or PCM changes.

Compare the original predicate and typed counts on identical PCM, including a
long deterministic mixed signal. Real natural-speech WAVs rendered before/after
must match byte-for-byte. cProfile overhead makes its total time unsuitable for
a user latency claim; paired unprofiled scan timing isolates this optimization.
FFmpeg/process/artifact IO remain separate bottlenecks and the250ms gate remains.
