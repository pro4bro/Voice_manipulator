# ADR 0029: Keep OBS PCM ACK durable while shortening its write path

Date: 2026-10-02
Status: Accepted after two-track OBS load test

## Decision

An OBS PCM chunk is acknowledged only after both its source PCM and chunk
metadata have been flushed to disk. Prepare and flush their temporary files
concurrently, then atomically publish the PCM path before the metadata path.
The metadata file is the committed chunk marker: if the process stops before
metadata publication, a sender retry may safely overwrite orphaned PCM and
temporary files. A retry never sees published metadata without published PCM
because of this publication order.

Waveform envelopes are project-owned derivatives of the durable PCM, and the
final MKA can rebuild them after Stop. Write each envelope through a temporary
file and atomic replace, but do not wait for a third per-chunk `fsync` before
returning the PCM ACK. Source PCM and metadata retain their durable flushes.

## Evidence and limits

The 11C take showed 16.29/16.49-second p95 PCM ingest lag and a 56-chunk
spool peak. A 100-chunk scratch replay measured roughly 38 ms PCM flush,
51 ms metadata flush, and 38 ms envelope flush per chunk at the median. A
failure-injection test verifies that failed PCM publication leaves no committed
metadata and that retry succeeds. All 485 backend tests pass.

With the new path, a 304-second OBS take from the same two speech fixtures,
while live and detailed STT ran, measured 4.20/4.14-second p95 lag and a
20-chunk peak. Both tracks had zero PCM sample gaps/overlaps; the two-track MKA
matched its journal hash and decoded. The duration and startup timing differed
from 11C, so this is a measured improvement on this machine, not a universal
latency guarantee. The realtime STT queue still filled 47 times in the new
take; that is separate from durable PCM ingress.
