# 0107 — Live drag clock and shared readable color pairs

Accepted 2026-10-17, stabilization round50. Supersedes ADR0106's multi-row
selection readout layout; viewport-relative scroll and zoom contracts remain.

## Immediate visual clock

A media seek is asynchronous. The playhead was painted by playback events,
while scrub state intentionally suppresses those events. Changing React time
therefore did not move the imperative transform until release. Seek handlers
now paint the requested position immediately for playhead, waveform/ruler and
transport drags, including RAF edge pans. Duration metadata can update the source
duration during a scrub but cannot paint an older media position over the drag.
The audio scrubber retains normal pitch/previews and commits its target on release.

## Single-row readout

IN, duration and OUT remain on one row at the same top coordinate. Preserve
source numeric values. Duration stays centered when there is room; distribute
edge labels outward for short intervals, shifting the group at viewport edges.
Estimate monospace widths from displayed values and compact at narrow viewport
widths rather than creating second/third rows. Keep fill alpha0.30, text opaque
and no gray backing. Foreground is an accent hue adjusted against both the plain
audio surface and the composited selection fill to meet 4.5:1.

## Color policy as a shared contract

Normal UI text must meet WCAG 2.2 SC1.4.3's 4.5:1 threshold on its intended
backdrop. Prefer semantic foreground/surface pairs for normal controls. Selection,
active playback, estimated/untrusted timing and timing-collision states own BOTH
their foreground and opaque background; user inline emotion/speaker paint must
not override one side of that pair. Preserve existing salmon/blue/amber fills.

Dynamic speaker/emotion text uses readableColor: retain the chosen color when
it passes, otherwise move its RGB lightness toward the higher-contrast black/white
endpoint. Evaluate alpha against the actual resolved backdrop. Emotion backgrounds
are precomposited onto their declared field surface and rendered as that exact
opaque color, avoiding a mismatch from rounded CSS mix percentages. Stored user
colors/preferences do not change. Recompute through a shared theme subscription;
one root MutationObserver serves all consumers and disconnects when unused.

Opaque field/word surfaces make renderer backgrounds match the resolver input.
A few base light-theme foreground tokens were below the threshold on sunken
surfaces; adjust shared muted/subtle/clone tokens instead of local overrides.
Unknown CSS color syntax falls back to the stronger neutral when background is
resolved. CSS variable backgrounds must be resolved before invoking the helper.

Enforcement: pure color/composite invariants, a deterministic custom-color matrix,
CSS/resolver token parity, actual stylesheet cascade tests with hostile inline
colors, shared-observer lifecycle, and an AST guard over direct dynamic inline
foregrounds throughout product TSX. Static legacy CSS combinations/gradient and
raster overlays still need rendered acceptance; the guard is not a proof of all
possible UI states. See docs/UI-COLOR-RULES.md and the round50 gate.

Source: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

## Boundaries

No model, source audio, saved word timestamps, project schema or backend source
changes. Backend tests still run for the repository regression gate. Phase03 stays
60%; independent acoustic anchors and Checkpoint A remain open. Final browser
sweep was blocked when local browser use was disabled in Work settings; do not
represent intermediate browser screenshots as a final cross-page acceptance.
