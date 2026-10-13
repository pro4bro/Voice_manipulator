# PORT-OBS-REPAIR-01 — default BAT installs or repairs the OBS bridge

2026-10-13. Responds to the owner's D-drive OBS installer failure after the
portable feedback updates. Phase03 remains60%; no audio, model or engine change.

## Cause and repair

The owner's message is emitted by the validated installer when installed plugin
files are missing or differ from the package manifest. It does not identify which
file differed. A disposable installed DLL with changed bytes and a second fixture
with a missing DLL reproduce the exact message through the real Windows BAT.
The old BAT default selected `install`, whose deliberate guard asks for Repair
in this state. Windows PowerShell5 also promotes redirected Python stderr to
`NativeCommandError` under `ErrorActionPreference=Stop`, interrupting the wrapper
before it can report the native exit code and original reason.

The PowerShell entrypoint now defaults to `auto`. Only the CLI resolves this
convenience mode: damaged state selects Repair, all other states use Install.
The underlying manager and REST action contract remain install/repair/remove.
Hash validation, OBS build compatibility, running-OBS guard, atomic replacement,
rollback, elevation and pairing preservation remain in the existing manager.
Explicit Install still rejects damaged files; explicit Repair still rejects a
fresh installation. No OBS process is stopped by this installer.

Native stderr is captured under scoped Continue, then Stop is restored before
handling the exit code. The wrapper extracts error messages and reports both the
Python code and the original reason. UTF-8 and environment restoration remain.
Successful CLI JSON includes `appliedAction` so the actual operation is visible.

## Regression evidence

- Before repair: seven new native cases produced **4 failed /3 passed** in9.84s.
  Damaged and missing DLL cases match the owner's NativeCommandError; an explicit
  Install loses the wrapper exit-code message and default Install reports the
  wrong recovery action while OBS is running.
- After repair: installer suite **29 passed**, two existing deprecation warnings,
  20.21s. Five default-BAT states cover fresh, healthy, damaged, missing and older
  manifest installations. They assert selected action, installed hashes and
  existing pairing bytes. Explicit Install retains its guard and original error;
  attempted repair while OBS runs leaves plugin and pairing unchanged.
- Existing `test_native_powershell_default_root_reports_actionable_failure`
  now expects the default action `auto` and wrapper `(exit 1)`, and explicitly
  rejects `NativeCommandError`. Its nonzero exit/no filesystem mutation assertions
  remain. This records an intentional CLI mode/error-format change, not a relaxed
  gate. The shared staging helper skips native tests when command processors are
  absent; all29 ran on Windows here.
- Frontend: **785 passed /84 files**,120.16s. Typecheck and build pass.
- Full backend: **786 passed**, two existing deprecation warnings,348.11s.
  Command: `.venv/Scripts/python.exe -m pytest services/api/tests -q`.
- Actual MAKE BAT automatically issued **alpha0.5.9**, source revision62deace.
  The app-only ZIP has151 payload files/155 entries, all archived sizes and
  SHA256 checked against the manifest. Size1,214,835bytes (about1.16MiB).
  SHA256: `F541044F5C9FC1AD9F414A3C190B7BF90237A0D141411E2427F64E331102E63B`.
- Actual received pack `APPLY-UPDATE.bat -NoRestart`: **33 passed /0 failed**,
  alpha0.5.9,151 app files, `modelLayerChanged:false`. All151 installed files
  match the pack manifest and payload bytes; installed/bundle release agrees.
  The four root BATs remain. The pre-existing source controller/API/Studio PIDs
  (59812/47064/55788) survive application. Base/model inventory SHA256 unchanged:
  `E789A4C7625FAC21FCE647D889C36EE52CC2DA11D94E7478EDCDBBB5719E0D96`.
- Native BAT probe stages the installed0.5.9 scripts/adapter and real plugin
  package, and copies the embedded Python bootstrap files byte-for-byte into a
  disposable app root. Embedded executable SHA256:
  `5f7b89a612c9b8af1d6456cdfcd1dbe5ca630849e79aebced9bee9a6694952ec`.
  Default fresh install, damaged-DLL Repair, missing-brand Repair and healthy
  rerun return installed state with all three actual package hashes verified.
  Existing pairing remains byte-identical. Simulated running OBS rejects repair
  with exit1/original Vietnamese reason and no file/pairing mutation.
- Only tasklist output is controlled inside the disposable fixture's
  sitecustomize; the fake OBS executable is never run. No real OBS files or user
  profile are modified. This proves installed recovery using the shipped binary
  bytes and interpreter, not native plugin loading/UAC on the second machine.
  Harness and reports: `.scratch/portable-obs-repair-debug/`. The fixture's
  `services/api/sitecustomize.py` is absent from the151-file app payload.

## Package

Folder: `.scratch/portable-updates/App-alpha-0.5.9-NoVibeVoice`.
ZIP: `.scratch/portable-updates/Pro4Bro-AppUpdate-alpha-0.5.9-NoVibeVoice.zip`.
The source product correction is committed separately from release ledgers.

## Operator steps

1. Copy the whole numbered `App-alpha-0.5.9-NoVibeVoice` folder into the full
   portable's `updates`. Click its `APPLY-UPDATE.bat`. This also works if the old
   installed version is0.5.7 or earlier; from0.5.8 root `UPDATE-PORTABLE.bat` can
   select the newest received pack.
2. Wait for `release: alpha 0.5.9`, `updated:true`, `gateFailed:0`.
3. Close OBS completely. Double-click **root `INSTALL-OBS-PLUGIN.bat`**. Damaged
   or incomplete installed files now select Repair without editing a command.
   Wait for installed state; then reopen OBS and verify native plugin loading.

The package updates app files only; existing model weights need no recopy. OBS
Studio32.2.2 is still required for this bridge build. Do not run app launchers
inside payload.

## Remaining gap and exact next round

**PORT-FEEDBACK-UAT-01:** owner applies0.5.9 on D-drive, closes OBS, runs the
default installer and confirms loading after reopening. Actual target-machine
UAC/native plugin loading remains physical evidence; this round verifies file
installation and recovery. Prior playback/bin acceptance remains in that round.
Independent STT-TIMING-ACCURACY-01 awaits Conviction. Phase03 remains60%.
