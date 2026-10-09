# ADR0057 — shared Script scroll ownership

2026-10-09. Accepted for USER-FEEDBACK-10.

## Context

The owner identifies the Script module as the source of jitter/end obstruction
in test OBS 9 and Conviction, runaway wheel scrolling in PDCA_CLDNDD_K4_V02,
and missing OBS LiveLink scrollbars. A read-only topology probe shows different
presentations of the shared Script: archived OBS channels versus single-asset
speaker tables. Their word/turn distributions exercise different virtual windows.
No project name should decide scrolling behavior.

## Decision

- Keep measurements by word/text/width geometry signature across equivalent data
  refreshes. Row array identity alone cannot invalidate offscreen measurements.
- Preserve the visible fragment and its internal offset when earlier measured
  content changes height. Apply scroll correction after DOM commit and notify
  the shared scrollbar/viewport listeners. Disable browser overflow anchoring
  on the owned viewport to avoid a competing correction.
- Include logical row borders, padding, speaker/overlap controls and leading
  header/notices in offsets. A partial logical row renders chrome once and
  compensates its preceding spacer; visual fragments do not create speaker rows.
- Manual wheel/touch/navigation/scrollbar browsing suspends playback following
  until explicit seek/selection or footage identity change. Equivalent transcript
  refreshes alone cannot scroll to the unchanged active word.
- Table, text edit, archived ChannelScript and OBS realtime use ScriptScrollbar.
  Its thumb is at least28px, track13px; End/Home, Page/arrow keys, pointer drag
  and track clicks update the viewport. Observe content/viewport geometry and
  synchronize scroll events. The table toolbar sits outside the scroll region.
  Prose overlays and timing notices remain synchronized with the textarea.

## Evidence and limits

Three failing regressions became green: earlier fragment growth previously left
scrollTop100 instead of180; identical refreshed rows lost measurements/entered a
layout update loop; refreshing ScriptEditor after browsing5,000 returned it to0.
Shared control and both OBS caller tests verify End, pointer navigation and
range updates; archived End mounts the final word. Read-only real project counts
are retained separately. Native wheel dynamics, visual scrollbar presence and
smoothness on the owner's device still require UX-EDITING-DEVICE-01. Existing
word selection/edit/profile/overlap and virtualization limits remain tested.
Source media/transcripts, backend processors, schema and upstream are unchanged.
