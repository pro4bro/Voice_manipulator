# ADR 0015 — One Timeline edit axis for OBS LiveLink channels

Status: Accepted for UX-07, 2026-09-29.

## Context

An OBS LiveLink recording captures and transcribes several source signals at
the same time. The earlier Timeline displayed separate waveforms but had only
one preview channel at a time and did not expose the original cut workflow.
Per-asset cut requests could leave the sources with different removed ranges.

## Decision

- Keep one recording-relative playhead, zoom window, Mark In, Mark Out, staged
  Cut, Delete, Uncut, and Reset for all visible channels. Scrubbing any waveform
  moves the shared playhead without changing playback source. The channel label
  chooses which archived signal to hear. Gain and Level remain source-specific.
- Store the same removed ranges on every archived source asset in one media
  index write under the project lock. A batch request requires every source
  asset to exist and validates the complete range list before writing. Existing
  per-source gain keyframes are preserved.
- Keep recording-relative ranges even when a source stem ends early. Audio
  processing already intersects each range with that stem's duration. The
  shared edit coordinates must not shift or disappear on a shorter signal.
- Keep source WAV/MKA files intact. Removed ranges affect the existing
  processing path and are shown on each channel's waveform.

## Consequences

All channels in a recording display and persist the same cuts. The API writes
the project media index once so validation or a failed file replacement cannot
leave a subset of channels updated. Timeline does not pretend a cut removed
source files or individual subtitle text. Physical OBS and browser acceptance
is still required for simultaneous signal timing and viewport layout.
