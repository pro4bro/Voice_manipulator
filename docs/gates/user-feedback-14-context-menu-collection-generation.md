# USER-FEEDBACK-14 — Library context actions and Collection generation

2026-10-09. One bounded round for the latest Sound Library feedback.

## Implemented scope

Selecting profiles or models no longer inserts a bulk toolbar. Right-click opens
profile color/apply/delete/deselect or model delete/deselect actions. A selected
item retains the existing range; an unselected item becomes the single target.
Nested model menus do not select the parent profile. Keyboard ContextMenu and
Shift+F10, arrows/Home/End, Escape and focus restoration are covered. The menu is
bounded to the viewport; the shared component covers all Sound Library routes.

Speaker Profile is the identity/classification/consent object; ProjectVoice is
the model used for generation. Separate checks select these different objects,
not two training versions. The library now labels these levels "Hồ sơ người nói"
and "Model giọng". Only a locally created trained model offers Add to Collection.
An imported model shows its Collection origin and hides that action.

Optional ProjectVoice.collectionSource is returned/stored on new imports. Legacy
get/list project origin from the existing collection-import.json without changing
owner records. Marker reads validate IDs, containment and a bounded16KiB payload.
Invalid markers leave ordinary voice metadata readable. Origin metadata grants
no publication authorization; existing artifact/hash/model-set gates remain.

Voice Manipulation previously filtered imported full/LoRA models out when Voice
Training selected clone. A separate generation category now activates the imported
model immediately and on the first successful voice load after reopening. A
compact "Loại voice" selector permits manual changes without modifying Training
settings. Manual choices survive refresh within the session; a new import selects
its own category. RVC remains outside TTS generation.

## Reproduction and verification

The red library regressions reproduce the unwanted selected toolbar and imported
Add to Collection action. The Workspace caller reproduces a full model hidden by
the clone Training filter. Backend red regressions reproduce missing origin on
new imports and legacy list/get. Focused green suites cover context menu selection
and keyboard behavior, import/reopen and the generation request's imported voice
ID. These request checks use mocks, not model inference.

Read-only owner evidence: test-obs-9 voice-a5f61ea672a4 is a full model linked to
speaker-e401ffcaf59e and already has a Collection import marker. The production
reader now projects its collection/entry IDs. No owner record or model was edited.

- Focused Library: **16 tests passed**; Workspace/Generator: **51 passed**;
  Collection/ProjectVoice backend: **31 passed**, two existing warnings.
- Initial full frontend:689 passed and one failure. The ModuleRegistry bulk-delete
  test still pressed the removed toolbar button. It now opens the menu and checks
  the same grouped deletion callback/confirmation; this follows the requested UI
  contract rather than relaxing deletion assertions. The failed log is retained.
- Final frontend: **690 tests / 77 files passed**,92.35s.
- Typecheck and production build passed. Assets: `index-lhGi4J4W.js`,
  `index-BCyTl61Q.css`. Diff whitespace check passed.

- Final full API: **706 passed**, two existing deprecation warnings,208.24s.
  Isolated artifacts verify storage/transfer behavior, not model quality.

Lead logs, including red Library and both full frontend runs, are retained in
`.scratch/user-feedback-14/`.
Independent review checked selection scopes, keyboard/focus handling and legacy
origin projection. Its bounded-read concern was addressed before the full API run.
Frontend/build and API suites run serially to avoid readiness-test contention.

## Remaining acceptance / exact next round

After restarting the app to load both UI and API, check:

1. Tick one/multiple profiles or models: no new toolbar appears. Right-click
   exposes the matching actions and affects only that selected set.
2. An imported model has no Add to Collection, including after reopening. A local
   trained model retains it. Labels distinguish identity from model.
3. Import a trained voice while Training uses clone; select it in Voice
   Manipulation and generate. Reopen and verify it remains available. Confirm the
   actual output on the device; mock request assertions do not prove voice quality.

Native layout and audible owner-model output remain device acceptance. The earlier
browser approval rejection is respected; no automation workaround was used.
Phase03 remains60% with its existing quality/calibration/device budgets.
Exact next executable round: STT-GAP-01, retaining isolated OBS recognizer/merge
evidence before repairing missing recognized words. Native checks can proceed
alongside. ADR0061 records the decisions.

Product commit: `99dc301`.
