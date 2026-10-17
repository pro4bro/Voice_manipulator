# 0108 — Hold the dragged playhead at the viewport safe edge

Accepted 2026-10-17, stabilization round51. Extends ADR0106/0107.

## Cause

Edge scrolling moved the viewport at the requested rate, but seeking still used
the raw pointer position outside the 10%–90% playback follow window. Releasing
enabled normal playback following again, which repositioned the viewport. OBS
archive also has a click handler after pointerup that could overwrite the drag's
final target, including a stationary pointer held in the scrolling edge zone.

## Decision

Use one shared drag seek calculation for pointerdown, movement, edge-scroll
animation frames and release in ordinary, imported multitrack and archived OBS
timelines. Clamp the dragged playhead to 10% at the left and 90% at the right while
more source remains available for panning in that direction. The raw pointer
continues to choose the scrolling direction. Keep scrolling at 10% of viewport
width per second, independent of zoom and source duration, with fractional frame
accumulation. Moving the pointer back into the safe window resumes direct seek.

At the physical beginning/end of the source, permit reaching 0%/100% so the
first/last sample remains accessible. A source that fully fits the viewport keeps
full-width seeking. Full-duration overview transport and live OBS follow retain
their existing behavior.

Normal playback following accepts one screen pixel of tolerance at the safe
window edges to avoid floating point or DOM scroll rounding triggering a recenter
after release. Track whether a drag was constrained or panned and suppress OBS's
subsequent click when necessary; pointer distance alone cannot detect a held edge
gesture. Stop edge animation on release, cancellation, blur, source change and
unmount. The released viewport and target remain where the drag left them.

## Evidence and boundaries

Two actual ordinary Timeline tests failed before the fix and pass afterward:
left/right edge drags, held scrolling and release followed by media clock events.
Imported/OBS regression cases assert both safe edges and unchanged ruler/target
after release. OBS also tests the subsequent click. Pure tests cover source
boundaries; fractional scroll rate and full-duration transport tests remain.
See docs/gates/timeline-safe-edge51-20261017.md for final regression evidence.

No source audio, saved word timestamps, project format, model or backend source
changes. Browser use is disabled in Work settings in this turn, so real mouse
acceptance of the final behavior remains open. Phase03 stays60%; acoustic anchor,
Checkpoint A and downstream processor gates remain open.
