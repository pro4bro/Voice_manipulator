# LIVELINK-INGEST-18A — six-source profiling, 2026-10-04

This round changes no product behavior, installed plugin, pairing or user
project. It adds standalone profiling tools and freezes the 18B comparison.
Baseline product commit: `bfb326e`. Numerical results are retained in
`livelink-ingest-18a-metrics.json`; raw outputs are under ignored
`.scratch/livelink-ingest-18a/`.

## Workload and interpretation

The immutable UX-10B recording is
`f9495cf6-1881-51ce-9f46-f01bb6d18d1c`: six source identities, 2,524 chunks,
PCM16/48kHz/**two audio channels per source**. The older UX-10B narrative's
“mono” describes the analysis destination, not the retained native PCM format.
All input PCM sizes, hashes and sequences are checked before profiling. Twelve
source sample gaps match the previously verified two app-pause gaps per source.
This does not prove the beginning of capture was loss free.

Three independent fixtures separate costs:

1. Native callback/queue fixture uses the real `LiveLinkCapture::on_audio` and
   `take` paths with six stereo sources, 1,500 callbacks and a fixed 250ms queue
   hold. It verifies 720,000 continuous source frames and zero overflow. Its
   synthetic residence time is not microphone/scheduler latency.
2. Native outbox fixture loads all retained PCM into the real FULL/WAL
   `LiveLinkSpool`, appends batches of up to 32, reads and verifies every PCM
   and sample index, and durably acknowledges bursts of up to 20. The spool
   is empty at completion. It isolates storage cost, not worker scheduling.
3. Local Uvicorn/HTTP replay sends the same chunks, ordered by
   `(pluginMonotonicNs, channelId, sequence)`, into the real audio, waveform,
   capture checkpoint, media library and archive adapters. Each ACK must be
   durable and nonduplicate; its saved PCM is hash checked immediately. The
   stopped take is fully preloaded, so this measures saturated drain rather
   than a hardware Stop event. The fixture omits pairing, WinHTTP, OBS
   scheduling, STT and other background workers. It uses an OS-assigned
   loopback port, a new project/registry, and closes its server afterward.

The replay actually creates and verifies a six-stream MKA (including decoded
PCM equality, track identity and attachment), plus six mono PCM16/24kHz
analyses of the correct recording duration. Finalize timing includes stem
construction, first-pass analysis, MKA mux/verification and analysis from MKA;
nested timings must not be added twice. Concurrent fsync timings also overlap.

## Retained real recording evidence

- Native pending spool peaked at **878 chunks**. Before the first Pause it
  grew **1.543 chunks/s**; whole-take slope was **1.294 chunks/s**. Whole-take
  slope includes Pause and is not a steady active-capture throughput number.
- Capture-end to API ingress age: approximate p50 **233.705s**, p95
  **369.632s**, maximum **384.204s**, using the recording's UTC/monotonic
  anchor. This includes callback queue and outbox wait; the old log cannot
  separate their per-chunk residence times.
- Stop to last PCM **receive**: **325.194s**; last receive to ready journal
  mtime: approximately **36.272s**. `receivedAtUtc` precedes durable fsync,
  and mtime is not a logged ready event. Neither is presented as an exact
  native Stop-to-last-durable-ACK measurement. That clock remains a live gate.
- **99 idle overflow log entries are excluded.** Six entries tagged with this
  recording ID occur at startup and each reports an 8,192-frame delta. Their
  historical totals include pre-Record losses. Without discarded packet
  boundaries those six deltas remain unclassified; they cannot prove either
  recording loss or loss-free startup. Subsequent retained sequences have
  only the verified pause gaps.
- Historical peak queue/callback-wait counters include idle periods and are
  labeled accordingly in the metrics. Native HTTP log values are per-window
  averages/maxima, not individual-request p50/p95.

## Bottleneck and instrumentation

| Measured stage | Total | p50 | p95 |
| --- | ---: | ---: | ---: |
| API durable PCM/metadata pair | 297.839s | 97.376ms | 250.424ms |
| API chunk including all persistence | 378.779s | 125.869ms | 298.049ms |
| HTTP durable ACK | 388.860s | 129.959ms | 302.854ms |
| Native spool append, batches <=32 | 54.476s | 699.251ms/batch | 846.794ms/batch |
| Native ACK commit, bursts <=20 | 10.767s | 58.980ms/burst | 159.226ms/burst |
| Synthetic native callback | 110.793ms | 0.039ms | 0.072ms |

Full replay drain elapsed **417.734s**, including client construction, receipt
checks and gaps between requests. Last ACK to ready **48.860s**; finalize itself
**48.672s**. MKA mux **7.878s**, verification including decoded equality
**9.300s**, first-pass analyses **14.967s**, analyses from MKA **3.580s**; remaining
finalize work includes stem reconstruction and publication. All six analysis
PCM hashes equal the retained UX-10B analyses. The baseline fails the frozen
ACK and ready-time budgets below; it is a usable red performance baseline.

The synthetic callback maximum was **42.032ms**, although p95 was 0.072ms;
do not hide the outlier behind a mean. Its controlled queue-age p50/p95 were
257.802/298.768ms and zero overflow. These synthetic values cannot explain
the old recording's live callback queue age, which was not logged.

The selected 18B seam is **API per-chunk durable PCM/metadata publication**.
It dominates the measured API service time. Native outbox append/ACK costs
are reported separately; they remain part of the live system and are not
silently removed from its acceptance gate. No optimization is made in 18A.
The durable pair accounts for **78.63%** of API chunk time. Individual fsync
calls have p50 **86.062ms**, p95 **216.478ms** and overlap between two writer
threads. Atomic publication p50/p95 are **0.574/1.162ms**. Waveform envelopes
are atomically published and rebuildable, not fsynced; the consolidated metrics
correct the overly broad label in the raw initial profiling reports.

The instrumented/control probes replay the same first 120 chunks into fresh
destinations sequentially. They measure a **5.48% observed wall-time delta**
(18,329.538ms versus 17,377.670ms of HTTP ACK time). One disk-backed pair does
not isolate causal instrumentation overhead from cache, storage and scheduling
variation. A separate CPU timer microbenchmark reports the incremental cost
of two timestamps and wrapper dispatch. Initial probes have four stage
wrappers; the full baseline additionally times fsync and atomic publication.
All wrappers exist only inside the profiling process and are restored.

## Frozen 18B comparison — before optimization

Do not change these inputs/budgets after observing a candidate:

- Immutable source and metadata catalog SHA256:
  `8aac1c0901d2b9f703c5b6ca4e5ea99e8bbe573c0a03d85392b5bed934a80fd7`.
  Replay all 2,524 chunks in the same order, on the same E: volume, with the
  same FFmpeg executables and fresh output directories. Keep fixture probes
  identical and run disk-heavy baseline/candidate work serially. Reject a
  source/catalog mismatch. Compare against the full baseline metrics.
- Only modify the durable PCM/metadata publication seam. ACK still requires
  both files flushed and PCM published before metadata. Retain crash-safe
  duplicate validation; no file/network operations in callbacks. If this
  cannot meet the budget, record the failed result and review another round
  instead of also changing spool, STT or archive behavior.
- Saturated replay HTTP ACK p50 **<=100ms**, p95 **<=150ms**; ingress duration
  **<=70% of the frozen full baseline**. Six verified streams and six analyses;
  identical decoded PCM, sequence/sample boundaries and declared pause gaps;
  zero new unexplained gaps. Last ACK to ready **<=45s**.
- Actual OBS baseline and candidate use a separately owned six-tone fixture
  (330/440/550/660/770/880Hz), 48kHz stereo capture, all six Forward enabled,
  652.680s recording; app Pause at 119.814s, Resume at 497.669s, Pause at
  538.005s, Resume at 592.985s. Use the same runtime/STT configuration for both
  runs and record it; a replay with STT disabled cannot pass the live gate.
- After a 30s warmup, measure each active interval separately: backlog slope
  **<=0 chunks/s**, capture-end to durable ACK age p95 **<=3s**, native callback
  queue age p95 **<=1s**, exact Stop-to-last-durable-ACK **<=5s**, last ACK to
  archive/analysis ready **<=45s**. Include actual enqueue/dequeue, spool commit,
  response and ready clocks. Report callback p50/p95/max independently.
- All six sources produce verified artifacts and automatic Media Pool handoff
  without reload. Report waveform and caption receipt separately. Do not claim
  microphone latency or speech quality from this tone fixture.

## Reproduction

From the repository root, use the project Python:

```powershell
.venv/Scripts/python.exe scripts/profiling/livelink_ingest_18a.py --output .scratch/livelink-ingest-18a/new-baseline --finalize
cmake -S scripts/profiling -B .scratch/livelink-ingest-18a/native-build -A x64
cmake --build .scratch/livelink-ingest-18a/native-build --config Release
.scratch/livelink-ingest-18a/native-build/Release/profile-spool-18a.exe .scratch/livelink-ingest-18a/native-manifest.txt .scratch/livelink-ingest-18a/new-spool
```

The callback executable requires the owned OBS `bin/64bit` directory on PATH.
Outputs must be new folders. `summarize_livelink_ingest_18a.py` consolidates the
named baseline/probes and CSVs used in this gate; it does not profile production.

## Remaining gap

The measurement/decision slice is complete: full replay/artifact checks pass;
focused backend runtime/responsiveness suite **26 passed** (26.17s), two
existing deprecation warnings. Native profiling targets build in Release; the
capture fixture passes and the spool fixture verifies all 2,524 chunks and
ends empty. Python scripts parse; diff whitespace check passes. No frontend or
production source changes, so no full frontend/backend suites or plugin package
rebuild were needed. The installed application and OBS connection are untouched.

Exact live callback residence and native Stop-to-ACK clocks were not
retained by UX-10B. These and startup-overflow classification remain explicit
18B/live acceptance gates. Product latency has **not** been improved by 18A.
Exact next bounded round: **LIVELINK-INGEST-18B**.
