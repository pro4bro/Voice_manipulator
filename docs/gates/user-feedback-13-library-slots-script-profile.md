# USER-FEEDBACK-13 — Sound Library slots and Script profile controls

2026-10-09. One bounded round for the owner's five screenshot observations.

## Implemented scope

Sound Library profile slots contain selection, summary, Properties and nested
voices. Collection/Delete actions have a dedicated row and separate dimensions;
the former generic 20px voice-button rule no longer squeezes Collection text.
Fixed 20px selection boxes render a check without changing their dimensions.
Top-aligned content-sized grid rows prevent large empty vertical slots. Metadata
has bounded ellipsis and full-text titles. Bulk actions use compact wrapping
buttons. The shared module constrains the list scrollbar in Input, standalone and
Voice Manipulator routes, preserves side padding for deselection, and scrolls
profile forms. A Properties button makes editing available by keyboard/touch.

Archived/imported channel Script puts its profile selector in leading row
controls. Plain checkbox clicks toggle row membership; Shift ranges and Ctrl+A
remain. Only selected rows receive profile changes. The ordinary Script table
uses the same membership rule.

Explicit null `speakerId` records "Chưa gán Profile" independently of the
footage default, without inventing a diarization label or deleting raw provenance.
The shared Script mutation helper, Workspace save, Timeline context menu and
dataset ownership honor it. Null and inherited channel words do not coalesce.
Backend persistence retains null, and training excludes those words while
neighboring inherited words remain eligible. Legacy blank values still inherit.
No owner transcript/media is changed by this round.

## Reproduction and verification

- Sound Library caller: clicking a checkbox twice left `aria-pressed=true` on
  baseline; regression now passes for both profile and voice checks.
- Workspace caller: clearing a row saved undefined instead of null on baseline;
  regression now verifies explicit null, untouched neighbor and retained default.
- Worker Script caller regressions reproduced five initial UI failures and two
  additional raw-label/null grouping failures; focused final 56 tests/3 files pass.
- Compiler fixture reproduced the cleared word `tu8` entering training via manual
  mapping; it now remains absent while `tu3`/`tu12` remain. Focused 34 tests pass.
- Final frontend: **682 tests / 77 files passed** in99.30s.
- Final typecheck and production build passed. Assets:
  `index-XJTZ-Mbj.js`, `index-IE6yM22r.css`.
- Final full API suite: **704 passed, two existing deprecation warnings**, in236.03s.
  Frontend and backend suites ran serially; required artifact fixtures and media
  compiler tests use isolated data, without normal runtime/model actions.

Lead logs are retained in `.scratch/user-feedback-13/`, including Sound Library
and Workspace red/green output, full frontend, typecheck, build and full API.
Independent review found the standalone scroll constraint, missing explicit
Properties affordance and null-vs-blank distinction; all were addressed before
final verification. No browser workaround, normal runtime/model restart or
owner project mutation was performed.

## Remaining device acceptance / exact next round

After app restart/reload, check at the owner's narrow panel width:

1. Profile/voice slots and selected bulk actions stay contained; Collection and
   Delete remain usable; standalone and embedded list scrollbars stay at the edge.
2. Row profile selectors sit at the beginning; choosing a person and then
   "Chưa gán Profile" stays cleared after reopening the footage.
3. Clicking a selected row tick again unchecks it; Shift/Ctrl+A still work and
   long OBS Script reaches the end without React185.

These are rendered-device checks. Source/jsdom evidence does not prove pixels or
natural scrolling; the earlier browser policy rejection remains respected.
Phase03 stays60%; its model quality/calibration/device budgets remain open.
The exact next executable round is STT-GAP-01: retain recognizer and merge evidence
on an isolated OBS copy before repairing missing recognized word text.

Decision record: ADR0060. Product commit: `1532c47`.
