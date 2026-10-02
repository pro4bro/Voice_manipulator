# ADR 0021: Forward captures raw OBS source audio

Status: Accepted — 2026-10-02

## Context

OBS exposes at most six output mix tracks, while LiveLink enumerates independent
audio sources. Several sources can share one OBS mix track. A forwarded Desktop
Audio source was muted in OBS; its meter moved, but LiveLink wrote all-zero PCM
because the plugin treated the callback's mute flag as an instruction to zero
the raw source data. Two removed sources also remained visible as Track 7 and
Track 8 because their historical Forward setting was still true.

## Decision

LiveLink's Forward switch is the capture decision. For a present, forwarded
source, save the raw samples delivered by OBS' source audio callback even when
the OBS mix is muted. Keep OBS' mute status visible as source information.
Do not cap independent LiveLink sources to OBS' six mix tracks. Hide missing
historical sources from current plugin and app lists while keeping their UUID,
slot, alias, and recording history for recovery and provenance.

During recording, Media Pool may show a journal-backed provisional footage
row. Only a verified and indexed MKA becomes a completed footage asset. If
finalization fails, keep the journal row visible and retry once; leave manual
retry available.

## Consequences

Forwarded sources can be archived even if the OBS mix excludes them. Users
must turn Forward off to exclude a source from LiveLink capture. A moving meter
still does not prove durable PCM; the Recorder reports chunk evidence. Scene
collections with more than six live audio sources can legitimately show more
than six LiveLink tracks, while removed sources do not inflate the current list.
