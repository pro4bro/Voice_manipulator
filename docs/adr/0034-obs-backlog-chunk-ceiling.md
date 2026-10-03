# ADR 0034: Consume larger existing OBS PCM backlogs per upload

Date: 2026-10-03
Status: Accepted after native and four physical OBS/browser checks

## Decision

The native v3 capture worker takes up to two seconds, capped at 96,000
frames, from a source's existing callback queue. It emits a smaller prefix
immediately when that is all that is available. The 250 ms spool drain
interval, source append transaction, bounded send burst and durable ACK
transaction remain unchanged.

This reduces the number of PCM/metadata pairs requiring durable flushes when
slow HTTP receipts allow more than one second to collect before the next
drain. It adds no deliberate capture wait and does not merge rows already in
the SQLite outbox. Sequence and first-sample identity are assigned to the
resulting chunks normally; source discontinuities and format/Forward/Pause/
Stop boundaries still split them. Stop clips the final packet before upload.
The maximum payload at eight PCM16 channels is 1,536,000 bytes, within the
existing API limit of 3,072,000 bytes. No protocol or persistent schema changes.

## Reason

The 12I quiet physical take did not reproduce the 12H end-of-take backlog.
Its stage probes nevertheless located most handler time in preparing and
flushing the source PCM and metadata pair; lock acquisition and waveform
projection were smaller. A scratch-only, fixed per-pair delay reproduces
insufficient receipt throughput without weakening required durability or
changing the STT engines. The larger ceiling amortizes that fixed cost over
more existing audio. It cannot remove arbitrary disk stalls or establish a
universal latency guarantee.

## Verification

The backlog regression failed before the change at `chunk->frames == 96000`.
Native checks cover two-source ordering, continuous sample indices, immediate
small prefixes, Stop inside a callback, retained audio during an unavailable
API, discontinuity splitting and durable spool reopen/ACK rollback. Physical
before/after acceptance and final results are recorded in
`docs/gates/livelink-stt-12i-ingress.md`.
