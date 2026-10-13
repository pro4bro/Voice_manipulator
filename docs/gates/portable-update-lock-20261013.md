# PORT-UPDATE-LOCK-01 — release the controller before replacing app files

2026-10-13. Fixes the owner's failed alpha0.5.7 update on the D-drive portable.
Phase03 remains60%; this round changes the updater and its operator guidance.

## Cause and repair

Windows refuses to move `services/api` while a process has that directory as its
working directory. The controller starts there and imports API code. The old
updater checked ports18081/18120 and stopped API/Studio, leaving the controller
on18119 alive. Its catch path restarted only workloads, explaining the owner's
`overall: running` output followed by the original Move-Item error.

A real native Windows process with its CWD in a temporary fixture's API folder
reproduced the exact `MoveDirectoryItemIOError` at the old updater's line272.
After the repair the updater also detects the controller, validates the bundle
interpreter path and role module for each listener, and calls full-stack stop.
The process-tree helper waits for real exit; all three ports must be free before
any installed app tree is moved. Mixed portable/foreign listeners abort before
mutation. No process is killed by name alone.

After update or rollback, the updater invokes the console launcher to reload
the controller as well as API/Studio. `-NoRestart` leaves all three stopped.
Restart is attempted only after a confirmed full stop, not after a failed stop.
The transactional app backup/rollback and model allowlist are unchanged.
ADR0070 records the corrected lifecycle contract.

## Evidence

- Native updater tests: **16 passed** in95.49s. Five new cases use real process
  CWD locks: controller only; complete stack with NoRestart; complete stack with
  console reopening; failed gate with files/manifests restored and old launcher
  reopened; mixed foreign controller with every process/file left intact.
- The tests remap isolated ephemeral listeners to the production roles. Native
  process lookup, process-tree stop and filesystem replacement are real. A BAT
  marker asserts which installed/restored console launcher is reopened.
- Harness correction: NetTCPIP exports CDXML functions; lazy module import
  initially replaced the lookup override and stopped the local development
  stack. The stack was reopened. Tests now import modules before overrides and
  assert all pre-existing standard-port PIDs survive, including failure paths.
  Final native cases pass with the source controller/API/Studio running.
- Frontend **785 passed /84 files**,105.94s; typecheck/build pass. No frontend
  code or audio operation changes in this round.
- Full backend: `.venv/Scripts/python.exe -m pytest services/api/tests -q`:
  **779 passed**, two existing deprecation warnings,338.63s. This final rerun
  includes all16 native updater checks after the harness escape cleanup.
- Installed pack updater with a real embedded portable controller holding
  `services/api`: **alpha0.5.8,151 app files,33 passed /0 failed**. The controller
  exits before directory replacement, diagnostic port18139 closes and all three
  pre-existing source PIDs survive. Base/model inventory SHA256 unchanged:
  `E789A4C7625FAC21FCE647D889C36EE52CC2DA11D94E7478EDCDBBB5719E0D96`.
- Installed and archived payload audit: all151 sizes/hashes match, four root
  BATs remain. ZIP SHA256:
  `72151D6922BBF80AC156D7486176B4F4D10395BA459E471B7087723541EBBFE0`.

## Package

Automatically issued **alpha0.5.8** by the actual MAKE BAT, source03356b9.
The pack has151 payload files,155 ZIP entries; all archived sizes/SHA256 match
its manifest. ZIP1,214,130bytes, approximately1.16MiB:
`.scratch/portable-updates/Pro4Bro-AppUpdate-alpha-0.5.8-NoVibeVoice.zip`.
Folder: `.scratch/portable-updates/App-alpha-0.5.8-NoVibeVoice`.

The installed-package harness uses the portable's real embedded Python and real
`app.runtime_controller` in `services/api`, listening on isolated18139. Only its
listener is presented as the production18119 role; the interpreter and command
identity are not substituted. It invokes the received payload updater and the
actual portable gate, checks process exit, base/model hash and source-PID survival.
Logs/report live in `.scratch/portable-update-lock-debug/`.

## Owner's steps

1. Extract the whole `App-alpha-0.5.8-NoVibeVoice` folder into the full D-drive
   portable's `updates`. Keep all its files together.
2. **Click this pack's `APPLY-UPDATE.bat` once.** The installed updater in0.5.7
   or earlier still has the controller-stop bug. The pack entrypoint runs the
   corrected script immediately, including if the installed version remains
   older because the preceding update rolled back. Do not run files in payload.
3. Wait for `release: alpha 0.5.8`,
   `updated:true`, `gateFailed:0`. A previously running portable reopens through
   its console; otherwise use root `open-pro4bro-console.bat`.
4. Later received packs use root `UPDATE-PORTABLE.bat`. On the development
   source machine it can build and allocate a new pack. Transfer only the whole
   numbered app pack to an existing portable; model weights need no recopy.

## Remaining gap and exact next round

**PORT-FEEDBACK-UAT-01:** owner applies0.5.8 on the D-drive machine, confirms the
previous Move-Item failure is gone, then retries Script/Timeline, bin and native
OBS loading from the preceding feedback repair. Standard-port interactive window
behavior and UAC/GPU/OBS loading on that machine remain physical acceptance.
Independent STT-TIMING-ACCURACY-01 still waits for Conviction. Phase03 remains60%.
