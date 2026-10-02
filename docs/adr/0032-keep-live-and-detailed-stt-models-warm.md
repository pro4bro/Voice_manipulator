# ADR 0032: Keep live and detailed STT models warm on large GPUs

Date: 2026-10-03
Status: Accepted at two-track physical OBS restart level

## Context

LiveLink uses `medium` for frequent live recognition and `large-v3` for
detailed STT. Studio previously held one `WhisperModel`, so concurrent jobs
alternated model construction even when the GPU had room for both. In a fixed
five-request benchmark, the second and third `medium` requests each spent
about 3.2 seconds, and the second `large-v3` request spent 10.4 seconds.
This contributed to caption backlog during the 12D API restart test.

## Decision

Studio retains up to two models by name, device and compute type when CUDA
reports at least 20 GiB of total memory and 6 GiB free before loading another
model. Other devices keep the previous one-model policy. The least recently
used model is evicted before loading a third model or when headroom is low. If
allocation still fails with an out-of-memory error, Studio clears the cache
and retries the requested model once. A failed retry remains a visible error.

The model cache is process-local; it does not alter project media or the
recognition result format. Studio status reports loaded model names, successful
model load count and the last load duration for diagnosis.

## Evidence and limits

The same five-request sequence after the change took 0.619 and 0.556 seconds
for the repeated `medium` calls, and 5.875 seconds for the repeated `large-v3`
call. Studio reported two model loads and both models resident. The benchmark
used local speech fixtures, not a controlled GPU isolation environment.

A 172.806-second physical two-track OBS take kept `medium` live STT and
`large-v3` detailed STT running through a detached FastAPI restart. Estimated
post-restart caption delay medians fell from 11.689/12.715 seconds in 12D to
0.923/1.764 seconds; maxima were still 16.029/10.912 seconds. Two-track PCM,
the final MKA, live checkpoints and detailed publication were complete. These
different takes are not a strict causal latency benchmark; Studio process
reuse, GPU contention, speech timing and PCM ingress also affect delay.

The 20/6 GiB thresholds are conservative guardrails, not measured universal
capacity limits. An active request can still hold a model after cache eviction;
if GPU allocation fails again after the retry, the request fails visibly.
