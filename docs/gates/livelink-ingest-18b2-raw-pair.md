# LIVELINK-INGEST-18B2 — raw descriptor pair rejected

2026-10-04, starting checkout 9c88c92, clean. Follow-up within 18B's pair writer
scope, not an accepted replacement for its full replay/physical OBS gate.

Hypothesis: Python buffering/file-object setup contributes material pair cost.
Screen baseline vs os.open/os.write descriptor preparation; both use two workers,
two fsync calls, wait for both writes, close handles, publish PCM then metadata.
The candidate loops on partial writes and fails on zero progress. It does not
use write-through/close as a substitute for durable flush. No product patch.

Fresh E: destinations; alternate variant order for 60 pairs, first ten sequences
from six retained UX-10B sources. Every source PCM hash/size is verified, every
persisted pair is compared byte for byte, original inputs are reread unchanged.
Subset catalog SHA256 1fb37a64bd702ba9132551572276f5e0a7459daa1e700efba2653b21ba98c7e8.
This is a screening subset, not the frozen full 2524-chunk workload.

| Variant | Total | p50 | p95 |
| --- | ---: | ---: | ---: |
| Current buffered writer | 4663.421ms | 77.207ms | 107.669ms |
| Raw descriptors | 5098.945ms | 78.181ms | 123.844ms |

Raw candidate is 9.34% slower; screening command exits 1. Pair percentiles alone
are not HTTP ACK percentiles. The frozen 30% drain reduction is not plausible
from this candidate, so reject before full replay/OBS and keep production writer
unchanged. Historical full replay remains authoritative for 18B acceptance;
these faster small-sample baseline percentiles do not supersede it.

Reproduce using scripts/profiling/livelink_pair_io_probe.py --output <fresh-E-folder>.
Committed companion JSON holds exact measurements; raw pair files retained under
.scratch/livelink-ingest-18b2/raw-pair-screen. No plugin/model/runtime/pairing or
user project writes. No queued round or product phase is marked complete.

References: Python os.write returns the written byte count and os.fsync flushes
the descriptor (https://docs.python.org/3/library/os.html); Windows flush can be
expensive, but documentation does not prove this device's bottleneck or speed
(https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers).
Existing 561 backend/477 frontend/typecheck/build results carry from unchanged
product checkout 9c88c92; new profiling helper validation recorded in 18C2.
Exact next within requested scope: LIVELINK-INGEST-18C2 two-pair width screening.
