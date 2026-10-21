# LipSync composition and scope gates — rounds66–70 — 2026-10-21

The owner explicitly requested five consecutive rounds, overriding the usual
one-round stop for this batch. Existing uncommitted round65 work was preserved.

## Round66 — LIPSYNC-NATIVE-SETTINGS-01

Per-engine controls remain separate when switching. Backend resolution rejects
unknown/foreign keys, handles MuseTalk offline/realtime defaults and active flags,
and validates/reassembles Wav2Lip native vectors. HTTP settings validation is
registered on the real app. Metadata/license text is collapsed to keep controls
reachable. Invalid numeric drafts prevent saving/preparing older hidden values.
Focused native/catalog: 3 passed; frontend shipped-descriptor behavior: 1 passed.

## Round67 — LIPSYNC-COMPOSITION-STORE-01

Portable composition get/save routes persist source IDs, placements, engine
settings and scopes with atomic revision conflict checks. Missing/empty/out-of-
bounds sources are refused. Frontend explicitly loads/saves; a pending save cannot
overwrite newer edits. Moved-project and stale/invalid-write tests: 2 passed;
workspace/settings tests: 5 passed. No source media is altered.

## Round68 — LIPSYNC-MULTILAYER-EDIT-01

The shared Timeline alignment mode supports multiple clips and layers, separate
audio waveform, vertical lane scrolling, pointer/keyboard move/trim, duplication,
split at playhead, delete, numeric source extension, layer reassignment/order/
enable state and Undo/Redo. Pointer gestures have one undo checkpoint. Preview
plays the top enabled visible clip, with deterministic same-layer tie order and
shared audio clock. Focused composition/workspace tests: 6 passed at this gate.

## Round69 — LIPSYNC-PROCESSING-SCOPE-01

Separate detection/LipSync editors choose all or explicit layers, optional range
and visible/placed/full-source coverage. Visible mode respects unselected upper
occluders. Source detection deduplicates occurrences; sync retains audio anchors.
Placed/source scopes can include disabled Preview layers when explicitly chosen;
visible mode excludes them. An explicit empty layer selection processes nothing.
The API and UI inspect exact source/composition spans without claiming execution.
Focused coverage/store/settings: 6 passed; frontend scope/edit/settings: 8 passed.

## Round70 — LIPSYNC-PREFLIGHT-REVIEW-01

Saved-document preflight intersects generated voice turns with scope, reports
speaker/profile candidates pending face binding, detects conflicting source audio
anchors and missing detection coverage, and fingerprints video/voice/metadata.
Portable content-addressed preflight JSON records blockers and `executed:false`;
no inference is queued or claimed successful. UI discards stale replies after
edits. Final focused API: 11 passed; final focused frontend: 10 passed in 5 files.

## Integrated validation

- Full frontend: 1,153 passed in 142 files, 190.47 seconds. One earlier full run
  hit the existing OBS archived-drag RAF test (`frames.shift is not a function`);
  that test passed alone and the complete retry passed without changing OBS code.
- Typecheck and production build passed (200 modules). After the final compact
  engine information/scroll correction, focused tests and real browser checks
  verified those UI changes; final build/typecheck were rerun.
- Full API: 1,220 passed, 3 existing dependency/fixture warnings, 623.30 seconds.
  Final detection-coverage, empty-source and scope-eligibility refinements added
  afterward pass in the final focused 11-test API set. Do not report 1,221 as a
  completed full-suite run.
- Initial API integration caught router registration before FastAPI creation;
  moving it to the router registration block fixed the import. A main-app route
  smoke test prevents recurrence.
- Real browser fixture used two actual 640×360/25fps MP4s (red 6s, blue 4s), a
  silent 24kHz WAV and seven layers, all under ignored `.scratch/lipsync/browser66`.
  At 2s blue overlaid red; toggling the top layer revealed red. Vertical scroll
  reached Video7/audio, and right-column scroll reached scope/save controls.
  Switching engines changed controls; real API save reached revision2 and
  preflight showed two source-detection spans and three visible sync/voice spans.
  Screenshot: `.scratch/lipsync/browser66/lipsync-scopes.png`.
- These media fixtures contain no faces and no synthesized voice. They prove
  decoding, layout, placement, scope/persistence and preflight, not LipSync quality.

## Open artifact gates

Model/runtime provisioning, actual face detection/identity review, Speaker Profile
bindings, licensed engine inference, multi-face blending, After QC and selective
Voice Over repair remain open. Generate and face replacement remain unavailable.
Phase03 remains60%; Phase06 is not complete. No portable release was produced.
