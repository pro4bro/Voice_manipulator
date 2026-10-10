# USER-FEEDBACK-17 — subtitle trim grips and stable word visibility

2026-10-10. Scope: the two subtitle defects reported with images, plus recording
the owner's forthcoming Conviction timing reference. Acoustic STT acceptance
and the existing word-editing/timing rules retain their budgets.

## Reproduction and cause

The regression command was run against the original product files from HEAD,
with the current tests. Those product files were restored afterward in a
`finally` block. Private evidence is in
`.scratch/user-feedback-17/before-tests.json` and `before-test-console.txt`.

- A stylesheet/Timeline check reads the actual shipped CSS. A selected word's
  5px grips had `left:0` / `right:0`, placing them inside the word and over its
  first/last letters. The outside-boundary assertion returned 5, expected ≤0.
- Three touching word intervals `[0,.01]`, `[.01,.1]`, `[.1,.3]` reproduce
  disappearance. Changing the audio clock from .05 to .15 makes the middle
  readable word disappear from the DOM while source hit testing still knows it.
- The density helper also fails the all-three-visible check. Computing the box
  right edge through independently rounded start/width arithmetic and converting
  it back to seconds creates tiny apparent collisions or skips. Forcing the
  active neighbour changes which word survives the filter. This is a rendering
  error; source word timing is not missing.

Original product: 3 regression failures, 20 other tests passed. Early styling
test attempts used CSS imports that Vitest stubs; the final seam reads real CSS
instead. The retained original-product run proves the actual 5px overlap, not
an empty mock stylesheet failure.

## Repair

- Readable subtitle buttons allow external grips. A separate clipped label span
  contains text; IN/OUT grips sit outside the unchanged timestamped rectangle.
  Grips also sit above the label row, so they do not cover adjoining word glyphs.
  Grip width creates no layout space and changes no word or neighbour interval.
  Compact overview stripes keep their existing hidden grips and 4px geometry.
- Pixel endpoints share one coordinate calculation. Readable-interval collision
  and binary-search boundary checks tolerate rounding at 1e-6 pixel precision.
  Any such visual overshoot is clipped to the following rectangle. Compact
  stripes retain strict 4px occupancy and actual overlaps are still filtered.
- The shared density helper serves ordinary Timeline, imported multitrack and
  archived OBS lanes. Their focused editors use the same Timeline label/grips.
  No source timing, text, audio, engine, API or persistent project format changes.

## Verification

The three original regressions pass on the repaired product; existing compact
stripe, selected/promoted word, timing collision, middle-button and history
tests remain in scope. The stylesheet test is JSX so Node filesystem reads do
not introduce Node types or dependencies into the browser application.

The first full frontend run had 702 passes and two failures: a 5s Script wheel
timeout and a live-caption assertion sensitive to elapsed recording time under
parallel load. Both affected files pass in isolation (58 tests). Original
timeouts/assertions were retained. A complete run with two workers is recorded
at closure. The initial stylesheet test's TypeScript Node import also prevented
typecheck/build; moving that test to JSX corrected the test setup.
The first capped run passed all 703 typed tests but could not parse a TypeScript
non-null marker left in that JSX test. Removing the marker corrected it; all
four focused files then passed (36 tests), and typecheck/build passed.

Final review added an actual CSS assertion for vertical separation as well as
horizontal separation. It failed with the initial external grip at `top:0`.
The repaired 10px grip sits above the label (`top:-13px`); the lane permits that
overlay while the enclosing timeline canvas still clips viewport edges. No
extra waveform/subtitle row or time spacing is added. The focused36/4 checks
pass after this correction; the full final report is retained separately.

Product commits `3669099` / `05a5ce9`: focused36/4 and full frontend704/78 pass (two workers,
95.17s final report interval), typecheck/build/diff pass. Full backend: 741 passed / two existing warnings in223.39s.
Native screenshot
and audio acceptance remain owner checks: jsdom proves stylesheet geometry and
DOM persistence, not browser rasterization. Earlier automatic browser approval
review rejected browser automation; that restriction remains respected, without
a CDP/Playwright/shell-browser workaround. No owner runtime restart or processing
job was dispatched.

## Owner check and next scope

Reload the built UI. At readable zoom, select a word and move the playhead into
its touching neighbour, then back: both labels should remain. IN/OUT grips should
stay outside the selected label; selecting or hovering alone should change no
timestamp. Existing deliberate trim/middle-button gestures still edit timing.

The owner will carefully review timing in **Conviction**. Once the owner confirms
completion and the reviewed regions, retain a separate reference copy with exact
audio hash, word identities and reviewed IN/OUT. Compare machine output against
that reference; do not treat unreviewed original STT times as ground truth.
This is the next **STT-TIMING-ACCURACY-01 independent anchor review**. The existing
24-target offline packet remains available, but the owner's reviewed project can
provide the acoustic reference without redoing that worksheet. Phase03 stays60%.
