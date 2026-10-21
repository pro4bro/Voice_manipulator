# Round76 gate — LipSync Sessions, Versions and shared-source routing

Date: 2026-10-21. One bounded development round under AGENTS.md.
Decision: ADR0125. Requirements: LIP-08/09; existing LIP-01..07 quality gates remain.

## Implemented

- Face cards contain Face ID, then Voice Profile, then review status. Binding by
  Face ID updates all cards representing that identity. ID typing validates local
  drafts without putting invalid IDs into persisted history.
- Video Output lists independent Sessions with expandable Version slots. New
  session starts empty. New version clones composition/settings/scope decisions
  and completed analysis/review/thumbnail data, with empty history. Original
  renders and running jobs remain owned by the source slot.
- Version state/history is project-relative, revision-fenced and atomic per state
  file. Up to 100 combined Undo/Redo snapshots include clips/layers/audio, native
  settings, processing scopes and face-review decisions. Histories survive page/
  version navigation and browser reload. Late saves stay with the owning Version.
- Navigation saves state and face review first. Invalid parameter/Face ID drafts,
  stale revisions or in-flight operations stop the transition with an error.
- Existing composition/jobs open as Session 1 / Version 1 without rewriting the
  original composition. Jobs, face review, thumbnails, plans, logs, cancellation,
  After and exports all use the selected Version's explicit API scope.
- Media Pool and generated Voice Output context submenus route compatible sources.
  LipSync stages them for an explicit slot before import/replacement. Source
  media and other versions are unchanged. Training expands imported live audio
  tracks; Voice Manipulation opens one source/output. Generated speech → Training
  is explicitly unavailable instead of silently creating synthetic source data.

## Automated checks

Commands run from repository root unless stated otherwise.

| Check | Result |
| --- | --- |
| `npm test` in `apps/web` (final full run) | 1162 passed / 144 files / 171.58s |
| `.venv/Scripts/python.exe -m pytest services/api/tests -q` | 1230 passed / 651.93s / 3 pre-existing warnings |
| Focused frontend routing/processing after final routing/ID validation | 65 passed / 2 files |
| Earlier integrated LipSync/Media Pool/Voice Output/Shell focused run | 154 passed / 10 files |
| Latest portable session/face-clone API tests | 3 passed |
| `npm run typecheck` | passed |
| `npm run build` | passed / 204 modules |

An initial full frontend run found a test reading the loading editor's heading
immediately before it was replaced by the loaded Version editor. The test now
waits for the loaded composition, preserving its layout assertions. The final
full suite passes. Earlier focused checks caught and corrected route/UI typing
issues and an ambiguous test locator. No assertion, suite or validation gate was
removed or suppressed.

API tests cover legacy migration, optimistic revision conflict, independent
composition/history, new empty Session, cloned reviewed identities/thumbnails,
state after moving the Project, version membership/path validation and job/face
scope isolation. Frontend tests cover save-in-flight isolation, Undo/Redo on
return/remount/reload, mixed face/settings history, clone-and-replace voice,
inline same-ID bindings, invalid ID drafts, menus and actual Shell routing.

## Real browser and artifact evidence

Isolated fixture: `.scratch/lipsync/runtime71/projects/` (existing upstream
research-only footage/speech, not client media or newly app-generated speech).
Fixture server18182 and frontend18183; no user project was used.

Verified through actual WorkspaceShell, UI controls and API:

1. Old composition opens in Session 1 / Version 1.
2. New version produces Version 2 with the original overlapping clips/layers,
   native settings and reviewed gallery. Undo/Redo starts empty.
3. Changing one Profile updates all four cards with that Face ID. Undo restores
   their assignment. Creating Session 2 yields an empty product/history. Returning
   to Version 2 and reloading the browser restores its Redo and face assignment.
4. Input footage right-click → Send to → LipSync stages for Session 2 / Version 1.
   Import adds the selected footage. Voice Manipulator Voice Output right-click
   → Send to → LipSync replaces/imports that product's audio. Both source tracks
   and history survive save/reload.
5. Restoring the original fixture face binding and saving Version 2 produces a
   ready 4-task speaker plan. UI Generate runs an actual scoped MuseTalk render.
6. Browser console: no errors/warnings observed. After decodes with readyState4,
   duration4s, video640×854 and no media error. Source previews remain unchanged.

Render job: `591cd789-a1b0-468d-bbb8-544daee72864`.
Version: `1bde3d42e55c431b84095827f4c6c4a1`, composition rev3 / face review rev3.
Result: completed; applied75 / skipped55. Structural QC passed for all3 artifacts.

| Artifact | Duration | Rate / audio | Bytes |
| --- | --- | --- | --- |
| Composition `after.mp4` | 4s | 25fps / 24kHz mono | 743487 |
| `source-yongen.mp4` | 2s | 25fps / 24kHz mono | 236074 |
| `source-sun.mp4` | 4s | 25fps / 24kHz mono | 678901 |

Each artifact exists inside the Version's job directory with matching QC byte
count. All three artifact routes serve HTTP206 for a32-byte Range. The same
render's video route returns404 from legacy and Session 2's Version scopes.
Receipt with QC fingerprints: `.scratch/lipsync/round76/render-receipt.json`.

Screenshots:
- `.scratch/lipsync/round76/session-face-ui.png` — Version 2, inline face binding,
  Preview After and multilayer Timeline.
- `.scratch/lipsync/round76/session-sources-ui.png` — Session 2, footage and audio
  waveform imported from the two other pages.
- `.scratch/lipsync/round76/version-after-ui.png` — scoped completed job / exports.

Logs: `.scratch/lipsync/round76-web-final.log`, `round76-api-full.log`,
`round76-final-focused.log`. After the full suite, a one-line reload normalization
clears omitted optional face drafts in the legacy API path; latest history/Page
checks4pass and final build/typecheck204pass (`round76-history-final.log`,
`round76-build-final.log`). OmniVoice and all3 downloaded LipSync repositories
show no upstream changes. Verification servers and browser tab are stopped after
capture; no processing job is left running.

## Remaining gates

This round validates product/version isolation and a real scoped artifact. It
does not establish real-client/generated-voice mouth/identity quality acceptance,
simultaneous multiperson accuracy, persistent identity continuity across fresh
analyses, full native/other engine adapters, face replacement or automatic
selective Voice Over repair. Shared-source deletion can still make old Versions'
media unavailable; processing checks that availability. No portable release.
Phase03 stays60%; Phase06 remains open. Stop76.
