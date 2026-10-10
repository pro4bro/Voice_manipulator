# USER-FEEDBACK-21 — canonical Script word spacing

2026-10-10. The owner requests the Conviction spacing in screenshot1 for
archived/multitrack Script text shown in screenshot2.

## Cause and fix

The shared buttons already inherited the same font, padding and line height.
Ordinary ScriptTable and VoiceScript also wrapped each word in
`script-table__word-wrap`, a relative inline block with normal whitespace.
ChannelScript used an unclassified inline span instead. Its trailing spaces
participated in the surrounding line's whitespace layout, adding space between
the word buttons compared with the canonical footage word wrappers.

ChannelScript now uses the existing canonical word wrapper. No compensating
project-specific spacing rule is introduced. Existing font sizing, button
padding, selection styling, text, word timing and callbacks stay intact.

## Evidence

- Two real-stylesheet regression cases (imported archive / OBS recording) failed
  before the fix: missing canonical wrapper. Private report:
  `.scratch/user-feedback-21/red.json`.
- After the fix, stylesheet tests compare wrapper display, trailing text,
  button padding/margin/font/line-height/letter/word spacing, content font
  family and line height with an ordinary Script instance.
- Focused38 passed /4 files, including channel edits, registry profile/actions
  and transcript window regressions. Report:
  `.scratch/user-feedback-21/focused.json`.
- Product commit: `9faf5d3`.
- Full frontend752 passed /83 files in97.32s. Report:
  `.scratch/user-feedback-21/frontend.json`. All product changes preceded
  this run.
- `npm run typecheck`, `npm run build`, `git diff --check`: pass.
- Built JS: `apps/web/dist/assets/index-Bgc3As2g.js`; CSS remains the canonical
  `apps/web/dist/assets/index-CLmJA0zg.css` because the fix reuses existing CSS.
- Full backend741 passed /2 existing warnings in224.01s, run serially after
  frontend/build. Report: `.scratch/user-feedback-21/backend.log`.

No existing selection, timing or performance assertion was removed. Native
visual acceptance remains after refreshing the built UI and comparing
Conviction with the OBS9 parent at the same Script SIZE setting. DOM/stylesheet
checks establish matching markup/styles; they do not measure native glyph
geometry. The earlier browser automation approval rejection remains respected.

Exact next planned round: **STT-TIMING-ACCURACY-01 independent anchor review**,
after the owner completes the Conviction timing reference. The reference is
needed to measure acoustic boundaries independently. Phase03 stays60%.
