# USER-FEEDBACK-10 — consistent Script scrolling

2026-10-09. Baseline `b7fe99a`, branch `feat/03-04-high-quality-training`.
One bounded feedback round; product commit `9fcd554`; design ADR0057.

## Owner feedback and understood scope

The owner reports Script jitter/cannot reach the end in test OBS 9 and Conviction,
runaway wheel scrolling in PDCA_CLDNDD_K4_V02, and missing OBS LiveLink scrollbars.
The clarification answer is **script**. This round changes shared Script scrolling.

## Actual project topology (read-only)

| Project | Script route | Timed words | Logical turns | Visual fragments |
| --- | --- | ---: | ---: | ---: |
| test OBS 9 | Archived ChannelScript | 1,136 | 10 | 25 |
| Conviction | ScriptTable | 665 | 15 | 19 |
| PDCA_CLDNDD_K4_V02 selected asset | ScriptTable | 42,107 | 3 | 659 |

OBS's largest turn has833 words/14 fragments. Data size and turn lengths differ;
both archived channels and table use useTranscriptWindow. Live OBS previously
used a thin native scroll list; table and prose had separate custom controls.
The differing scrollbar routes are source-proven. This is not a native wheel
reproduction on the three projects. Probe files are in
`.scratch/user-feedback-10/topology-evidence.{py,json,md}`.

## Red reproduction and repair

- Shared virtualizer measurement: an earlier fragment grows80->160; scrollTop
  remains100 instead of preserving the viewed text at180. Red assertion recorded.
- Identical refreshed row objects: measurements reset on array identity; actual
  hook enters a maximum-update-depth loop under identity churn. Red recorded.
- Actual ScriptEditor/Table path: after wheel/manual scroll to5,000, an equivalent
  transcript refresh with unchanged active word resets scrollTop to0. Red recorded.

Semantic measurement keys retain unchanged offscreen geometry. Measurements now
include row chrome and measured table header/notices. Correct earlier-height
changes after DOM commit, preserve the reading anchor and turn off competing
native anchoring. A partial row subtracts its repeated chrome from the spacer.
Manual browsing takes priority over playback follow; explicit seek/word selection
still reveals the intended word. Shared ScriptScrollbar replaces independent
Table/prose controls and adds visible controls to live/archive OBS. Keyboard,
pointer drag, minimum-thumb mapping and content range updates share one code path.
An independent review found Table's track spanning its bulk-action toolbar; a
positioned viewport region and a containment regression repair that mismatch.

## Verification

- Full frontend `npm test -- --maxWorkers=2`: **654 passed /75 files**,108.39s,
  before the final toolbar-wrapper containment refinement.
- Final affected callers/control: **53 passed /4 files**,6.01s. This includes the
  additional containment regression; there are655 current test cases in total,
  but this round does not label a full655-case invocation as executed.
- `npm run typecheck`: pass after final integration.
- `npm run build`: pass,125 modules, final `index-Dr4mvIQ_.js`,
  `index-Bv0UO2z8.css`, deletion Worker retained.
- `git diff --check`: pass. Tests use bundled Node24.19 via process-local PATH.
- Backend unchanged. Full API687/two existing warnings is the carried
  USER-FEEDBACK-08 baseline, not a rerun or new inference evidence.
- Integration initially exposed missing `scriptScroll` after consolidating
  geometry and a test implicit-this annotation; corrected and retested.
- No browser/CDP/Playwright workaround, service/OBS restart or inference dispatch.
  Original project data were read only; no media or transcript writes.

Logs are retained in `.scratch/user-feedback-10`. Source/jsdom tests establish
component logic, not physical wheel smoothness or rendered scrollbar visibility.

## Remaining gap / exact next

**UX-EDITING-DEVICE-01**: reload the normal app and wheel to the end of all three
projects, release the wheel and verify motion stops, verify the visible scrollbar
in live and archived OBS, and test manual browsing during playback then explicit
Timeline word selection. Native testing matters because scroll anchoring/layout
and wheel inertia require the real browser/device. Prior browser restrictions
remain in force; the owner can perform this acceptance.

Exact next executable round **STT-GAP-01** retains per-segment recognizer and merge
artifacts on an isolated copy to attribute missing OBS words before replacing any
owner transcript. Startup idle/cold, physical/LAN, reviewed word truth and Phase03
budgets remain open and unchanged. This round neither advances Phase03 beyond60%
nor counts historical quality gates as accepted.
