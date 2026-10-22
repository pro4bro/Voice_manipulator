# Round81 — Input timing preview, retained live text and load recovery

2026-10-22. Implements the owner's current feedback in one bounded round.

| Capability | Responsibility | Dependency |
| --- | --- | --- |
| workspace-load | Diagnose stalled project loading; recover without terminal restart | Existing API/runtime |
| retained-live-script | Keep OBS/growing-MKV draft text after capture stops | Existing durable live events/assets |
| capture-source-layout | Mount OBS controls only for OBS LiveLink Capture Source | Recorder source selection |
| subtitle-ghost-preview | Enabled methods, parameters, contextual Timeline ghosts, bulk Apply | Existing acoustic proposals and Timeline source clock |

Build/verify independent slices, then integrate the preview. Preserve original
media, manual timing locks, project-relative evidence and existing Undo/Restore.
No model or engine changes. No data edits on the owner's projects for verification.

## Interaction contract

The right-column refinement button opens inline settings so Timeline remains
usable. Each method has an enable checkbox; enabled methods expose collapsible
settings. Manual IN/OUT values are editable. Methods run in their displayed order;
later acoustic methods use the preceding result as their starting timing.
Ghost Preview computes from a bound source snapshot without saving word timing.
Only changed words appear as translucent boxes above the original subtitle lane
at their predicted coordinates. Changing settings invalidates Apply until a fresh
preview; changing source/text/cuts clears stale ghosts. No per-word checklist or
separate audio audition is required: use normal Timeline playback/waveform.

Apply New Timing applies all valid changed preview words in one reversible
operation, leaving unchanged and locked words untouched. New overlaps are visible
in red with a brief slow pulse and textual conflict counts; they are inspectable
before and after Apply. Structural invalid/out-of-source spans remain rejected.
Reduced-motion preferences disable pulsing. Restore and existing Undo remain.

Live OBS and followed-MKV draft text stays associated with its recording/track
after Stop and reopen, until explicit clearing or detailed STT replaces it.
On OBS Stop, followed MKV imports the entire closed source in the background,
including its tail. An authenticated matching Stop path or sealed Segment length
triggers completion; unchanged file size alone cannot. The final decode is a
single full-source pass. Stop launches no final recognition; late live/segment
results cannot overwrite the retained draft. Explicit Speech to text afterward
uses the ordinary full-file track queue, without growing-file block segmentation.
Capture Source controls OBS module visibility independently of viewing an older
archived recording. Hiding capture controls must not stop active data capture.

## Verification

Regression tests must reproduce disappearing stopped-recording text, source
visibility and the specific load failure mechanism found during diagnosis.
Preview tests cover composition, enabled parameters, source fencing, ghost time
coordinates, conflicts against unchanged words, bulk application and Restore.
Run frontend `npm test`, `npm run typecheck`, `npm run build` in apps/web and
`.venv/Scripts/python.exe -m pytest services/api/tests -q` at root. Real media
clones/API evidence and browser UI verification complement tests. Record an
unreproduced historical hang honestly if live logs cannot establish its cause.
Update round ledgers/gate and stop81; Phase03 stays60%, Phase06 open.
