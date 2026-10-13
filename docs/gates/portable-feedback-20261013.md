# PORT-FEEDBACK-01 — portable playback, Recycle Bin, installer and launchers

2026-10-13. Phase 03 remains 60%. This round repairs the owner's second-machine
feedback; it does not advance the planned Voice Training features.

## Reproduction and causes

- Finalized STT gives a child track a sidecar item ID different from its project
  asset ID. The single-track Script subscribed to the sidecar ID while imported
  and OBS multitrack timelines published the asset ID. Four registry checks
  failed before the fix. The old alpha 0.5.5 portable showed subtitle `vậy` at
  2.000296 seconds, 21 Script words, but no active Script word. Ordinary
  single-file playback already shared its take ID correctly.
- The Media Pool folder root's `min-height: 100%` created a percentage sizing
  cycle inside the scrolling grid. Real Chromium measured its allocated height
  at 98.828125 px while the last live footage ended more than 700 px below its
  top. The bin overlapped the rows and its button could click the footage behind
  it. Letting this grid size from its contents fixes the layout.
- Windows PowerShell 5.1 drops an empty native argument. The default empty
  `ObsRoot` produced the wrong Python CLI arity and the owner's exact generic
  failure. Use a nonempty auto-root argument, retain compatibility with the old
  six-token call, forward BAT arguments and retain underlying error details.
  Scoped UTF-8 avoids errors after successful writes on other code pages.
- The portable had duplicate start/restart BATs. The console BAT now owns
  start/stop/restart/status. The updater removes only the known legacy files
  whose hashes match its installed inventory, with backup and rollback.
  OBS pairing now uses the main launcher; install/repair migrates recognized
  old paths while retaining pairing credentials and custom configuration.

## Verification

- Frontend: `npm test -- --maxWorkers=2`: **785 passed, 84 files**.
  `npm run typecheck` and `npm run build`: pass.
- Playback registry regressions: **16 passed**, including the actual imported
  Timeline and different sidecar/project IDs, paused follow, manual-scroll
  pause/resume and virtualized distant words across file/import/OBS paths.
- Backend: final full suite **774 passed**, two existing deprecation warnings,
  238.87 seconds. Installer regressions **22 passed** and the changed gateway
  test **1 passed** before the full rerun.
- Portable updater regressions: **11 passed**, including legacy removal,
  changed-file protection, rollback, old/new inventories and migration guidance.
- Actual candidate 0.5.6 `APPLY-UPDATE.bat` migrated the existing 0.5.5 bundle:
  **33 passed / 0 failed**. Integration then caught the stale OBS launcher path;
  this candidate and its ZIP were retained under the debug `rejected-alpha-0.5.6`
  folder and removed from distributable updates. Its number was not reused.
- Actual root `UPDATE-PORTABLE.bat -ApplyOnly -NoRestart` selected and installed
  **alpha 0.5.7**, **151 app files**, **33 passed / 0 failed**,
  `modelLayerChanged: false`. Root BAT inventory is exactly the four below.
- ZIP audit: **151 payload hashes**, **155 ZIP entries**, **1,213,602 bytes**.
  Installed files match every payload hash. ZIP SHA256:
  `105A32AB1AE5F6266A9DC6EDC481BA3ECF19312347FF3A846CDDD9D93BC7A448`.
- Base/model inventory hash is unchanged:
  `E789A4C7625FAC21FCE647D889C36EE52CC2DA11D94E7478EDCDBBB5719E0D96`.
  Installed bundle inventory records 38,620,815,750 bytes (35.97 GiB).
- Real UI on the source, then the installed 0.5.7 portable with its embedded
  core Python, uses the preceding round's real four-second Vietnamese STT
  media and words. Two copied project-owned audio tracks exercise the archive
  path. Scrubbing highlights `vậy` in Script and subtitle together; clicking
  Script `thực` seeks both audio elements to 0.52 seconds. Real playback moves
  to `Bây` with both highlights matching and both elements playing.
- Remove → Restore → Remove through the real UI, then permanent deletion of
  the owned fixture through the production API (204), followed by project
  reopen: four recycled rows remain, no overlap, scrollTop 1085 equals the
  scroll maximum, and the last bin row ends inside the list's visible bottom.
  Browser console contains no errors. User projects/source media were not used.
- Actual installed `INSTALL-OBS-PLUGIN.bat`, with embedded core Python, default
  OBS lookup and hostile ASCII Python output encoding: pass. It detects the
  local standard OBS installation but writes DLL/locale/brand and pairing only
  into isolated ProgramData/AppData under the debug folder. Installed DLL hash
  matches the real packaged DLL; pairing points to the existing console BAT.
  The bundle's pre-test OBS target record is restored byte for byte. No actual
  OBS plugin/configuration is replaced and no elevation is exercised.
- `open-pro4bro-console.bat status`: exit 0. It reports the already running
  local source controller; this is not proof of a separate portable stack on
  occupied ports. The isolated portable API/UI test avoids those ports.

Evidence and diagnostic-only harnesses: `.scratch/portable-feedback-debug/`.
Images: `before-bin.png`, `before-track-sync.png`, `portable-track-sync.png`,
`portable-bin.png`, `portable-final.png`. `ui-audit.json` and
`artifact-audit.json` retain measured state and hashes. The UI harness changes
only its own fixture data and substitutes runtime status; it does not invoke
or substitute STT inference. STT artifacts come from the preceding real run.

## Deliverable and owner's steps

ZIP: `.scratch/portable-updates/Pro4Bro-AppUpdate-alpha-0.5.7-NoVibeVoice.zip`.
Folder: `.scratch/portable-updates/App-alpha-0.5.7-NoVibeVoice`.
The local full portable is already updated to 0.5.7.

1. Close Pro4Bro on the other machine. Extract the ZIP into that full portable's
   `updates` folder, retaining the whole `App-alpha-0.5.7-NoVibeVoice` folder.
2. For installed alpha 0.5.5 or earlier, run the received pack's
   `APPLY-UPDATE.bat` once. The old root updater rejects the four-BAT inventory;
   this pack launcher runs the new updater. Do not run anything inside `payload`.
3. Wait for `release: alpha 0.5.7` and `gateFailed: 0`. Run root
   `VERIFY-PORTABLE.bat`, then root `open-pro4bro-console.bat`.
4. Close OBS before installing/repairing its plugin with root
   `INSTALL-OBS-PLUGIN.bat`, then reopen OBS to test native loading.
5. Later updates use root `UPDATE-PORTABLE.bat`. On the development machine it
   builds current source and allocates the next patch. Transfer only its whole
   numbered pack to a machine already holding this portable. A machine without
   it needs the complete approximately 36 GiB portable first.

| Portable root BAT | Job |
| --- | --- |
| `open-pro4bro-console.bat` | Open app; optional `restart`, `stop`, `status` |
| `INSTALL-OBS-PLUGIN.bat` | Install/repair/remove OBS bridge; optional PS parameters |
| `UPDATE-PORTABLE.bat` | Build from local source or select/apply newest received pack |
| `VERIFY-PORTABLE.bat` | Validate the local app, runtime, models and OBS package |

`APPLY-UPDATE.bat` stays inside each update pack as its compatible entrypoint.
Source-only `MAKE-PORTABLE-UPDATE.bat`, `setup-pro4bro.bat` and
`update-omnivoice.bat` create a pack, provision development and maintain the
upstream engine respectively. They are not in the portable. Source start/restart
BATs remain compatibility aliases; they are removed from the portable root.

## Remaining acceptance and exact next round

**PORT-FEEDBACK-UAT-01:** apply alpha 0.5.7 on the owner's D-drive machine;
test parent and single-track Timeline/Script playback, repeated bin operations,
and native OBS plugin loading after restart. Target-machine GPU/driver behavior
and standard installation requiring UAC remain physical acceptance evidence.
Independent recognition/timing review remains STT-TIMING-ACCURACY-01 after the
owner's Conviction reference. Phase 03 remains 60%.

Backend command: `.venv/Scripts/python.exe -m pytest services/api/tests -q`
from the source root. No required checks remain in this engineering round.
