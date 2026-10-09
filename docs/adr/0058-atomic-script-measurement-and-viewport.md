# ADR0058 — atomic Script measurement and viewport

2026-10-09. Accepted for USER-FEEDBACK-11; refines ADR0057's anchor correction.

## Context and causal reproduction

Owner confirms Script jitter/runaway and scrollbar improvements, but scrolling
to the end of test OBS9 trips its error boundary with React185. The official
[React error decoder](https://react.dev/errors/185) maps that code to maximum
update depth. A shared-hook wheel sweep with a clamped, measured viewport
reproduces the same exception; direct End jumps did not reproduce it.

The real shape is10 turns with counts31,3,3,833,12,49,17,40,7,141. The833-word
turn ends in a one-word visual fragment. When only that fragment is mounted,
sidebar controls make the row taller than its remaining text. Tracing the
baseline shows row chrome21->93->21, correction+72/-72 and first-window15/16.
Measurement state changes before viewport state matches its correction, so a
layout pass mounts the wrong window and measures a different row minimum.

## Decision

Enqueue corrected viewport coordinates in the same React batch as the measured
heights. Keep the pending scrollTop write until the resulting DOM is committed;
then notify scroll listeners and reconcile the actual browser-clamped position.
All consumers of useTranscriptWindow inherit the fix. Keep current row spacing,
fragment limits, shared scrollbar, manual reading priority and explicit selection.
No project-specific condition or catch-and-ignore update-limit workaround.

A window-local chrome candidate stopped the loop, but independent review found
a risk of subtracting trailing sidebar height from the top spacer and moving
continuation text. It was rejected. The selected product diff is9 lines and
preserves the existing geometry while removing the stale intermediate state.

## Evidence and limits

Minimal65+600-word regression and the actual ChannelScript caller with synthetic
OBS9-shaped words both fail with maximum update depth on baseline and pass after
the fix. Original end shape also settles in80/240px clamped viewports. Full
frontend659/75, typecheck/build pass. Source/jsdom is not native UI acceptance.
The owner should reload and scroll down/up through OBS9's final turns; existing
physical/audio/recognition truth gates remain. No backend/media data change.
