# WAVEFORM-VOLUME-01 — gain reflected in waveform

2026-10-05. Owner asked all Timeline instances to reflect volume adjustments.
Baseline: `83845f0`. No source audio or upstream engine changes.

## Cause and repair

Imported multitrack and OBS renderers used the original PCM peaks when drawing
their SVG envelopes. Playback gain/mute changed independently, leaving the
waveform geometry unchanged. Both now apply the same per-track linear gain
and mute state to the shared envelope renderer, before full-scale clipping.
Changing one track does not change another. Gaps and PCM viewport detail remain.

The main Timeline already applies committed dB gain and its existing draft
3/12 preview while dragging. A detailed-canvas regression locks this down;
that existing preview contract is retained for imported audio, mic captures,
generated speech and changer takes using the same component.

## Evidence

- Baseline regression: two SVG gain tests failed, 42 other tests passed.
- Focused final Timeline + Workspace suite: **103 passed / 7 files**.
- Full frontend: **497 passed / 57 files**, 18.74 s.
- Typecheck/build and `git diff --check`: passed.
- Full backend: **564 passed**, 158.68 s, two existing deprecation warnings.
- Shared geometry tests assert half/double amplitude, mute centerline,
  full-scale clipping and missing-peak gaps.

Actual browser on copied real OBS PCM: before repair, Track 7 gain 100 -> 99%
left its path identical. After repair, 100 -> 50% changes maximum displacement
from **22.99 to 11.50** SVG units around center y=30. Muting makes displacement
**0**. Track 8's path is unchanged. No audio played during this measurement.
Evidence: `.scratch/ux-05b3/browser-evidence.json`, `gain-half.jpg`.

This is display/playback gain, not an OBS fader or rewrite of captured PCM.
No new microphone/OBS capture or generation was needed for this rendering fix.
Remaining plan gates proceed independently under the owner's continuous-work
instruction; this fix does not complete a product phase.
