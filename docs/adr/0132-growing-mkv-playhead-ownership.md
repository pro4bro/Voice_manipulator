# ADR0132 — Preserve playhead ownership across growing MKV refresh

2026-10-22, Round84. Status: implemented.

## Evidence

The frontend displays the latest track duration, while an audio element can still
describe an earlier WAV prefix at the same HTTP endpoint. A deterministic drag
from a60s prefix to96s in the new120s extent returns to60s when that element emits
timeupdate. Its handler previously accepted paused clocks. Asset updatedAt also
formed the scrubber lifecycle key, so polling ended an active audition. Neither
resume identity nor viewport movement is required to reproduce this failure.

## Decision

The pointer owns the playhead throughout scrubbing and while paused afterward.
Only the active primary playback clock can advance it. Keep the existing channel
identity checks, source-bound resume positions and Round50 edge-pan/release rules.
Beginning a scrub also invalidates full playback waiting for AudioContext resume.

Use stable visible track IDs/base URLs for scrubber lifetime. Growing duration or
transcript updates are payload refreshes on the same footage, not a new gesture.
Source withdrawal/switch and unmount retain existing scrubber cleanup.

For followed MKV playback, append an in-memory mkvRevision query based on the
published analysis path and duration. Growing PCM increases frame count/duration;
final import publishes a new path even if duration is equal. This distinguishes
resource revisions without reloading audio for transcript-only updatedAt changes.
Normal imports keep their existing playback URLs. No persistent field or backend
query contract is added; the existing audio route serves the same project asset.

Fence a refreshed growing audio clock until loadedmetadata restores its held
coordinate. During a drag, refresh the audition range against the newly loaded
duration; afterward, seek to the held playhead. Then ordinary primary playback
can resume and synchronize the other visible tracks. Delete loaded resource
entries with audio refs on removal. No shared AudioScrubber implementation change
is needed.

## Verification boundary

Regressions cover Layer/Column drag across a source refresh, late paused events,
resume persistence, primary/secondary clocks, metadata arriving during/after a
scrub, growth/final-path revisions, transcript-only stability and delayed Play
activation. Existing edge-pan, playback and Script ownership checks remain.
Real MKV/WAV HTTP checks establish growing headers and revision query support;
they do not replace browser/device audition. No source media, engine, processor,
project format or acoustic-quality acceptance changes.
