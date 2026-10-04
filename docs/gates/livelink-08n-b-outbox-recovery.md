# LIVELINK-08N-B: Scoped retained PCM recovery

Date: 2026-10-04. Parent LIVELINK-08N health/recovery/outage criteria complete
at this measured scope; no overall capture latency or speech-quality claim.

## Delivered contract

- GET `.../recordings/{recordingId}/outbox` returns scoped retained/rejected
  counts and a rejected metadata/PCM digest.
- POST `.../outbox/retry` requires that digest, rejects stale snapshots and
  clears only the selected stopped recording's rejected flags. It returns
  `durablyAccepted: false`; native replay still requires durable HTTP ACK.
- POST `.../outbox/export` atomically publishes a project-owned recovery ZIP
  under `exports/obs-outbox`, then downloads it. It includes exact PCM, metadata,
  clocks, hashes and source journal. It never consumes rows or creates footage.
- Unknown/deleted/mismatched/non-stopped journals are rejected. Existing recording
  locks serialize deletion/recovery; short runtime validation does not block
  other takes throughout export. SQLite FULL/BEGIN IMMEDIATE and two-second busy
  waits serialize recovery writes with the native worker. Legacy clocks stay null.
- Bounds: 10,000 rows, 256 MiB total PCM, 32 MiB per row. Explicit errors retain
  originals. UI actions identify retry as pending acceptance and keep failures
  visible across successful status polls. See ADR 0042.

## Actual isolated OBS/API outage

Private portable OBS 32.2.2, packaged plugin **0.6.10**, private config/pairing,
project/data and owned ports 18120/4466; both ports were free before launch.
Six retained UX-10B tone files were read without changing them or owner media.
Uvicorn uses real connection/runtime/audio/archive adapters. Only STT offer/finish
are stubbed in this capture resilience fixture; no GPU/model/recognition claim.

- Recording ID `063bc7f1-2c8b-5c15-8104-e10b50a9c194`; duration **85.9764133s**.
- API unavailable **93.859s to readiness**, with 75s of continued recording
  before OBS Stop while offline. Snapshot retains **403 chunks / 103,654,400
  PCM bytes** across six sources. Later retained rows are included in the full
  **445-row** catalog; previously ACKed rows remain in the project.
- A controlled valid PCM row is quarantined with status 422 to exercise repair.
  Export while OBS is offline preserves **432 chunks**, ZIP **109,402,033 bytes**,
  with every entry's byte/hash validation. Restarted OBS retains the rejection
  until scoped retry; retry returns one reopened row and no durable acceptance.
- Native drains the stopped take after API and OBS restart. **343 retained rows
  inside Record** match their saved source PCM byte-for-byte; six Stop-boundary
  rows match exact expected prefixes. **102 rows after Stop** are excluded by
  existing explicit Stop trimming, not classified as lost in-record PCM. The
  raw recovery ZIP preserves the exported snapshot, including such raw tail data.
- Final native outbox is **0**; all in-record retained rows exist durably. Native
  ACK/retention regressions additionally prove rows are not consumed by reads,
  retry, failed transactions or missing ACK. Stop trimming remains its separate
  established exception for audio outside the requested recording interval.
- Six source chunk sequences have **zero internal sample gaps**. No overflow
  log is attributed to this recording. **265 idle overflow entries / 13,112,832
  idle frames** are excluded; these represent bounded idle queues after restart,
  not this recording's loss. Source-absence intervals at initial attachment
  remain in the journal; this does not claim a loss-free startup.
- MKA has **six FLAC streams**. All six actual WAV analyses exist, mono/24kHz/
  PCM16, durations within 1ms of the recorded interval; measured frequencies
  **330/440/550/660/770/880Hz**, peaks **6000–6332**, no clipping. Artifact hashes,
  full journal/probe and monotonic evidence: `livelink-08n-b-outbox-metrics.json`.

### Harness failures retained honestly

First fixture bootstrap omitted OBS WebSocket config and timed out; fixed only
the isolated config and retained that failed checkout under `failed-start-1`.
The first quarantine targeted a row already cached as native `outstanding`, so
its normal ACK consumed it and the harness assertion failed. This was not an
API loss/retry success. Restarted the same retained take, chose a non-cached row
before native restart, and completed export/retry/replay/artifact verification.
No product behavior was changed to accommodate those harness failures.

## Validation and installation

- Native RelWithDebInfo build/package pass; **2/2 CTest**, 6.03s. Existing
  upstream anonymous-union warnings remain. Version/manifest and actual fixture
  DLL hash agree. SQLite-FULL/rollback/legacy-byte checks from 08N-A remain passing.
- Recovery tests cover byte-preserving scoped retry, stale/deleted/project guards,
  ZIP/legacy provenance, ENOSPC staging, bounded export, concurrent WAL ACK/read
  snapshots, busy writers, HTTP download, and failed retry commit rollback.
- Full frontend **55 files / 473 passed**, 30.92s; typecheck/build pass (274ms).
- Final full backend **536 passed**, 193.91s, two existing audioop/Starlette
  deprecation warnings; includes failed retry commit rollback. Earlier full
  run before that additional fault regression: 535 passed, 169.34s.
- Owned OBS/API processes close and owned ports become free. Owner OBS was
  closed; ordinary installer Repair updates the installed **0.6.10** files to
  package hashes, `installed` status, pairing ready, **pairing bytes unchanged**.
  No Administrator prompt/token reset; owner OBS is not automatically opened.
  The running native binary is proved in the private fixture, not an owner session.

Ignored retained artifacts: `.scratch/livelink-08n-b/` contains gate/resume and
verification scripts, SQLite, exact PCM catalogs, ZIPs, logs and project artifacts.
No destructive cleanup of source artifacts, owner recordings or pairing occurs.

## Exact next / remaining gap

**LIVELINK-STT-19A** freezes reviewed multitrack Vietnamese speech, live/detailed
recognizer output, CER/WER, word timing, track-owned turns, padding and overlap
evidence for LiveLink and growing MKV. Tone recovery does not establish speech
accuracy. 18B/18C latency/integration and the pending human budget decision
remain open with their original thresholds; this round does not optimize them.
