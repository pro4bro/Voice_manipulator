# LIVELINK-INGEST-18C2 — width-two group screening rejected

2026-10-04; parent 18C integration and budget choice remain open. User requested
continuing 18B and 18C; this follows the 18B2 raw-descriptor rejection. No product,
plugin, pairing, running owner API or source format changes.

Hypothesis: limiting concurrency to two independent sources might retain group
throughput while bringing per-pair latency under frozen ACK thresholds. Use the
existing two-fsync pair writer, not a mocked/unsynced writer. Sixty groups from
six sources, 360 pairs per variant; alternate serial/two-pair order per group.
Source catalog matches original 18C exactly:
60805281fadd1f8e717b4bdf011a757cb5ea757b330cf2c635380e1c6b888fd4.
Fresh E: destinations, pair/group boundaries retained, both files synced, PCM
published before metadata, every persisted pair checked, original pairs reread
unchanged. Storage probes run serially; no other agent benchmark or test suite
runs during measurement. Ordinary system/owner workload is not claimed idle.

| Width | Group total | Group p50/p95 | Pair p50/p95 |
| ---: | ---: | ---: | ---: |
| 1 | 38.666s | 628.423/851.574ms | 83.932/134.713ms |
| 2 | 32.776s | 480.087/752.727ms | 137.801/282.156ms |

Group wall reduction 15.23%, below frozen 30%; pair p50/p95 fail <=100/150ms.
This is a storage screen, not HTTP ACK latency or full 2524-chunk replay. Reject
width two for integration under frozen budgets. Do not compare this control's
wall time directly with the older width-six session to infer an improvement:
storage state/background scheduling vary. The same-run rotated control is used.
Width six's older 53.15% throughput result remains feasibility only; its p95
635.725ms still fails frozen limits and no public API/transport change is shipped.

Tool now accepts bounded unique widths 1/2/3/6, requires serial control, rotates
order, reports frozen screening verdict, blocks original-recording output and
verifies unchanged originals after the run. Existing default widths stay 1/3/6.
Reproduce: scripts/profiling/livelink_group_durability.py --output <fresh-E-folder>
--groups 60 --widths 1 2. Raw evidence is retained under
.scratch/livelink-ingest-18c2/width-two; companion JSON records exact results.

Validation: python -m pytest scripts/profiling/tests/test_livelink_storage_probes.py
-q: 6 passed, 1.16s. Tests cover partial raw writes, both fsyncs before ordered
publication, failed metadata sync publishing neither file, invalid width sets
and refusing the source directory. Both profiling commands executed real media
storage and verified bytes. No product source changed, so full backend 561,
frontend 477/56 files, typecheck/build from 9c88c92 carry; no redundant rerun is
counted as new product evidence. Whitespace checks pass.

The user was asked whether to retain ACK p95<=150ms or assess group integration
against waveform<=3s and non-growing warmed backlog, always retaining durable
ACK. No answer was received when recording this gate; frozen budgets remain.
Even an approved budget change would require full HTTP replay, delayed-writer
control responsiveness, lifecycle/crash/duplicate tests and physical six-source
OBS clocks before integration; a storage screen cannot substitute for those.

18B and 18C remain open, scheduled count stays ten. Exact next within ingestion:
LIVELINK-INGEST-18D storage/transport design decision and a new bounded candidate;
it is a proposed follow-up, not an implemented/accepted protocol. If all frozen
limits remain, another design must first demonstrate plausible two-fsync
throughput/ACK on this E: volume. If user chooses end-to-end criteria, record the
new approved thresholds before any group integration measurements. No phase
advances or speculative durability/latency improvements are claimed.
