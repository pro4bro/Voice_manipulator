# VM-SCRIPT-UNIFIED-01 — verification

Date: 2026-10-25
Implementation: `1bb1b4a` (shared normal Script editor), `989861a` (Timeline).

## Owner request and round boundary

Input normal Script occupied a small strip above blank space; Voice Manipulator
normal Script had no visible scrollbar. Both pages must share speaker/dialogue
columns and independent/combined copy behavior. Timeline must resize, and dragging
playhead must agree with Script/subtitles without jumping time or scroll position.
The request also covers truncated sentence endings, newline timing and uppercase/
bold/underline delivery. Those audio behaviors remain open in the companion plan.
AGENTS.md limits an invocation to one verified bounded development round.

## Diagnosis and repair

- Input had a textarea/overlay implementation separate from Voice Manipulator's
  two-column editing host. Its editor stack did not grow with the Script document.
  Shared `ScriptTextPane` owns one vertical viewport/scrollbar; flex body/document/
  adapter/viewport fill their parent. Multi-source documents keep one outer
  viewport. Font scale applies once in the shared editor.
- `TranscriptTextView` projects canonical speaker turns into exact source slices,
  retaining whitespace, source identity and text offsets. Before recognition,
  multiline draft text stays one turn. Local first-word edits retain the turn ID
  until word reconciliation; semantically equal parent arrays cannot reset it.
- Dialogue-only, speaker-only and combined copy use one serializer. Native Range
  offsets back Find/context actions. Paste remains literal, Alt+Enter stays in a
  turn, Ctrl+Arrow preserves row bounds/direction, and local100-edit Undo/Redo
  applies on both pages. Timed-word reconciliation still happens on leaving Input.
- Before the shared editor migration, the held-playhead regression reproduced a
  seek at45s snapping to the word's40s start. Playback had set textarea selection;
  the select event became workspace word selection and a fresh Timeline seek/pan.
  Playback now uses CSS Highlight ranges without changing caret, focus or DOM
  Selection. Timeline seek/pan effects also yield to active scrub gestures.
- Shared playback follow pauses for manual scroll/typing. Multi-source text and
  table modes hold one owner during simultaneous speech and honor explicit source
  interaction, including resume at the same word.
- Horizontal divider above Timeline resizes the whole bottom module. Bounds retain
  upper-editor access, cancel/blur/unmount clean up listeners, keyboard arrows
  resize, and viewport shrink re-clamps. Height is machine-local and per page.

## Automated evidence

- Final standard `npm test`: **169 files /1361 tests passed**,196.58s, exit0.
  Log: `.scratch/vm-script-unified-01-frontend-final.log`.
- Final focused gate after review: **13 files /176 tests passed**,21.22s, exit0.
  Log: `.scratch/vm-script-unified-01-focused-final.log`.
- `npm run typecheck`: exit0. `npm run build`: exit0,237 modules transformed.
  Final build after reverting two unrelated equivalent CSS spelling changes:
  CSS `index-CvOkEaYc.css`, JS `index-DcpV9Zd6.js`.
- Lead reviewed correctness, boundaries, copy/edit protection, transient selection,
  source clocks, listener/storage cleanup, performance keys and scope. No new
  dependency, backend API, schema or engine change. `git diff --check` passes.
- No inference/training or owner media/project write was performed. No native
  listening result or artifact hash comparison is claimed. Backend was not rerun
  for this frontend-only round; prior full API baseline remains1626 passed.

## Why existing tests changed

An intermediate full run had seven failures at textarea/overlay assumptions;
those failures were not waived. The final run above is the acceptance gate.

- `ScriptEditor`, `ScriptSourceText`, registry actions and Timeline selection tests
  now use real DOM Range/literal input rather than `.value`, `setSelectionRange`
  or `fireEvent.change` on the new contenteditable host. Text/timing/revision,
  neighboring words, Find, context actions and Timeline overlay assertions remain.
- Text Ctrl+Z tests now verify local Undo/Redo, no global timed-history command,
  and timing commit on blur, matching the existing Voice Manipulator text contract.
  Non-editing global Script history tests remain active.
- Timing notices are real leading viewport content, outside editable text; tests
  check this ownership and scrollbar association instead of overlay translation.
- `Script.styles` and registry playback parity test CSS Highlight ranges/selection
  preservation instead of transparent textarea/duplicate-text overlay geometry.
  Range geometry and Highlight are mocked only in JSDOM. Tests still check real
  viewport following, manual pause, same-word resume and simultaneous source choice.
- New adapter regressions cover A/B/A grouping, exact whitespace, unrecognized
  multiline draft, equivalent-array rerenders, first-word replacement, Alt+Enter,
  Undo/Redo, all three copy scopes and paint-only highlight cleanup.

No assertions, required cases, timeout or gate were skipped to obtain green.

## Native acceptance and remaining work

Fresh CUA `getState` returns empty apps/browsers and
`Local browser use is disabled in Work settings`. No browser tab opens. No
workaround browser/control channel was used. Actual full-height layout, divider
drag, native selection/clipboard/IME and dark/light checks remain unverified.
Earlier pending native Script/history and frozen-subtitle UAT remain pending.

`docs/VM-SCRIPT-UNIFICATION-DELIVERY-PLAN.md` records the next audio rounds with
acceptance criteria. Source inspection found STT-end+300ms trimming, OmniVoice
natural output postprocessing, newline normalization and view-only B/U state;
it does not establish which stage caused the owner's audible ending issue.
No sentence-tail, pause,30/60/90 intensity, automatic gain or shouting feature is
represented as implemented. Stop this bounded round; Phase03 stays60%, Phase06 open.

## Owner clarification after the round

The owner confirmed that newlines add pauses. Each of uppercase, bold and
underline adds30% emphasis; any two give60%, all three give90%. This supersedes
fixed30/60/90 levels per format and the proposed highest-wins combination rule.
Audio gain remains separate and unspecified. The companion plan is corrected;
this documentation update does not implement synthesis or advance a product round.
