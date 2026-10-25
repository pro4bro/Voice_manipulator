# ADR0149 — Script follow after layout settles

Date: 2026-10-25
Status: Accepted implementation; native browser acceptance pending
Round: VM-SCRIPT-SCRUB-FOLLOW-01

## Context

The owner reports that Input table view and both Voice Manipulator views still
stop following or jump during playhead drag after ADR0148. Preventing a Script
selection from seeking Timeline does not establish that the Script viewport
continues showing the current word.

The follow hooks skip a word after its index has been handled. Virtual rows,
wrapping or viewport geometry can settle later, moving that word out of view
without changing its index. Voice Manipulator table also disables follow while
multiple ranges exist. Its auto-height effect collapses every editable textarea
on every render, including playback updates, which can clamp the parent scroll.

## Decision

Keep the existing word-change/pending-reveal guards, and add a shared layout
observer for table and text follow. Observe the viewport and its direct content;
coalesce notifications into one animation frame and reconcile against the latest
target and manual-follow policy. Cancel queued work and observers on binding
change/unmount. Do not chase each intermediate virtual-spacer commit synchronously.

New disjoint manual selections pause table follow. Their continued presence does
not disable it: an explicit Timeline gesture resumes follow without clearing the
selection. Text playback remains a paint-only Range; no caret/focus is moved.

Cache textarea measurement inputs by element: value, width and relevant computed
font/box metrics. Clock-only renders do not write height. On actual text/layout
changes, measure with the correct border/padding adjustment and restore the
enclosing viewport after all rows expand. Width observations still resize rows.

## Consequences

Tests must assert Script word visibility, not merely playhead coordinates. The
gate covers forward/reverse held drags, delayed geometry, stale audio events,
disjoint selections, virtualized1400-word text, cache invalidation and queued-frame
cleanup. Geometry and browser scroll clamping are explicitly modeled in JSDOM;
they are not native browser evidence. No audio, timing, selection, project format
or engine contract changes. ADR0148's native acceptance remains open.
