# USER-FEEDBACK-19 — shared Script table

2026-10-10. One bounded round for the owner's cross-project Script UI request.
Product commit:278188d.

## Implemented

- Ordinary footage, imported/archived channel transcripts, pending OBS and
  VoiceScript share table header/row/cell/speaker/selection primitives.
  The reference is the owner's Conviction screenshot. Channel cards and their
  separate stylesheet are removed from the rendering path.
- Each row puts its profile dropdown beside a16.8px checkbox, with the row
  number underneath. No redundant speaker-name line. Channel labels appear
  below the dropdown; individual imported child documents retain this label.
  Unassigning to **Chưa gán Profile** and selected-row-only assignment remain.
- Canonical column geometry and editable column preferences are shared between
  projects, sources and pages. Old per-footage preferences no longer produce
  different layouts; their stored keys remain intact.
- Archived channel text inherits the same size/B/I/U formatting as ordinary
  table text. All tables use the same vertical scrollbar component/chrome and
  horizontal viewport. VoiceScript retains its Voice Model selector and TTS
  controls while adopting the common profile and checkbox arrangement.
- The existing Script toolbar/footer surrounds channel/live tables. Document
  export, clear and AI controls are visible but disabled for aggregate/live
  data rather than calling an unrelated parent document. Live segment timing
  is still draft data; no word timestamp or profile persistence is fabricated.

## Verification

- Initial cross-source regression:3 failures /1 pass. Ordinary speaker controls
  still occupied separate lines; channels and live OBS had no canonical grid.
- Focused final:92 tests pass /7 files. Includes13 new cross-source/stylesheet
  checks. Existing list selectors were updated to the new grid semantics;
  selection, seek, editing and scroll assertions/budgets were retained.
- Actual stylesheet tests (not Vite raw-CSS stubs) verify checkbox dimensions,
  checked/unchecked stability and the two-column inline speaker arrangement
  for footage, channels, live OBS and VoiceScript. The VoiceScript untick
  failure was repaired, keeping the assertion intact.
- Full frontend:728 tests pass /80 files in93.12s. Includes the existing ignored
  footage-switch performance test. Report:
  `.scratch/user-feedback-19/frontend.json`. This full run preceded the final
  timestamp code-tag/title polish; all92 affected tests and typecheck/build
  passed again after that polish.
- `npm run typecheck`, `npm run build`: pass. Built artifacts:
  `apps/web/dist/assets/index-BiC5IBI7.js`,
  `apps/web/dist/assets/index-5Rr9gH7i.css`.
- Full backend:741 passed /2 existing warnings in206.62s, run serially after
  the full frontend/build: `.scratch/user-feedback-19/backend.log`.
- `git diff --check`: pass. No test or DOM/performance budget was lowered.

## Remaining acceptance and exact next round

Refresh the built UI and compare Conviction with the OBS9 parent and a child
track. Check header/columns/text size, inline profile choice, the smaller
checkbox and row number, track placement, then tick/untick, assign/unassign,
Ctrl+A and scroll to the last transcript word. Also check VoiceScript's model
selection after assigning a profile. Automated DOM/CSS checks do not prove
native appearance on the owner's device. The previous browser automation
approval rejection remains respected without an alternative automation route.

Exact next: **STT-TIMING-ACCURACY-01 independent anchor review** after the owner
finishes the Conviction timing reference. UI consistency does not establish
acoustic word boundaries. Phase03 stays60%; media, production timing defaults,
model jobs and the benchmark gate remain unchanged.
