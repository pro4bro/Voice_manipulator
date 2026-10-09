# ADR0054 — stopped OBS waveform overviews and Stop continuity

2026-10-09. Accepted for USER-FEEDBACK-07.

## Context

The UI permits zooming out to an entire archived take. The waveform endpoint
still applied its live120-second cap to stopped recordings. Normal logs show
the actual406.4052262-second request returning422 after Stop. Received PCM could
also disappear while the journal list or a differently sized archive window loaded.

## Decision

- Live and cursor waveform requests keep the120-second cap. A stopped full
  snapshot may span up to max(120 seconds, journal recording duration), with
  one microsecond tolerance for floating point window arithmetic. Finite ordered
  nonnegative times, recording/channel ownership and1..600 output points remain
  required. Arbitrarily longer stopped windows are rejected.
- Read envelope blocks/documents incrementally into at most600 extrema bins.
  Preserve source axis, sample indexes, provenance checks and gap metadata.
  Overview requests do not accumulate all envelope documents in memory.
- Refresh the journal list immediately when the active take changes or stops.
  Until that reply arrives, retain the last observed live take's lanes and clock
  only when both project and recording identities match. It remains stopped in
  UI controls; retained state does not manufacture a durable journal/archive.
- While stopped window data loads, reproject only overlapping received bins
  from the same take. Another take's waveform cannot be reused. Live windows
  still require their exact snapshot coordinates. The live subscription caps
  requests at120 seconds even before a previous overview's viewport resets.

## Limits

No persistent schema or source media changes. Initial archive envelope rebuilding
still requires decoding the archive; streaming aggregation bounds memory but not
disk reads/time for hours-long recordings. Source/API and jsdom evidence do not
replace native Record/Stop, audible playback or visual acceptance after reload.
