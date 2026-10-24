# Output slot lifecycle

Round OUTPUT-LIFECYCLE-01, 2026-10-24. Applies to Voice Output and LipSync
Session/Version products. Media Pool and pending OBS footage reuse the same bin
presentation while retaining their existing source-media storage adapters.

## User behavior

- Each Session and Version has an Export icon and a Delete icon. Collapsing a
  Session keeps its own actions visible. Right-click menus expose these actions
  alongside the slot's other supported operations.
- Delete moves the entire slot to its module's Recycle Bin. A Session includes
  all Versions still inside it. Voice snapshots include Script, configuration,
  reference/timing/subtitle state, history, layers and owned generated audio.
  LipSync retains its composition, face reviews, Undo/Redo and job artifacts.
- Removing the selected slot clears its editing checkout. Restore recovers the
  original IDs, state and files; explicitly select the restored Version to edit
  it. Restoring a Version before its parent Session creates a parent shell; a
  later parent restore merges Versions without duplicating them.
- Recycle Bin offers Restore, Delete permanently and Empty Recycle Bin.
  Permanent actions require confirmation and remove owned files. Inputs shared
  from Media Pool are preserved. Voice audio referenced by another live/recycled
  Version or LipSync composition/history blocks purge until that use is removed.
- Generation and live LipSync jobs guard affected lifecycle changes. A revision
  conflict asks the caller to reload rather than overwriting another operation.

## Export

Session Export downloads one ZIP containing all its Versions. Version Export
downloads a ZIP containing that Version. Voice's Export menu also retains WAV,
SRT lines/words/sentences and timing-table downloads where data is available.
LipSync's render UI retains its individual video download.

Packages contain `manifest.json`, saved state and owned generated audio or
processing results. Paths in the archive are relative to the project folder.
Voice packages include generated line subtitles when segments exist. Reference
source footage and base-model weights are not copied into these product packages;
references remain project-relative. There is no package-import UI in this round.
Packages saved under `exports/output-slots/` are independent exports and are not
removed when the original slot is permanently deleted.

## Reuse boundaries

| Module | Responsibility |
|---|---|
| `apps/web/src/domain/output-lifecycle.ts` | Shared action and recycle-entry summary types |
| `apps/web/src/ui/OutputSlotLifecycle.tsx` | Symbol actions, bin header, restore/purge/empty presentation |
| `apps/web/src/ui/OutputSlotMenu.tsx` | Capability-supplied context/export menus |
| `services/api/app/domain/output_lifecycle.py` | Snapshot/remove/restore/parent merge and ownership traversal |
| `services/api/app/adapters/output_artifacts.py` | Checked project paths, ZIP creation, staged purge/rollback |
| Voice/LipSync adapters | Revision checks, job guards, exact owned paths and reference protection |

Future output modules should supply capabilities and owned artifacts to these
modules, with format-specific validation in their adapter. Do not delete a
directory inferred from a display name or an immutable source reference.

Soft deletion keeps physical artifacts in place to preserve references and
restore without moving media. Recycled Voice outputs disappear from ordinary
output pickers; clip-cache pruning still counts them until permanent deletion.
Purge validates ownership paths, stages them within the project, commits the bin
change atomically and rolls back staged files if that commit fails. Staging
cleanup is filesystem cleanup, not secure erasure.

## API

Both API families expose `POST .../slots` with revision, id and action kind
(`remove`, `restore`, `purge`, `empty-bin`) and `GET .../export?kind=session|version&id=...`.

- Voice: `/api/projects/{projectId}/voice-output-sessions`
- LipSync: `/api/projects/{projectId}/lipsync/sessions`

Voice additionally supports the existing rename/disable slot actions. Old Voice
raw recycle snapshots normalize to the shared wrapper on read; old LipSync books
default to an empty bin. Empty Sessions and no active Version are valid states.

## Training Queue reconciliation

Training Run files and measured progress are authoritative for Queue Training
cards. A stale task receipt cannot turn a running/interrupted run into Done.
Run process liveness is reconciled before projecting Queue state. Train-stage
completion stays at the pipeline's measured fraction until checkpoint/publication
complete. Receipt writes occur only on changed state, with live writes throttled.
Resumed attempts group under the same Training operation with previous attempts
in History. This does not start or resume training automatically.
