# ADR 0030: Catch up realtime OBS STT from committed PCM

Date: 2026-10-02
Status: Accepted for the running API process

## Context

The API acknowledges OBS PCM only after committing its source chunk. Realtime
STT used a bounded per-track memory queue after that ACK. When detailed STT
occupied the model, the queue filled and discarded recognition work: a
304-second OBS take retained complete PCM but emitted 47 queue-full errors.

## Decision

Keep the memory queue bounded and keep its initial ordered chunks. On overflow,
retain only the first and highest deferred sequence plus the track identity and
latest alias. The worker drains the queue, then loads deferred chunks in
sequence from the same project's committed PCM and metadata. Before using a
chunk, it checks sequence, source UUID, byte count and SHA-256. It reconstructs
the sample and monotonic timing from committed metadata and continues through
the final deferred sequence after OBS Stop. Unreadable or inconsistent source
data emits an error and stops that track's live catch-up; no text is asserted
for missing audio. PCM ACK and project source media are unchanged.

## Evidence and limits

A forced one-chunk queue replayed 24 committed chunks on each of two tracks in
order, with a final event through every frame; it failed against the old
discard path. A separate test rejects a bad deferred hash. In a 185.71-second
physical OBS take, live and detailed STT ran concurrently on two independent
sources. Both tracks had continuous PCM, the MKA decoded, detailed STT
published, and live STT recorded 52 text events without queue-full errors.
That physical take did not force a queue overflow, so it does not independently
exercise replay. Final live-event lag still reached 26.828/20.578 seconds.

The deferred cursor is process-local. An API restart while it has unread
sequences can leave provisional transcription incomplete. The next round will
persist progress and resume committed PCM without duplicating final events.
