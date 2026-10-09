# USER-FEEDBACK-12 — Timeline scale, consent layout and Voice Collection

2026-10-09. One bounded round for the owner's three screenshot requests.

## Implemented scope

OBS formerly selected only15/30/60/120-second display windows, while ordinary
Timeline and imported multitrack used1,000px/s. A real-component test failed on
the old slider's maximum4 instead of1,000. The shared zoom helper now drives all
three; +/- controls, fit endpoints and resolution readouts agree. Existing
ruler logic also drives OBS/imported absolute subsecond labels, rather than
quarter-window labels rounded to whole seconds. A second red regression found
the10ms floor prevented a5ms archive from fitting; positive tiny durations fit.

Consent layout now spans the Sound Library form and uses14px checkboxes rather
than generic32px-wide input styling. Checking voice-use permission reveals
Browse for a bounded proof file. Upload permission is separately explicit.
Evidence is stored with the project on the host; file selection alone does not
publish the voice externally. Pending upload disables Save, errors stay visible,
and cancelled replies cannot attach to a newly opened profile.

Project Library now opens Voice Collection. Sound Library ADD offers Create
New / Import from Collection; each trained voice offers Add to Collection.
The same browser lists entries, creates named collections and accepts the
full Speaker classification properties, including engine facets. New Collection
is available inline in the target list. Entries snapshot model/reference/evidence
files and source lineage; imported voices own their assets in the target project.
Required checkpoints and passed linked-set publication gates are enforced.
Retry, catalog-write flushing and immediate Workspace updates prevent stale
entries and duplicate imports. Hashes stream without whole-checkpoint RAM loads.

## Shared route source audit

| Route | Shared module / policy |
| --- | --- |
| Input file/mic/other ordinary footage | Timeline + shared zoom/ruler |
| Imported multi-track footage | ImportedMultitrackTimeline + same density/ruler |
| OBS live and saved recording | ObsLiveLinkTimeline + same density/ruler;120s feed cap |
| Voice Manipulator/TTS/generated audio | Timeline + same zoom/ruler |
| Voice Changer recorded audio | Timeline + same zoom/ruler |
| Input Sound Library tab | LibraryPanel forwards project and collection callbacks to VoiceVault |
| Standalone Sound Library | Registry forwards same callbacks to VoiceVault |
| Voice Manipulator Sound Library | ManipulatorLibrary forwards same callbacks to VoiceVault |

This is a source/component audit of the affected shared modules, not a visual
acceptance claim for every control on every page.

## Validation

Final frontend672tests/77files, typecheck and build pass. Focused Timeline88/5
and Collection/Sound Library/Hub/Workspace57/4 pass. The earlier full frontend
run failed while the final tiny-duration regression was being integrated; its
log is retained, superseded by the final full run. Build artifacts:
`index-BPP2JUX1.js`, `index-qbwYadHH.css`.

Evidence lives under `.scratch/user-feedback-12/`; the initial and final test
logs are retained separately. Final API703tests/twoexisting deprecation warnings passes. Focused backend35/4
passes. The first full API run had699passes and one Windows Stop process-tree
confirmation failure; isolated retry passed, followed by the final full pass.
No TrainingProcess code or stop policy changed. Logs preserve this observation.

The retained real20-step LoRA fixture initially exposed stored Windows `\` paths
being rejected as invalid checkpoint metadata. Normalize the internal checkpoint
separator at validation, retaining traversal/drive/root guards. Its actual files
now reach the correct pending identity-gate rejection, without publishing an
entry; five manifest/reference/voice/set/run hashes are unchanged. Synthetic
published-set and RVC fixtures prove copying, reopen, retry and re-export bytes.
No passed real identity gate or real-model transfer/inference is claimed.

Independent frontend review found that a350ms catalog debounce could survive an
immediate collection flush. The new actual Workspace caller test fails before
explicit synchronous timer cancellation and passes afterward. Flush also waits
for in-flight writes; imported profiles merge into current state.

## Remaining acceptance and exact next

Restart the app to load the new API endpoints and built UI. Owner acceptance:
compare max zoom/ruler/subtitle boxes across OBS9, Conviction and PDCA; check
consent layout/Browse in the narrow library; create two collections, add a ready
trained voice, import it into another project, close/reopen and verify it remains.
Collections copy trained artifacts and therefore require corresponding disk space.

The earlier browser automatic approval review rejected access; no CUA/CDP/
Playwright/shell workaround was used. Native visual, pointer/audio and real
voice quality remain owner/device gates. Synthetic model files prove transfer
and state behavior, not training identity or listening quality. No original
project media/transcript, normal runtime/model or upstream engine was changed.

Phase03 stays60%; this round does not relax its publication/calibration budgets.
Exact next executable round remains STT-GAP-01: retain isolated recognizer and
merge checkpoints to investigate missing OBS words before replacing owner text.
Native USER-FEEDBACK-12 acceptance and Script-end acceptance can proceed alongside.
