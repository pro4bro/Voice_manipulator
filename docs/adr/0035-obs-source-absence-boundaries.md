# ADR 0035: Preserve OBS Source Absence Boundaries and Buffered PCM

## Status

Accepted — LIVELINK-STT-12J, 2026-10-03.

## Context

The 12H physical source-removal take retained its captured lane but omitted
the new source's absence from the journal. Native inventory reported missing
without emitting the existing v3 presence events. The reducer could also
suppress a missing event after heartbeat had already changed presence, or
reject restoration after heartbeat reported active. Native capture discarded
queued callbacks when detaching a missing source, risking loss of its tail.

## Decision

- Observe stable channel ID/source UUID presence across mixer inventories,
  including sources first discovered in the current process. First inventory
  is a baseline; aliases/mute and a replacement UUID do not invent transitions.
- Emit existing `channel-missing`/`channel-restored` lifecycle events with native
  monotonic time and sample counters. Disappearance follows callback detach;
  restoration precedes callback attach. This keeps already buffered and resumed
  PCM outside the absent interval. The roughly one-second mixer refresh means
  these describe native observation, not the exact user's edit time.
- While an app take is active or draining, detach the callback but retain the
  track's queued PCM and sequence/sample counters. Restore the same UUID into
  that track and advance its sample counter through the observed absence.
  Existing stem finalization therefore inserts silence and classifies the gap
  `source-missing`, preserving the available media's time axis.
- Order observed transitions by their native boundaries; drain up to 64 queued
  lifecycle events before the PCM send burst. Defer command polling while events
  remain. Restoration with Forward enabled includes its applied Forward event
  at the same boundary, closing the pending interval before resumed PCM.
- Reducer presence events carry historical timing even when heartbeat has
  already updated presence. Stable mapping and tombstone checks, sequenced
  retry fingerprints, monotonic validation and Stop interval closure remain.
- Timeline keeps recorded PCM/lane, labels a currently absent source clearly,
  and subtracts known absence from live unknown-hole markers. Unexplained holes
  and actual delayed receipt remain visible. No API/project schema migration;
  source archive and analysis provenance retain their existing contracts.

## Consequences and limits

Plugin/package 0.6.9 is required to emit these observations. An old recording
with no native boundary cannot be retroactively assigned one. App receipt UTC
is not substituted for media time. Existing source counters/PCM survive the
tested disappearance/restoration/removal flow, with durable spool/API ACK rules
unchanged. Source collection switching, process crashes before queued control
events reach the API, cold startup and the broader LIVELINK-08 matrix remain
separate acceptance work. This does not assert exact OBS video PTS alignment
or arbitrary disk-stall throughput.
