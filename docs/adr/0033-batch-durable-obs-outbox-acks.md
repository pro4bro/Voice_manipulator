# ADR 0033: Commit OBS outbox ACKs once per send burst

Date: 2026-10-03
Status: Accepted after sustained two-track OBS/browser acceptance

## Decision

The native sender retains each chunk in its SQLite outbox after an HTTP 200
durable PCM ACK. It advances a temporary row-ID cursor within the existing
bounded send burst, then deletes only the explicitly acknowledged IDs in one
transaction. A burst remains limited to 20 sends or approximately one second
before servicing controls. Source append and ACK commits retain WAL with
`synchronous=FULL`; API PCM and metadata retain their required flushes.

No outbox row is removed before the API commits that chunk. A plugin exit
before the ACK transaction commits leaves those rows available for duplicate
replay. The API already handles identical sequence retries. An invalid ID or
failed commit rolls the entire deletion transaction back; the sender restarts
from the oldest retained row. Rejected and unsent rows are never deleted by a
range operation. Stop clipping and finalization still inspect retained rows.

Native transport logs expose ACK transaction count and total commit time
beside HTTP timings. An unchanged OBS recording-folder locator is read and
compared instead of being flushed on every heartbeat; changes, reconnect and
corruption still cause a durable replacement.

## Evidence and limits

A Windows native benchmark of 40 real-sized PCM rows measured 1.488 seconds
for individual ACK deletes and 0.773 seconds for batches of four. Native tests
cover retention before commit/reopen, atomic rollback, committed deletion and
preservation of rejected rows. The API regression first failed on five writes
for five unchanged heartbeats, then passed with one write and exercised folder
change, API restart, reconnect and corrupt-file recovery.

Two warmed OBS takes with browser polling, live `medium` and detailed
`large-v3` STT ran for 174.830 and 171.477 seconds. PCM receipt p95 changed
from 49.012/49.263 to 2.157/2.520 seconds, with sample-contiguous tracks,
verified archives and complete STT in both. This is a measured comparison on
one machine, not a latency guarantee or an isolation of every timing change.
The folder-write cost was reproduced by replay; it was not dominant in the
physical baseline. See `docs/gates/livelink-stt-12g-ingress.md` for stage
measurements and browser limitations. Live waveform presentation still needs
repair independently of PCM continuity.
