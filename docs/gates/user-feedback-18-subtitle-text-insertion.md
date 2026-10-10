# USER-FEEDBACK-18 — add subtitle text from the lane

2026-10-10. One bounded round for the owner's subtitle insertion request.
Product commit: 3186a8e.

## Implemented

- Right-clicking the subtitle lane offers **Add text**, including empty tracks
  and existing word menus. The clicked source time is retained separately from
  the selected word indexes.
- Double-clicking a genuine timing gap opens the existing inline phrase editor.
  Double-clicking a word still edits that word, including a word hidden by
  overview density filtering. Empty-track placeholder text also accepts the
  new gestures. Ctrl-click remains available.
- Enter or blur commits one text/word update; Escape discards it. The input is
  up to320px wide and stays inside the visible viewport near the audio end.
- Every inserted lexical token becomes a separate positive interval. Within a
  gap, equal intervals run from the chosen time toward the next existing word,
  with a small spacing between tokens. Near a boundary, the start is clamped
  into available space. Without a next anchor, the provisional fallback is90ms
  per token, clipped to the audio end. Estimates retain
  `user-interpolated`, `timingTrusted:false`, manual review metadata and the
  existing new-word highlight/promotion mechanisms.
- Bounded insertion splices exact word identities rather than realigning the
  document. Existing words, speaker attribution and timestamps remain intact,
  including repeated text and sub-millisecond gaps. With no available timing
  gap, no update is committed; an inline alert asks the user to adjust the
  neighbouring timing first. It can be dismissed with Escape.
- Ordinary Timeline, imported multitrack and archived OBS lanes route to the
  same editor and insertion helper. Live recording/read-only restrictions
  remain enforced. The existing asset callback updates Script and the subtitle
  lane together; the established session history receives the same one update.

## Verification

- Initial regression run:3 failures /13 passes. Add text was absent, and a gap
  double-click opened a prefilled word editor instead of an empty input.
- Focused final command:
  `npm test -- src/modules/timeline/timeline-editing.test.tsx src/modules/timeline/ImportedMultitrackTimeline.test.tsx src/modules/timeline/ObsLiveLinkTimeline.test.tsx src/modules/script/script-text-reconciliation.test.ts src/modules/script/transcript-performance.test.tsx --maxWorkers=2`
  —102 passed /5 files in11.99s.
- First full run:714 passed /1 failed,87.89s. The existing6000-word overview
  test caught loss of editing at a hidden source word. The handler now checks
  whether the clicked timestamp is occupied before choosing edit versus insert.
  The existing assertion and DOM budget were retained.
- An OBS test assertion was corrected from20.5s to20s: its recording starts at
  1s and ends at41s, so the current40s view midpoint is20s. Both insertion
  gestures preserve that clicked source time.
- Final full frontend:715 passed /78 files,90.55s, two workers. Report:
  `.scratch/user-feedback-18/frontend-tests.json`; the first full report is
  retained as `frontend-tests-first.json`. Count includes the pre-existing
  ignored footage-switch performance test. No test budget was lowered.
- `npm run typecheck`, `npm run build`, `git diff --check`: pass.
  Built bundle: `apps/web/dist/assets/index-CEHkJjrr.js`.
- Full backend: 741 passed /2 existing warnings in227.20s.

## Remaining acceptance and exact next round

Native visual/interaction acceptance remains after refreshing the built UI:
try right-click Add text and double-click a gap on an ordinary footage,
imported channel and stopped OBS track; type a phrase, Enter/blur, then
Undo/Redo and align a new word with the middle mouse gesture. Automated tests
prove the state and event paths, including separate boxes and actual
ModuleRegistry Script/OBS updates; they do not prove native device appearance.
The earlier automatic browser approval rejection is respected without a
browser automation workaround. No owner media, runtime or model job was changed.

Exact next: **STT-TIMING-ACCURACY-01 independent anchor review** after the owner
finishes reviewing Conviction. Freeze reviewed regions, audio identity and
word IN/OUT as a separate benchmark copy. New text's estimated timestamps
cannot serve as acoustic ground truth. Phase03 stays60%; timing accuracy gates
and production aligner defaults remain unchanged.
