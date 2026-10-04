# UI-CONTRAST-01C1 — populated output and profile states

2026-10-05. Bounded continuation of 01C in the actual browser on the owned
`.scratch/ux-05b/project` copy, controller18119/API18120. The copied real output
is 78.746s; three synthetic Speaker profiles already existed. No new generation,
capture, consent attestation, deletion or owner-media edit was performed.

## Findings and repairs

- Light inactive library tab text/counts measured 3.91/3.33:1 on sunken fills.
  Use the theme foreground for shared library tab text/counts.
- Light ordinary Timeline words measured 4.47:1 on layered quiet fills. Use the
  theme foreground; active/selected/untrusted word colors retain their own rules.
- Advanced Speaker Properties summary/labels measured 3.91:1 in light mode.
  Use the theme foreground within that section.
- Dark inactive Speaker cards used a fixed translucent white fill, with subtitle
  contrast 1.88:1 and name4.04:1. Use the theme raised surface for those cards.

These are shared CSS fixes only. Profile Properties was opened and cancelled;
no profile properties were saved. Theme was restored to dark.

## Browser evidence

Opened selected real Voice Output, populated Speaker list, and Speaker Properties
in both themes. Six accepted samples total1,668 DOM text readings, minimum
4.615:1, zero below4.5:1. Counts repeat shared UI/words, including descendants
intersecting the viewport but potentially clipped by scrolling ancestors; they
are not1,668 unique components or a complete raster/accessibility audit.
The read-only audit composites ancestor background colors and computes WCAG
luminance; it does not model gradients, stacking or parent opacity. Screenshots
were saved and the light Properties view visually inspected. Console errors[]
at the final selected-output check. Output/light evidence precedes the final
card-only change, which does not touch output rendering.

Ignored evidence `.scratch/ui-contrast-01c1/`: `contrast-cases.json` retains
failed/before cases, `accepted-summary.json` names the passing cases,
`after-output-light.png`, `final-output-dark.png`, `final-properties-light.png`,
`final-properties-dark.png`, `final-profiles-light.png`, `final-profiles-dark.png`.

## Validation and remaining scope

Frontend497 tests /57 files pass in23.21s; typecheck passes. Final CSS production
build passes,96 modules,235.41kB CSS /698.22kB JS. Backend565 passed in150.26s
for the simultaneous STT repair, with two existing deprecation warnings.
No new CSS snapshot tests were added for this reversible visual repair.

Parent01C stays open: actual125/150% Windows DPI, native OBS/popups, reduced
motion, model run/publish and custom emotion colors still require their own
evidence. This round closes populated output/profile browser scope only.
