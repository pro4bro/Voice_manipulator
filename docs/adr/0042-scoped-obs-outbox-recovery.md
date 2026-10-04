# ADR 0042: Scoped OBS outbox recovery

Date: 2026-10-04. Status: Accepted. Round: LIVELINK-08N-B.

## Decision

A product adapter opens only the paired installation's fixed machine-local
SQLite outbox. Native capture remains its primary writer. Recovery mutations
use SQLite BEGIN IMMEDIATE/FULL, bounded busy waits and the existing recording
lock shared with permanent deletion. Journal ownership and deletion markers are
validated before access; recovery applies only to stopped project recordings.
The runtime lock protects validation, not long exports or unrelated ingress.

GET scoped health returns a digest over rejected rows' metadata and PCM hashes.
POST retry requires that digest and rejects a changed snapshot. It clears only
that recording's rejected flags; it never deletes, rewrites or accepts PCM.
Replay still requires the native worker, connection recovery and durable API ACK.
Repeated invalid PCM can be rejected again and remains recoverable.

POST export holds a read snapshot, writes a project-owned ZIP with exact PCM,
metadata, hashes and the source journal, then flushes/fsyncs and atomically
publishes it. Source rows remain untouched, including rejected rows. Bounds:
10,000 rows, 256 MiB total PCM, 32 MiB per row. Exceeding a bound is an explicit
error preserving originals. An export is a recovery artifact, not normal footage
or a promise of a playable/valid audio stream. Failed staging is removed only
from the adapter's generated paths; no Media Pool item is recreated.

No request accepts a database path or arbitrary export destination. Optional
enqueue timestamps support old databases. No authentication token is exported.
Parent 08N acceptance still requires native multi-source outage and ACK gates;
performance budgets and both native/API durability guarantees remain unchanged.
