# VM-SCRIPT-TEXT-FREEZE-01 — verification

Date: 2026-10-25

## Scope

Two aligned Script text columns with column-sensitive plain-text copy; common
layered Timeline vertical scrolling with its single ruler and frozen subtitles.
See `docs/VM-SCRIPT-TEXT-FREEZE-PLAN.md` and ADR0146 for the contract.

## Evidence

- Timeline focused regression: **7 files / 79 tests passed**, 15.17s. Covers
  shared zoom/pan/playhead, ordinary Timeline navigation/editing, direct layer
  commands, sticky-strip viewport transforms, vertical wheel pass-through and
  rejection of drops behind frozen subtitles or outside the common viewport.
- The new common-region assertion failed before implementation. All related
  focused tests pass after implementation. One new test initially assumed a
  fixed scroll offset after playback-follow recentered it; corrected to compare
  strips against the actual shared layer transform.
- Full standard `npm test`: **167 files / 1341 tests passed**, 204.33s.
  Log: `.scratch/vm-script-text-freeze-full.log`. No skips, weakened assertions,
  timeout changes or persistent test configuration changes.
- Final `npm run typecheck` and `npm run build` pass; **233 modules** transformed.
  Lead reviewed the integrated diff and `git diff --check` passes.
- Final focused Script: **4 files / 37 tests passed**, 5.25s, and typecheck passes.
  Covers native Range serialization in both directions, partial/cross-column
  selections, blank intermediate turns/header exclusion, stable-ID edits,
  multiline paste/Alt+Enter, same-ID external updates with caret restoration,
  Find advancing across turns, guarded cross-turn IME/cut/drop and delete edges.
  Shared text-coordinate regressions include browser-created DIV/BR markup.
- Lead review reproduced a block-newline clipboard loss (`Xinchàonhé` versus
  multiline text), then unified save/copy/find/caret coordinates in one helper.
  A round-trip test exposed a missing blank-line position at BR; fixed without
  weakening the expected text or offsets. Browser-native history/IME is still
  explicitly unverified below, regardless of DOM event simulation coverage.

## Browser gate

Completion follow-up: Browser briefly worked after the owner's restart. Native
copy (with/without labels), common vertical scrolling/frozen-subtitle geometry,
shared zoom/pan and locked layer transfer were observed. Native editing uncovered
cell splitting/out-of-cell paste; the final literal-text/history repair passes
39 focused Script tests and1343 full frontend tests across167 files, with
Typecheck/build233 green. It has not yet been retested natively because CUA
again refused Browser access after continuation. Real IME, final text/history/
reload and light-theme/saved screenshot checks remain open. No owner project or
model was changed. See `vm-script-two-round-closure-20261025.md` for exact evidence
and the scoped checklist. Earlier blocked-only descriptions are superseded by
this partial native result, not by a claim of complete browser acceptance.

## Related backend gate

This UI round changes no backend/audio composition implementation. The preceding
legacy-turn round completed its full API run:1625 passed, one unchanged60s
embedded VibeVoice import timeout, three existing warnings. Its focused26 tests
pass; see `vm-legacy-script-turns-01-20261025.md`. The completion rerun now passes all1626 API tests with three existing warnings;
the earlier intermittent import delay is not claimed to be root-caused.

Phase03 remains60%, Phase06 open.

Implementation commits: `d2d099e` (common Timeline stack), `790747d` (wheel
regression), `099ace7` (Script columns and shared plain-text coordinates).
