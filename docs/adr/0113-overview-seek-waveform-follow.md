# 0113 — Overview seeking reveals the same waveform target

Accepted 2026-10-18, stabilization round56. Extends ADR0107/0108.

## Cause

Ordinary Timeline's layout follow effect suppresses all following during a held
transport scrub. That suppression protects waveform-local edge gestures from
release jumps but also kept a zoomed waveform offscreen while the full-duration
overview changed its playhead and published the active Script word.

## Decision

The full-duration overview explicitly reveals its computed seek target in the
waveform viewport during pointerdown, movement and release. It passes the same
numeric time used to paint the playhead and seek/publish audio state; it never
reads the previous render's clock to choose a viewport. Reuse the established
10%–90% follow window and physical source bounds.

Explicit overview seeking also works with disjoint selections. Selection alone
retains the no-auto-scroll rule, and seeking does not rewrite selection ranges.
Waveform-local/playhead edge gestures retain their elapsed viewport-relative pan
rate, safe-edge clamp and release position. Overview seeking does not start the
edge pan animation: its pointer maps directly over the whole source.

Imported multitrack and archived OBS already reveal their overview targets.
Verify both LAYER/CỘT layouts as controls; focused single-track editors reuse
ordinary Timeline. No saved timing, media, model, backend or project schema edits.

## Evidence

Two regression cases first failed with waveform scrollLeft0 despite a painted
85s playhead outside the viewport. Green cases assert immediate forward/reverse
reveal, Script word agreement, stale media clock immunity, stable release and
unchanged disjoint selections. See docs/gates/overview-follow56-20261018.md.
