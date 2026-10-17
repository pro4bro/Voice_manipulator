# 0106 â€” Viewport-relative navigation and precise peak overlays

Accepted 2026-10-17, stabilization round49.

## Navigation

During an ordinary playhead/ruler/waveform scrub, the outer 10% on either side
activates scrolling at 0.10 visible viewport widths per second. Integrate actual
requestAnimationFrame elapsed time; source seconds scale with the current zoom.
Accumulate fractional position rather than reusing browser-rounded scrollLeft
on every frame. A60-frame reproduction otherwise gives 60px instead of 80px in
an 800px viewport. Stop on release, cancellation, blur, source change and unmount.
Keep playback's existing follow behavior outside active scrubbing. Ctrl/Meta
selection sweeps remain selection gestures; they do not start this scrub timer.

Zoom centers on the current playhead, clamped to the source boundaries. Apply
this to the physical canvas, imported virtual windows and archived OBS windows.
Active live OBS keeps its existing live-follow window; full-duration transport
remains a source-wide seek surface. Plain left clicks on blank timeline/waveform
and subtitle space clear the timed selection. Actual word/edit gestures retain
their own behavior.

## Selection readout

Use one SelectionReadout for ordinary/imported/archived OBS range overlays.
The selection fill uses accent alpha 0.30 (70% transparency); numbers use opaque
accent text with no gray backing or visible names. IN/OUT may sit outside narrow
ranges; duration stays centered, moving to the second row for collisions. At a viewport boundary, stack edge stamps on
separate rows if clamping would make them overlap.
Clamp labels to the viewport and preserve original source values when virtual
windows clip the range geometry. Keep source ID/revision guards and avoid
implicit scrolling for separated selections.

## Clipping and preference

Only contiguous envelope buckets whose gained peak exceeds full scale form a
warning range. Do not bridge quiet buckets, cap/coalesce ranges or impose a
minimum visual width. Render all rectangles in one SVG path with nonzero fill
and consistent winding; overlap is one fill, never repeated alpha compositing.
Clipping precision remains bounded by the fetched min/max envelope buckets;
this is a display warning, not a claim of per-sample clipping localization.

Persist optional timeline.clippingHighlightAutoHide in machine-local app
Preferences, default false for old clients/files. When enabled, hide the warning
after 5000ms; source/gain changes rearm it, ordinary viewport refreshes do not.
Keep the timer owner mounted while an archived waveform window reloads and gate
its stale visual output separately. Preserve existing preference fields/secrets.

## Acceptance boundaries

See docs/gates/timeline-ux49-20261017.md for regression and actual-browser
proof. No engine/model work, source-media changes, saved word timing shifts or
new linguistic accuracy acceptance is implied. Phase03 stays 60%; Checkpoint A,
independent acoustic anchors and downstream processor gates remain open.
