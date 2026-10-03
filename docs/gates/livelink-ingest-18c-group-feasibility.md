# LIVELINK-INGEST-18C — group feasibility, 2026-10-04

**Measured; integration and budget decision remain open.** No product, native
binary, pairing or original media changes. The existing two-fsync pair writer
is used without monkeypatching. This does not pass the frozen 18A ACK budgets.

## Owned experiment

60 groups, each containing the same sequence from six independent retained
UX-10B sources, are persisted with concurrency 1, 3 and 6. Each variant writes
360 pairs to fresh E: folders. Variant order rotates for every group. Every
source PCM hash/size and every persisted PCM/metadata pair is verified. Input
catalog: `60805281fadd1f8e717b4bdf011a757cb5ea757b330cf2c635380e1c6b888fd4`.
This is a storage feasibility subset, not the frozen full HTTP replay.

| Concurrent pairs | Total group wall time | Group p50/p95 | Pair p50/p95 |
| ---: | ---: | ---: | ---: |
| 1 | 61.151s | 830.096/2000.117ms | 113.434/352.849ms |
| 3 | 43.315s | 572.382/1592.962ms | 239.698/666.914ms |
| 6 | 28.652s | 414.667/732.263ms | 314.842/635.725ms |

Concurrency six reduces group wall time **53.15%**, but increases individual
pair latency. It is promising for backlog throughput and fails the frozen
<=100/150ms ACK p50/p95 requirement even before API/network/STT work. Do not
claim group throughput as a live latency improvement or ship a protocol solely
because its total is lower. Both fsyncs and ordered publication are preserved.

Raw output: ignored `.scratch/livelink-ingest-18c/groups/report.json`.
Committed metrics: `livelink-ingest-18c-group-metrics.json`.

## Budget decision

The human was asked whether to retain every 18A threshold or assess this
direction by actual audio-to-waveform <=3s and a non-growing warmed backlog,
without weakening data durability. This is a material change to an earlier
agent-selected ACK budget, not an answer inferred from elapsed time. Until an
answer arrives, all frozen thresholds remain in force and integration is held.
No native live gate or candidate package is claimed accepted.

## Conditional contract draft — not an implemented API

If this direction is authorized, first review and test this contract:

- Optional V3 capability negotiation advertises a bounded batch limit of six;
  absent capability uses the existing single-chunk endpoint unchanged. Old
  plugins keep using the existing API; new plugins fall back with old APIs.
- One request belongs to one install/connection/epoch and one recording. It
  contains at most one chunk per source channel, retaining the existing
  source UUID, sequence, sample index, rate, audio channels, monotonic timing,
  size and hash validation. No same-source reordering or speculative ACK.
- A bounded binary envelope uses a length-prefixed JSON catalog followed by
  PCM blocks. Catalog and aggregate body limits are checked before allocations
  or filesystem work; each PCM remains <=MAX_CHUNK_BYTES. Maximum six pairs,
  bounded writer count and bounded buffering; no persistent media format change.
- Lifecycle/Stop/finalize exclusion remains under the existing recording and
  runtime locks while independent pairs are prepared. Do not weaken those
  locks to obtain a benchmark result. Control/health responsiveness must be
  measured with an intentionally delayed writer.
- Result identities explicitly include channel and sequence. A durable ACK
  requires both files successfully fsynced and PCM published before metadata.
  Per-chunk failures cannot be acknowledged or deleted from the native spool.
  Auth/epoch/decode failures retain the whole request; valid partial commits
  can safely replay using existing immutable duplicate validation.
- Native selection takes only the oldest pending chunk for each included
  source in the same recording. Unacknowledged or rejected bytes stay retained.
  A failed/corrupt/unsupported batch response must not assume success; preserve
  fallback, resync, deleted-recording protection and crash replay semantics.
- STT offers follow committed source sequences. Pause intervals, archive,
  analysis and source provenance remain unchanged. No disk/network callbacks.
- Before release: full frozen replay and six-source physical OBS capture,
  startup/Stop/partial-failure/duplicate/crash tests, media hashes and automatic
  Media Pool handoff. Measure per-chunk receipt, actual callback queue age,
  waveform and captions separately, with the agreed budgets recorded explicitly.

No contract is approved for integration until its budget choice is resolved.

## Validation

Full backend **516 passed**, two existing deprecation warnings, **417.62s**.
The first simultaneous frontend run failed before 38 fork workers initialized
(17 files / 133 tests ran); it is not reported as a passing full suite. After
backend finished, a full frontend rerun with `--maxWorkers=4` passed **55 files /
468 tests**, **30.30s**. Typecheck and production build pass (**280ms** Vite).
No tests were filtered or skipped and no product/test configuration changed.
The precise cause of worker startup timeouts is not attributed to product code
or memory without evidence. Profiling scripts parse and whitespace checks pass.

While the budget answer is pending, the next independent existing round is
**LIVELINK-08N** (depends on 18A), exposing truthful outbox health and recovery.
18B/18C integration acceptance remains open; other rounds are not declared done.
