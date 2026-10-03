# UI-CONTRAST-01B — Highlight text contrast

Date: 2026-10-03
Result: Observed browser states pass after repair; exhaustive hardware/native coverage remains open.

## Scope and repairs

Inspect highlighted text in both themes, following UX-11B. This bounded round
changes shared foreground tokens and CSS consumers in the project hub, workspace
and modules. It does not change capture, recognition, media formats or engines.

- Separate accent, success, warning, error and clone text from their bright fills.
  Existing accent-ink is reused; lime-ink, gold-ink, red-ink and clone-ink now
  choose darker text in light mode and brighter text in dark mode.
- Correct overlap text, Remove/danger actions, Media Pool/status counts, recorder
  and Timeline labels, gain/level labels, training readiness and clone headings.
- Clone category badges use dark text on their teal/orange fills. Active control
  chips use the inverse foreground instead of white on a light dark-theme fill.
- Strengthen muted/light-theme and subtle text, selected library count labels,
  and fixed dark training-log timestamps. Keep bright artwork/fill colors and
  fixed dark-console text deliberate. The unused processor banner retains its
  existing fixed-background text colors.

## Running-browser evidence

Owned controller/API/Studio ports 18219/18220/18281, separate registry and copied
metadata under ignored `.scratch/ui-contrast-01b/`. Immutable media from the two
real UX-08B recordings is hardlinked and never edited. This is archived audio,
not a new physical OBS capture. Both themes use 1280×720, DPR 1 and font scale
1.08. Windows GetDpiForSystem returns 96 (100%).

The sweep opens Project Hub, Dashboard, Input, Voice Training, Voice Manipulator
and Voice Changer. It also exercises Media Pool footage selection and context
menu, checked import/STT controls, Script overlap selection and track row,
OBS Layer/Column, mute selection, Voice Script row selection and control chips,
clone/train radio selection, Windows menu, Preferences and runtime-log overlay.
Selected overlap remains linked to Timeline without autoplay.

After repair, **29 observed cases / 863 text readings**, zero readings below
4.5:1, minimum **4.75:1**. Readings repeat shared controls between views; they
are not 863 unique components. Acceptance samples and final menu/overlap checks
are in `after-audit.json`; intermediate failures are retained in
`audit-history.json`. Earlier before-audit parsing did not support color(srgb);
final audit correctly converts normalized sRGB components to 0–255. The table
below uses actual rgb/composited backgrounds and remains valid.

| Text / theme | Before | After |
| --- | ---: | ---: |
| LIVE DRAFT badge / light | 2.84:1 | 7.30:1 |
| Unselected overlap badge / light | 1.78:1 | 5.97:1 |
| Remove in footage menu / light | 2.71:1 | 6.71:1 |
| READY status / dark | 3.89:1 | 9.26:1 |
| Selected overlap / light | — | 15.14:1 |
| Selected overlap / dark | — | 15.38:1 |

Read-only DOM measurements composite ancestor background colors and compute
WCAG relative luminance. They skip disabled/offscreen text and report opacity;
this is not a complete accessibility audit or a raster-level gradient/stacking
analysis. Final light/dark screenshots are visually reviewed. Ctrl+A in an
owned unsaved Preferences textbox selects 26 characters with dark #181a16 text
on #ff6745 selection; cancel discards the temporary example URL. Existing
selection CSS already handles this correctly and is retained.

## Verification and cleanup

- `npm test -- --maxWorkers=1`: **55 files / 465 passed**, 114.49s.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; final production build after CSS review succeeds.
- `git diff --check`: pass.
- Eight original media hashes and their owned copies remain unchanged.
- Scratch managed services stop successfully; owned 18219/18220/18281 are free,
  session file removed. Theme is restored to dark, viewport unchanged, tab closed.

Evidence: `.scratch/ui-contrast-01b/{before-audit,after-audit,audit-history}.json`,
`final-input-light.png`, `final-input-dark.png`, `after-voice-dark.png`,
`selection-dark.png`, `frontend-test.log`, `build.log`, `media-after.json`,
`cleanup.json`. Browser checks precede a final reversal of an unused processor
banner foreground; no rendered audited selector changes in that final review.

Backend **501** remains the UX-10B baseline, not rerun: no API changes.
The isolated browser sweep observed intermittent project last-page atomic-write
WinError 5 and a Voice Changer device-worker `voice_stream` import failure;
these are retained in scratch logs, not represented as successful device/audio
acceptance. Shared UI views still render and status/error text is inspected.

## Remaining gate and next round

Physical Windows DPI 125/150%, native OBS dialogs, native select popups, model
run/publish states, populated generated-voice/profile lists, arbitrary custom
emotion colors and an exhaustive hover/focus/recycle matrix remain unverified.
The measured states pass; this does not assert every possible product state or
owner hardware is accepted. UX-10B six-source PCM backlog / Stop-to-archive delay
and recognition quality remain open and are unaffected by CSS repairs.

Exact next existing round: **GAP-PLAN**, reconcile the remaining verified code
and acceptance gaps into the next ordered rounds; retain these physical gates.
No new alphabet round and no completed Voice Training phase.
