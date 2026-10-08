# USER-FEEDBACK-01 — restart recovery and footage UI

2026-10-08. Owner feedback: stuck STT after closing the app/removing footage,
rerun-all versus missing-only choices, compact Import/Folder controls,
responsive footage selection, and crowded Timeline subtitles.

## Implemented scope

- Startup/Open Existing reconcile orphaned sequential STT and diarization,
  keeping live queue owners and validated dedicated resume ownership.
- Recycle/permanent removal cancel owned work before changing media state.
- Recovery discovery, project opening and removal storage work run off the API
  event loop. LiveLink worker scheduling keeps event-loop ownership. A bounded
  Windows checkpoint-replace retry tolerates transient PermissionError while
  persistent failure remains visible and retains the preceding checkpoint.
- Shared in-app processing choice for STT, diarization, Training targets and
  Generate rows; cancel sends nothing. Generate all requests actual regeneration
  with immutable clip revisions; earlier outputs survive failures/cancellation.
- Training/Generate eligibility compares effective settings including defaults;
  missing or empty output WAVs are reported unavailable rather than skipped.
- Generation completion waits for GPU lease handover before offering another
  run. A deterministic blocked-release test reproduced the prior race.
- Icon Import and folder-plus controls are adjacent; folder/subfolder creation
  and multi-file/browser-upload behavior remain available.
- Independent media loading and deferred Script/Timeline construction let the
  selection/loading state commit before expensive transcript rendering.
- Shared subtitle density rule preserves source-time hit targets and all edit
  handlers; labels/boxes are hidden when a word slot is below 22px and reappear
  with zoom. Normal/imported/OBS timelines use the same rule.

## Evidence

Regression-first checks reproduced startup and Open Existing retaining orphan
processing, mixed STT dispatching before a choice (including recycled media),
catalog load withholding Media Pool, and immediate heavy selection without a
loading commit. Forced-generation tests reproduced cache reuse despite a force
request. Each focused check subsequently passed.

- Frontend `npm test`: 580 tests / 67 files passed, including the ignored render
  benchmark. One full run exposed a timing assumption in the stopped-output
  test; it now awaits the deferred Timeline before asserting the same output.
- `npm run typecheck` and `npm run build`: passed; production bundle rebuilt.
- Focused Voice Script suite: 28 passed, including force-regeneration WAV,
  failure/cancellation retaining old hashes, default reuse, and delayed lease
  release. Test engines write actual synthetic WAVs, not real model speech.
- Initial full API check exposed readiness fixtures lacking a valid parent
  manifest (3 failures) and the generation handover race (1 failure). These
  triggered follow-up fixes rather than being treated as acceptable failures.
- A subsequent full run exposed offloading LiveLink task scheduling from its
  event loop and a transient Windows follow-state replacement failure. LiveLink
  scheduling was restored to its loop; the replacement retry has transient and
  persistent-failure regressions. Shutdown draining of an in-flight watcher was
  verified separately and required no watcher behavior change.
- Open Existing health responsiveness has real Uvicorn regressions with a held
  lock on the actual Media Library instance, and with a blocked project open.
  Both synchronous paths failed before offloading and pass afterward. The first
  discovery test used another instance's lock, so its passing result was rejected.
  Startup discovery still precedes binding; the startup tests verify binding
  while the resumed worker is stalled, not while discovery itself is stalled.
- Final API acceptance: `.venv/Scripts/python.exe -m pytest services/api/tests
  -q -x` — 677 passed in207.05s, with the two existing audioop/Starlette warnings.
  Related recovery/MKV/LiveLink/queue/shutdown suite:72 passed. Final production
  bundle:112 modules, CSS246.07kB, JS746.38kB; `git diff --check` passed.

Ignored reproducible render benchmark:
`apps/web/.scratch/footage-switch.performance.test.tsx` and its JSON result.
Using real ScriptEditor with 3,000 synthetic timed words in React development
JSDOM, the retained JSON reports serial first selection commit at658.6ms with
all words constructed; progressive feedback committed at3.4ms with no words,
then the table committed at503.8ms. Total rendering still takes work. This is one
synthetic comparison
of commit scheduling, not browser INP, real GPU-load responsiveness or a product
latency guarantee.

## Original project repair

Normal app ports 18119/18120/18081/18319 were offline. Before-state registry
summaries and affected indexes were saved under `.scratch/stt-recovery-01/`.
Product recovery settled recycled MP3 `asset-60995256c29e` in
`PDCA_CLDNDD_K4_V02` from processing to cancelled. Original index comparison
proves completed media/text fields unchanged; word-file backups compare equal.
A second pass changed no statuses and retained 24 audited file hashes. The
first repair script stopped on its ownership assertion before touching the
next project; its audited continuation records the complete result.

`Test_OBS_05` has six processing child tracks, an enabled growing-MKV parent and
valid unfinished detailed STT cursors. Its children are legitimate checkpoint
resume targets; they were retained, and its original index SHA256 is unchanged.
No worker/model/service was started by the metadata repair.

## Remaining acceptance

Browser/native UI policy restrictions from the preceding device rounds still
prevent new visual/device acceptance in this session. DOM/component/API evidence
does not prove the screenshot's final appearance or audible scrubbing. Owner
checks should cover restart/rerun, both dialog branches, rapid footage selection
under STT load, subtitle zoom/editing and folder controls. Older recognition,
speaker identity, physical mic/OBS, browser downloads and second-machine LAN
gates remain open; Phase 03 stays at 60%.

Exact next round: UX-EDITING-DEVICE-01, once an allowed browser/native surface
and audio/device evidence are available.

## Owner checks after reopening the rebuilt app

1. On a test project, close while ordinary STT is active, then reopen. Interrupted
   footage should show cancelled rather than processing, permit a fresh STT,
   and retain earlier completed text. Valid dedicated MKV/OBS checkpoints may
   resume; finish/Stop those workflows through their existing controls.
2. Select completed and new targets. STT/DIA/Training/Generate should ask before
   starting; Cancel starts nothing, missing-only skips completed targets, and
   all reruns the eligible selection. Training targets speakers; Generate
   missing-only makes a separate output containing its missing rows.
3. During background STT, switch rapidly between completed footage. Selection
   and loading feedback should appear before the heavy Script/Timeline; once
   loaded, both must show the latest selected footage, with no old editable text.
4. Zoom subtitle tracks out and in on normal/imported/OBS timelines. Tiny word
   boxes should not form a red/white grid; zoom should restore labels. Verify
   hover, double-click edits and middle-button timestamp assignment still work.
5. Verify adjacent Import and folder-plus icons, multi-file selection, folder/
   subfolder creation and moving footage. Record observed real-load delays and
   screenshots; DOM/JSDOM evidence cannot replace these checks.
