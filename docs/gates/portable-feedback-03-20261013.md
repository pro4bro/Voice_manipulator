# PORT-FEEDBACK-03 — immediate Media Pool and Voice Output slots

Date: 2026-10-13. Product commit: `d735469200fd0d7abd2906208790a1efbd588b85`.
Issued release: **alpha 0.5.13 / NoVibeVoice**. Phase03 stays60%.

## Contract and source changes

The owner requests a slot as the first UI response to any operation that adds
footage or generated speech, with animation while the operation is working.
Main source was repaired first, then the numbered update was built from it.
The durable owner rule and the new slot preference were saved in OpenViking.
ADR0073 records client slot identity and authoritative artifact replacement.

- Import queues retain immediate rows. Multitrack import marks the inspected
  row busy during decoding and leaves a static error on failure. File inspection
  errors no longer silently remove their rows. Import-choice rows stay static.
- Microphone/system/HQ capture emits a slot before requesting permission. It
  carries the capture ID through recording/saving and is replaced only after
  the saved asset receipt. Upload failure retains the File for retry in the
  current project session. A receipt survives failed transcript annotation
  without reuploading or creating a second footage.
- OBS Start emits a client row before the API call, attaches the actual recording
  ID on acknowledgement, and refreshes Media Pool immediately. The journal or
  MKA replaces the optimistic row without duplication. Active capture/archive
  animates; errors and paused capture do not. Start errors cannot be revived by
  stale controller status. Pause/resume/stop create no new slots.
- The separate Choose MKV from OBS path also publishes an inspected-file row,
  marks it static while mapping tracks, and retains it through session decoding.
  Workspace follows pending session IDs even after changing pages; a ready
  session without its actual media asset cannot remove the slot.
- Generate Voice creates the first Voice Output row before dispatch. It shows
  progress during the server job and swaps to the real output receipt. Failure
  and cancellation retain a static status. Active slots cannot be hidden;
  terminal states can be dismissed. Existing Stop response fencing is retained.
- Pending rows suppress the misleading empty-library message and respect
  reduced-motion preferences. They are transient UI state, not playable assets,
  training inputs or successfully generated files.

No engine, model, GPU processing configuration, source media or project format
was changed. A complete app reload does not restore transient client slots.

## Regression evidence and actual failures

All logs below are in `.scratch/portable-feedback-03/`.

- Initial Lead regressions: `slots-red.log`, **5failed/117passed** across Recorder,
  Media Pool and Workspace. Deferred permission/upload/generation calls expose
  missing immediate state. The first log-redirection attempt did not execute
  tests because its destination was missing; it is not regression evidence.
- OBS controller Worker: **3failed/27passed** before implementation, **30passed**
  after. Tests cover pre-ACK state, actual identity, error and callback freshness.
  One command used an unsupported minWorkers option and was rerun correctly.
- Voice Output Worker: **3failed/9passed** before implementation, **12passed**
  after. It verifies visible pending/error/cancelled states and ready-item dedup.
- First integration attempt: `slots-green.log`, **55failed/109passed** from a
  misspelled local-import variable. Typecheck also found an invalid test status;
  both were corrected. `slots-green-fixed.log`: **164passed**.
- Later integration/full run had **1failed**, from asserting the ordinary-asset
  accessible name on an OBS MKA asset with a different existing label. The
  test now verifies the real named asset and absence of the pending OBS row.
  This assertion correction did not suppress a test or change a product label.
- Separate OBS-file regression: `obs-file-red.log`, **1failed/6passed** before
  that import path emitted a slot. Integrated import checks later **120passed**.
- Final complete frontend: `frontend-final-fixed.log`, **814passed/84files**,
  193.71s. Includes recording retry/receipt, generation progress/output and
  OBS import across page changes with a missing-receipt negative control.
- `typecheck-final.log` and `build-final.log`: pass. Builder rebuilds the same
  final JS/CSS successfully. `git diff --check`: pass.
- Backend: `backend-final.log`, **819passed**,334.60s, three warnings: existing
  Starlette test-client deprecation, audioop deprecation and deliberate duplicate
  ZIP path fixture warning. No backend product code changed.

Lead reviewed worker diffs, integration wiring, terminal-state behavior, receipt
safety and test changes. No independent Claude review was performed this round.

## Real source/portable browser and media

Source API18133 used the source Vite dist; portable API18134 used installed
services/API and `.runtime/python/core/python.exe`. Both used isolated,
project-relative PCM fixtures under this round's scratch directory. No owner
project, OBS profile, microphone permission or hardware capture was touched.

The fixture server overrides runtime status and the OS picker with an owned WAV,
then holds import-local before the real decoder runs. The product API client,
Workspace, Media Pool and CSS are real. After release, the normal API decodes,
caches and publishes the asset. This controlled hold tests UI waiting behavior;
it is not a claim about native picker speed or capture latency.

`source-ui-report.json` and `portable-ui-report.json` match exactly:

```json
{"animation":"media-pool-import-pulse","busy":"true","text":"analysis.wavĐANG CACHE VÀ TẠO FOOTAGE"}
```

The pending row disappears after release and the ready footage appears.
Browser console error/warning arrays were empty. Two ordinary analysis.wav
rows at the end are intentional separate test imports; no pending row remains.

Source and embedded portable artifact checks preserve source/cache SHA256
`e40aafc9d7354d47f1fd011b663283258431d8b09504947c060912c176af09c5`:
5.0s,120000frames,24000Hz,mono,16-bit PCM. Reports:
`source-import-artifact.json`, `portable-import-artifact.json`.

Screenshots: [source waiting](../feedback/PORT-FEEDBACK-03-source-import.jpg),
[portable waiting](../feedback/PORT-FEEDBACK-03-portable-import.jpg),
[portable ready](../feedback/PORT-FEEDBACK-03-portable-ready.jpg).

## Numbered release and installed parity

Actual source `MAKE-PORTABLE-UPDATE.bat` issued alpha0.5.13. Actual validation
portable root `UPDATE-PORTABLE.bat -NoRestart` selected it automatically and
returned **updatedtrue/appFiles154/modelLayerChangedfalse/gatePassed33/
gateFailed0**. Logs: `make-update.log`, `apply-update.log`.

Validation bundle remains at
`.scratch/portable-rebuild-debug/validation-alpha-0.5.11`, with installed app
version0.5.13. Its older directory name does not determine release selection.

Delivery ZIP:

- `.scratch/portable-updates/Pro4Bro-AppUpdate-alpha-0.5.13-NoVibeVoice.zip`
- Contains the whole numbered folder `App-alpha-0.5.13-NoVibeVoice/`.
- **1,227,314bytes**,158files,154app entries verified against source mappings,
  payload and installed portable. ZIP CRC and all bytes match.
- SHA256: `a582f685815e2a604d436df50b09616b96795a1fa30d3bb32550c2304cc5719e`.
- Model-layer manifest remains
  `595D89F52B3D9876C07915BFC09E271DBEAA5AD3271B0DC142E7348E9D36DCC9`.
- VibeVoice remains listed without payload. No heavy core/model recopy required.

`sourceWorkingTreeDirty=true` records the release ledger/untracked research
present at packaging. The product changes are committed at d735469; byte
comparisons identify the exact shipped app. `release-report.json` holds hashes.

One parity helper initially failed reading UTF-8 JSON with Windows default
encoding; rerunning with explicit UTF-8 passed. An initial fixture launch used
the absent generic Python path; corrected to the actual core runtime. Neither
failure modified the issued update, core layer or production launcher.

## Owner acceptance / exact next round

**PORT-FEEDBACK-UAT-03:** extract the numbered folder into the D-machine portable
`updates`, run root `UPDATE-PORTABLE.bat`, require release0.5.13/gateFailed0, then
root `open-pro4bro-console.bat`. An old0.5.7-or-earlier updater can use the
pack's `APPLY-UPDATE.bat` once. Test visible first slots for browser/native/
multitrack import, mic/system/HQ, OBS Start and Generate Voice. Confirm working
animation, static errors, ready replacement and no duplicate slot; repeat prior
selected-track/Mute/Solo, failed OBS bin and trained-voice ZIP acceptance.

Deferred API/component tests and real WAV browser parity do not prove physical
OBS PCM transport, microphone/GPU generation quality or timing on the other
machine. The earlier zero-PCM OBS cause remains unconfirmed. Independent timing
review still awaits Conviction. Phase03 remains60%; no product phase advance.

Own fixture listeners and browser tabs were closed after evidence capture.
This bounded technical round ends after release delivery and gap reporting.
