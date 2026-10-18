# Round54 — word command parity, exact replacements and playback resume

Date:2026-10-18. Owner feedback. ADR0111. One bounded stabilization round.

## Diagnosis and RED evidence

- Initial parity suite:7failed/2.85s. Script table lacked Add/Delete entries;
  selected-word Delete had no command; subtitle reference interception hid profile
  actions. Replacing a sparse word originally2–2.4s spread it to2.01–7.99s.
- Resume suite initially2failed/2.16s: Timeline remount lost its paused cursor.
  Source restoration tests initially2failed/5.49s: no workspace source hydration.
- Added stale metadata regression reproduced an old5s audio duration clamping a
  new source's saved70s cursor to5s. Compare currentSrc with requested src before
  consuming metadata. An OBS requested-recording switch also exposed a one-render
  key lag; use displayed recording identity and gate parent cursor reporting.
- Add/no-room parity caught the optional-duration Script path falling back to
  general reconciliation and modifying an old neighbour. Supply the known source
  boundary even without an explicit duration; no-space input stays open with status.

## Changes and intentional test contract updates

All Script views reuse word reconciliation and deletion paths. Menus retain existing
annotation, Copy/Paste and reference commands. Delete is scoped and never consumes
native input deletion. Explicit replacements preserve original bounds; a split
replacement partitions only those bounds and retains provenance as untrusted.
Source identity and position storage are independent and project-scoped. Restore
source only after initial lists resolve, yield to user opens, and validate lifecycle
state. Imported tracks/OBS archive editors share the relevant parent clock.

Old replacement assertions in ScriptEditor, imported/OBS timeline and timeline-editing
now require user-text-preserved and exact original bounds. Genuine addition still
requires user-interpolated. ProductionSelection now chooses Gán reference… after
subtitle context opening; original frozen disjoint ranges and origin sequence remain.
No skip, threshold reduction or disabled acceptance gate was introduced.

Final review reproduced stale menus after same-source word reindexing (2RED cases),
Delete during recording (1RED case), and an OBS callback replacing a persisted child
asset source with a recording ID (1RED case). Dismiss stale menu/editor state on
word revisions, block recording deletion, and retain asset ownership of the source.
A full run was cancelled after the metadata guard rejected a relative test currentSrc
and one new test ambiguously queried multiple status elements. Normalize currentSrc
against document.baseURI (keeping the original preview assertion); target the exact
status message. The failed fake-timer preview case caused later timeout fallout;
no timeout was raised. Focused final:97passed/4files/18.09s. A later final-run process
was lost with its terminal before results; it is not counted as successful. Recovery
runs the same frozen615inputs, without editing source or restarting the shared app.

## Verification

Focused integration69passed/3files/15.20s before the final Add/profile parity cases.
Shared timeline suites118passed/4files/16.10s. Native Script43passed/4.93s;
channel/native source28passed/5.98s.

- Final recovery frontend:1075passed/129files/194.01s. No skipped cases.
- API:1149passed/590.08s;3existing/fixture warnings (Starlette/httpx, audioop,
  duplicate ZIP fixture entry). Backend/engine sources unchanged.
- Typecheck and production build183modules pass; diff check passes. All615 frozen
  source/config hashes match after the recovery run; later edits are documentation.
- Fresh browser after resume is available. Own Vite port18429 uses current product
  source and existing local API without restarting shared runtime. Real project
  Test11/2026-10-01 22-06-29.mp3 (6744words) shows Add/Edit/Delete and profile entries
  in both Script table and subtitle menus. This project has no Speaker Profiles,
  so actual named-profile assignment is covered by integration tests.
- Right-click/select word Roma gives paused00:00:05.200. Reload returns to the
  project library (existing app behavior); reopen Test11 restores that same footage
  and exact00:00:05.200. No console errors captured. Source transcript/media were
  not edited/deleted for this browser check. UI screenshots inspected in CUA.

## Acceptance and manual checklist

Browser was disabled during the first session and became available on resume.
The limited real-browser menu and source/cursor reload checks above pass. Full
editing/deletion UAT and imported/live drag acceptance remain open. Shared app/API
was not restarted. Retain test logs and frozen manifest under .scratch/edit54/.

1. Right-click a subtitle word, set Speaker Profile, verify box identity and IN/OUT.
2. Try Add/Edit/Delete in Script table, text view and imported channel view.
3. Replace one sparse word, then split it into two; verify original outer IN/OUT.
4. Press Delete on a selected word, then inside a text input; check separate behavior.
5. Stop at a fractional timestamp; close/reopen the same project and verify source
   and playhead. Repeat for imported child, generated output and archived OBS.

Generated voice output remains governed by its existing read-only audio/Voice Edits
boundary; this round does not add an output transcript persistence API. Live OBS
keeps live follow. Device-local resume data does not travel with copied project media.
No backend/media/model/project.json changes. Phase03 stays60%; acoustic anchors,
Checkpoint A and13downstream processor gates remain open. Stop after round54.
