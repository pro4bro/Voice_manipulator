# ADR 0017: Durable PCM outbox for OBS LiveLink

Status: Accepted, 2026-09-29

## Context

OBS forwards independent source PCM to the local API. The earlier finite
memory queue could overflow during a long API stall, leaving irreversible
silence in a take. OBS also writes an MKV, but its audio tracks are configured
mixes, not guaranteed one-to-one source captures. The app can keep recording
after OBS Stop under Ignore Stop, so that MKV may end before the app take.

## Decision

The OBS plugin's worker commits PCM batches to a machine-local SQLite outbox
before HTTP transmission. The database lives under the current Windows user's
OBS plugin configuration, uses WAL and `synchronous=FULL`, and stores recording,
source, channel, sequence, sample/time boundaries and PCM bytes. The capture
callback only writes to its bounded memory queue. The worker removes a row
after HTTP 200 confirms the API's durable write. Invalid rows remain for
diagnosis. On restart, the plugin reattaches stopped recordings from
project-owned journals, clips pending chunks to their Stop boundary, replays
them and requests archive finalization after the outbox drains.

The project's recording journal and final multitrack MKA remain the portable
record. The SQLite outbox is transient recovery state on the capture machine.
OBS MKV can be an independent check of configured mixer output, with readers
limited to committed portions while the file grows.

## Consequences

- Ordinary API stalls and OBS restarts no longer require PCM to fit in memory.
- A crash before the worker commits its current memory batch can still lose
  that batch; a full or failing local disk can still force the finite memory
  queue to overflow. Both are explicit remaining risks.
- A project must not be moved to another machine while this host has pending
  PCM for one of its recordings. Drain or export the outbox first.
- The app needs outbox health and invalid-row recovery controls in a later
  round. MKV ingestion is optional fallback work, not the canonical ingest.
