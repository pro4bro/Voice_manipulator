# 0117 — Recognize physical source boundaries during timeline dragging

Accepted 2026-10-19, stabilization round60. Refines ADR0108.

## Cause

The 10%–90% drag rule was intended only while more footage remained to pan.
Ordinary Timeline derived source positions from a fractional canvas rectangle,
while browser scroll extents use integer CSS pixels. At some zoom levels the
last scroll position therefore looked slightly short of the source end. Strict
floating point comparisons in the shared seek helper could independently apply
the 90% clamp to a mathematically terminal window.

An audio preview at the exact media endpoint could also invoke `play()` for an
empty interval. Browsers can restart ended media from zero on that call.
The canvas ResizeObserver also retained the playhead time from its last zoom
render, so a delayed layout update could repaint that older position even while
the media clock and viewport correctly remained at the endpoint.

## Decision

Map ordinary drag panning and seeking through the same DOM scroll extent.
Recognize physical scroll limits within one CSS pixel of rounding tolerance;
normalize the source window to its beginning/end before applying the safe zone.
A view with no meaningful scroll range permits full-width seeking. The shared
helper uses a small ULP-scaled tolerance for mathematical boundaries and returns
exact zero/duration when the pointer reaches or passes the terminal viewport edge.

Preserve 10%–90% constraints while footage remains in the chosen direction,
10% viewport width per second panning, fractional frame accumulation, direct
interior seeking and cancellation/release behavior. Imported and archived OBS
views continue using their bounded source windows with the shared helper.

Audio previews are bounded by both source duration and the next excluded range.
An empty preview remains paused, including at the final source sample.
Delayed canvas measurements repaint from the latest playhead time, rather than
the time captured when the observer was installed.

## Evidence and limits

New regression tests fail on the previous behavior: ordinary playhead/waveform
drags at fractional DOM widths and three zoom levels, mathematical boundary
roundoff, endpoint audio preview replay and delayed resize repaint. Held pan/release tests and existing
multitrack/OBS/rate tests also run. See
`docs/gates/timeline-source-boundary60-20261019.md` for final commands/results and
browser limitations. Source media, word timing, saved project format and engine
adapters are unchanged. No portable package is issued in this round.
