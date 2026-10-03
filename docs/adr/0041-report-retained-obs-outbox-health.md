# ADR 0041: Report retained OBS outbox health

Date: 2026-10-04. Status: Accepted. Round: LIVELINK-08N-A.

## Decision

The authenticated v3 hello/heartbeat may carry optional `outbox` metadata.
The native worker reads aggregate SQLite metadata outside audio callbacks;
the API validates and retains a copy, with server-monotonic report age and
connection-expiry staleness. No API status request opens the spool database.
Older plugins omit the field and display unknown health rather than zero.

Retained includes rejected rows; rejected is a subset, not another queue.
Unreadable storage has unknown counts. Memory frames and worker chunks not yet
spooled are separate from durable rows. Overflow is the cumulative count of
currently attached native Tracks and may include loss before Record; it is
not a per-recording loss measurement. Meter activity never substitutes for PCM.

A nullable `enqueued_wall_ms` SQLite column records new rows' enqueue UTC time.
Legacy rows retain their PCM and metadata with null time. If any retained row
has unknown time, or the wall clock moves behind the oldest enqueue time, age
is unknown. Age includes rejected rows and is approximate wall-clock waiting
time at the last report, not capture-to-ACK latency. Empty storage has no age.
Old binaries can still insert rows without this additional nullable column.

The last SQLite failure is historical and labeled accordingly; a successful
read does not erase a preceding write failure. Raw details are limited to
2,048 characters. Health metadata never includes pairing secrets or PCM.

## Scope and consequences

This seam does not change FULL/WAL durability, durable ACK deletion, capture
queue bounds, Stop clipping, source media, project storage or transport order.
Schema migration is machine-local. A failed migration leaves storage unavailable
and reports the error; it does not recreate or delete the outbox.

Native/API/UI health is one bounded slice. Scoped retry/export and an isolated
longer multi-source outage are separately reviewed LIVELINK-08N-B work. The
parent 08N remains open; no loss-free capture or improved latency is claimed.
Installation/package refresh follows the complete recovery/outage gate.
