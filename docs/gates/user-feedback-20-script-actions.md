# USER-FEEDBACK-20 — Script command parity

2026-10-10. Owner screenshots: disabled profile selects in Conviction/OBS9 and
disabled commands on the archived OBS parent. This round repairs those paths
and audits shared module wiring.

## Reproduction and correction

Five registry caller tests were written first. All five failed on the actual
disabled row selects and parent toolbar/footer. Private red evidence:
`.scratch/user-feedback-20/red.json`.

The common select now opens with zero, one or many profiles and always offers
Chưa gán Profile. With no row selected, opening checks the clicked row. With
an existing selection, assignment/unassignment touches only selected rows.
This rule applies to ordinary Script, channels and VoiceScript.

The archived parent now supplies real child documents and table/text renderers
to the common editor. Find/Replace, pause formatting, text editing and clearing
keep per-source offsets, clocks and metadata. Native copy/paste remains native.
Multi-source changes use one Undo step. Export and AI fix address children,
wait for pending writes and report source results. AI candidates can be kept,
accepted or manually edited; they are not automatically accepted. Late AI
responses retain newer user text/words and do not resurrect removed footage.

## Module audit

| Module | Shared contract inspected | Result / readiness distinction |
| --- | --- | --- |
| Script | ModuleRegistry → ScriptEditor; ScriptTable, ChannelScript, live OBS, VoiceScript → shared row control/layout | Fixed row disabling and aggregate command targeting. Pending live drafts have no archived word document to edit/export. |
| Media Pool | Direct route and LibraryPanel use MediaPool with common registry props | Same import, list selection, tick, recycle and folder callbacks; multiple root selections intentionally defer transcript loading. |
| Sound Library | Direct route, LibraryPanel and ManipulatorLibrary use VoiceVault | Same catalog/profile/model/Collection callbacks. VoiceScript row dropdown inherited the common correction. |
| Voice Output | Direct route and ManipulatorLibrary use VoiceOutputPanel | Same open, export and deletion callbacks. |
| Timeline | Ordinary, imported and OBS adapters share zoom, waveform path/CSS, subtitle density and editable Timeline focus | Source clocks/live transport differ; archived editing and history callbacks share asset ownership. Generated output is deliberately not an editable source-footage transcript. |
| Recorder / Training / Generation | Registry callbacks and existing full-suite coverage | Source/device and processor readiness remain prerequisites; no project-name condition found in inspected routing. No physical capture/model job was run. |

The audit establishes inspected wiring and automated behavior, not a guarantee
for every physical device/source combination. No new data format or engine
artifact is introduced.

## Validation

- Product commit: `c253313`.
- Final full frontend:750 passed /83 files in93.46s. Report:
  `.scratch/user-feedback-20/final-frontend.json`. All final source changes
  precede this run; no post-run product changes were made.
- Earlier focused Script/registry:179 passed; workspace:47 passed, including
  the three actual persistence/dispatch regressions. Final caller tests:13.
- `npm run typecheck`, `npm run build`, `git diff --check`: pass.
- Build artifacts: `apps/web/dist/assets/index-ZGmsZeev.js`,
  `apps/web/dist/assets/index-CLmJA0zg.css`; the existing deletion worker remains
  `script-word-deletion.worker-BsFt6hbY.js`.
- Full backend, serial after frontend/build:741 passed /2 existing warnings
  in189.09s. Report: `.scratch/user-feedback-20/backend.log`.
- No real AI endpoint/model job or owner audio mutation was used for testing.
No test assertion about selection, audio clocks or performance is removed.
The old assertions requiring disabled row dropdowns are replaced by enabled
dropdown assertions plus an unchecked assignment guard.

## Owner acceptance and remaining gate

Refresh the built UI. In Conviction and the OBS9 parent:

1. Open an unticked row dropdown. Choose a profile, then Chưa gán Profile.
2. Select several rows and choose from a row dropdown; only selected rows change.
3. Toggle DẠNG BẢNG, Find/Replace text in each track, apply AUTO NHỊP, then Undo/Redo.
4. Export the parent and check the separate track outputs. Run AI fix when its
   endpoint is configured and check the per-track proposals.

Native browser automation remains unavailable under the previous approval
rejection; no alternative automation route was used. Automated caller/DOM/CSS
checks do not prove native popup rendering on the owner's device.

Exact next planned round: **STT-TIMING-ACCURACY-01 independent anchor review**
after the owner completes the Conviction timing reference. That evidence is
needed to measure acoustic boundaries independently of STT's own output.
Phase03 remains60%; this UI correction does not close the acoustic gate.
