# ADR0056 — archived OBS viewport and PCM waveform

2026-10-09. Accepted for USER-FEEDBACK-09; supersedes the stopped waveform
presentation part of ADR0054. Its live/cursor API limits remain in force.

## Context

The owner reports rapid view movement, returning to the beginning while browsing,
coarse green waveform after Stop, playback escaping the view, and missing words.
Regression tests reproduce paused zoom returning scrollLeft to zero, absent
archive playback follow, and no standard PCM waveform request after Stop.
Inspection also found a drag-release animation callback capturing the older
playhead position. Repeated same-recording idle status/journal updates are covered
separately; this is not proof of every natural-device jump described by the owner.

## Decision

- The shared Timeline follows changed playback/seek time. Zoom, new duration
  metadata and data refreshes alone do not scroll back to the idle playhead.
  Drag release does not schedule a closure with an older playback position.
  Programmatic scrolling updates the viewport used to load PCM peaks.
- Archived OBS playback moves the window when its clock leaves the window or
  reaches 90% of it, placing the playhead at 10%, clamped to the recording's end.
  Paused media events and manual browsing do not trigger this follow. Scrubbing
  retains its existing position handling and audible preview.
- After Stop, an available archived track requests the same media PCM waveform
  endpoint as the shared Timeline. Request density is based on lane width and
  display scale, bounded to 1,024–16,000 points; source peaks remain normalized
  min/max and use the shared filled envelope geometry and accent color. Per-lane
  gain/mute scales that envelope. Green selected-source waveform and realtime
  utterance backgrounds belong to live capture only.
- Keep overlapping same-track peaks as temporary feedback while loading. Cancel
  obsolete requests and fence responses after asynchronous JSON reads. Another
  asset URL cannot reuse the old PCM snapshot. Loading/error/retry feedback is an
  overlay and does not change the waveform lane's layout.
- Where a final realtime utterance has at least two seconds without trusted
  detailed-word coverage, show a segment-level review note in the subtitle lane.
  Its tooltip retains the original utterance interval and text. This is a review
  hint, not evidence of continuous speech in every part of that interval. It
  neither creates words nor assigns estimated timestamps nor changes STT status.
  User-estimated/untrusted timing cannot suppress the hint.

## Evidence and limits

The inspected owner recording has actual audio and final realtime text but no
persisted detailed words from 240.352 to 269.020 seconds on Channel 1. Channel 4
is silent in the requested region. No capture sample gap was found. Both jobs
report complete. Raw detailed-STT segment checkpoints are absent, so recognition
versus merge loss cannot be attributed. STT-GAP-01 must inspect a controlled copy
with retained segment results before repairing that pipeline or rerunning owner
data. Existing word-accuracy truth and Phase03 budgets still apply.

No source audio, recognizer, project schema or upstream engine is changed. Real
WAV probes use only scratch peak-cache destinations; source hashes stay unchanged.
Source/jsdom checks do not establish native scroll smoothness, audible scrubbing
or visual acceptance. UX-EDITING-DEVICE-01 remains required after reload.
