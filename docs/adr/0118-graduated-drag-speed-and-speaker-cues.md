# 0118 — Graduated edge drag speed and stable subtitle speaker cues

Accepted 2026-10-19, stabilization round61. Extends ADR0108/0117 and the subtitle
legend introduced in round55.

## Decision: edge scrolling

Use discrete, symmetric speed bands based on the pointer's position in the
current timeline viewport. Speed is viewport widths per elapsed second; zoom and
source duration change only the corresponding source seconds.

| Pointer ratio from viewport left | Viewport width per second |
| --- | --- |
| 10% < x < 90% | 0 |
| 5% < x <= 10% or 90% <= x < 95% | 10% |
| 0% < x <= 5% or 95% <= x < 100% | 20% |
| Exactly 0% or 100% | 30% |
| Outside the viewport | 40% |

The shared helper applies to ordinary playhead/waveform dragging, promoted word
timing, imported multitrack and archived OBS. Keep fractional RAF accumulation,
interior direct seeking, cancellation, stationary edge dragging, safe playhead
clamping and physical source-boundary exceptions. Full-source overview transport
and live OBS following do not adopt edge acceleration.

## Cause and decision: subtitle underline

Before this change, ordinary words with manually edited timing used an orange
bottom border. `.is-past` overwrote that border with a translucent green border.
This was playback-state paint colliding with timing-edit paint, not an actual
Speaker Profile reassignment. Ordinary words also lacked the speaker underline
property that manual text already used, contradicting the subtitle Note legend.

Reserve the bottom edge of readable subtitle boxes for the assigned/inherited
Speaker Profile, independent of playback, selection, warning and text-origin
states. Explicitly unassigned or unresolved profiles have no colored speaker
underline; diarization labels do not silently become profile assignments. Keep
the existing default-speaker inheritance rules. Compact density bars retain their
existing rendering.

Move the manual timing-edit cue to the orange top border so it can coexist with
speaker identity. Keep blue manual-text classification and state-specific
readable foreground/background pairs. Update Note with the top/bottom meanings.
Playback may still change the remaining outline/background for tracking words.

## Verification boundary

Regression tests first failed for symmetric acceleration, changing bands within
one held drag, and speaker cue data on ordinary/inherited words. Real browser
computed CSS reproduced orange-to-green underline mutation, then verified stable
speaker borders in both themes before/at/after the playhead and when selected.
See `docs/gates/timeline-edge-speaker61-20261019.md` for exact checks, intentional
old test input changes and limitations. No media, stored word timing, project
format, engine or backend source changes. No portable package in this round.
