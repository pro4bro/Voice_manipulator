# USER-FEEDBACK-04 — Script rows, selection, subtitles and history

2026-10-09. Baseline e401380. Owner reports that the app now responds well;
this round addresses the new screenshots and Script interaction requirements.

## Delivered

- One logical speaker row owns its virtual word fragments. Long undiarized
  transcripts no longer display repeated row/speaker/selection controls. An
  explicit assignment to the same inherited profile does not create another row.
  Word DOM remains bounded and original distant-word indexes remain editable.
- Checked/unchecked selection controls use the same fixed24x24px box; each
  visible logical row shows its original ordinal below that box. Applies to
  ordinary Script and archived/imported ChannelScript rows.
- Dense subtitle overviews show readable snippets in non-overlapping screen
  slots across normal, imported multitrack and archived OBS timelines. Zoom
  reveals more detail, then individual timed labels. Snippets are visual summaries;
  source timestamps, pointer editing and promotion stay unchanged.
- Speaker choices are restricted to checked rows. Row/toolbar dropdowns, word
  context choices and plain/tag attribution cannot assign an unchecked row.
  The row selector applies the chosen profile to all checked rows. Empty row
  selections do not fall back to assigning the entire footage.
- Ctrl+A while pointing at Script selects every logical row, including those
  outside the viewport. Active text editing retains native text selection.
- Ctrl+Z undoes and Ctrl+Shift+Z redoes up to30 committed Script edit steps,
  restoring text, timing and speaker/environment/emotion metadata together.
  New edits clear the redo branch; pending text edits are committed before
  history navigation. A cross-track bulk speaker choice is grouped into one
  undo step. Ordered project saves retain the newest restored state.

## Evidence

Red before fixes:

- `npm test -- --run src/modules/script/transcript-performance.test.tsx
  src/modules/script/ScriptEditor.test.tsx -t 'single speaker turn|only assigns checked'`
  failed both regressions:4 grid rows for one speaker and an unchecked row changed.
- The inherited/explicit same-profile regression returned3 rows instead of1.

Green checks retain the6,000-word bounded DOM and edit-at-word5500 tests, with
one row/selector. Tests cover check-required assignment, ordinals, pointer-scoped
Ctrl+A/undo/redo, finishing prose before redo, thirty-step history, redo invalidation,
grouped cross-track history and ordered API restoration of text/timing/speaker.
Worker subtitle slice:68 focused tests pass. Script slice:111 tests pass before
the final history cases; focused Workspace/Editor:74 pass after pending-edit redo.

Initial full frontend run:606 passed,3 failed; two tests still assumed unchecked
context assignment and the inheritance case was not yet repaired. Those old
expectations were updated to the owner's selection rule, and inheritance fixed.
Next full run:609/70 pass with `--maxWorkers=4` in117.32s. Default full concurrency
temporarily left about1.1GiB free on this64GiB host; capped test workers avoid that
pressure without changing production scheduling. Final results follow below.

- `npm test -- --maxWorkers=4`: **611 passed / 70 files**, 57.75s. Includes
  the existing ignored `.scratch/footage-switch.performance.test.tsx`; tracked
  suite is610/69. No production concurrency setting changed.
- `npm run typecheck`: pass.
- `npm run build`: pass,118 modules; JS767.26kB/gzip221.82kB,
  CSS249.55kB/gzip38.63kB.
- `.venv/Scripts/python.exe -m pytest services/api/tests -q`: **677 passed**,
  two existing warnings in236.78s (Starlette/httpx and deprecated audioop).
- `git diff --check`: pass; existing Windows LF/CRLF conversion notices only.

## Remaining acceptance — UX-EDITING-DEVICE-01

Earlier browser tool policy rejection remains; no alternate browser/CDP/shell
automation was used. No normal service restart, engine/model dispatch, owner
media or project-format mutation occurred. Tests use disposable fixtures.

After refreshing the UI:

1. Open a long STT-only footage: one speaker row, one fixed selection box and
   row1; scroll and select far words, then check real speaker changes produce rows.
2. Check one/several rows and choose a profile. Only those rows change; unchecked
   selectors/context attribution are unavailable. Hover Script and use Ctrl+A.
3. At full Timeline zoom, read snippets; zoom in for more words. Check ordinary,
   imported tracks and archived OBS, including timed editing/promotion.
4. Edit text, timing and speaker; undo/redo and reverse a multi-track assignment.
   Check30-step limit and that a new edit removes the previous redo branch.

Pixel-level checkbox/theme/ordinal layout, snippet legibility, estimated-row scroll
stability and audible device behavior remain unverified by real browser capture.
Owner's responsiveness confirmation supports the previous round; it does not
replace visual acceptance of this new design. Older physical mic/OBS, reviewed
recognition/speaker/identity, download/cancel and second-machine LAN/Tailscale
gates remain. Phase03 budgets and the Queue proposal are unchanged.
