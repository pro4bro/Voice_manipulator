# PORT-UPDATE-03 — numbered portable updates

Date: 2026-10-12

## Owner feedback and reproduction

The second machine ran `updates/app-current/payload/UPDATE-PORTABLE.bat` and
received `Not a portable bundle` for the payload folder. The same BAT location
failed here with exit 1 before any edits. The owner then specified automatic
release allocation and newest-version discovery, without editing a version or
renaming a received folder to `app-current`.

## Completed

- Creation allocates the next patch automatically, publishes a numbered folder
  and records `lastIssuedVersion`. An exclusive source lock serializes release
  allocation. Temporary `.creating-*` folders are excluded from discovery.
- The updater selects the highest numeric, profile-compatible manifest under
  `updates`. Different content sharing its highest release fails. A newer
  received pack precedes source creation, which is limited to the recorded
  source host. Pack launchers only apply updates.
- A new `APPLY-UPDATE.bat` uses the shipped updater for alpha 0.5.0 migration.
  It and the payload BAT resolve the documented full-portable layout. Missing
  bundles explain how to copy the whole pack into a complete portable.
- Alpha 0.5.1 was created automatically and applied to the existing portable.
  It is at `updates/App-alpha-0.5.1-NoVibeVoice`. Its ZIP is
  `.scratch/portable-updates/Pro4Bro-AppUpdate-alpha-0.5.1-NoVibeVoice.zip`.

## Evidence

- Initial entrypoint regressions: 4 failed, including the exact payload-root
  error and accidental ancestor source generation.
- Final targeted backend test command:
  `.venv/Scripts/python.exe -m pytest services/api/tests/test_portable_update_entrypoints.py -q`
  reported **9 passed in 13.45s**. Tests use actual PowerShell/BAT entrypoints
  with paths containing spaces; generator fixtures stub only the unrelated
  OBS gate. They verify numeric 0.5.10 > 0.5.9, profile selection, source-host
  behavior, old-updater bootstrap, missing bundle instructions, 0.5.1/0.5.2
  allocation, failure without publication, next phase 0.6.0/0.6.1 and stable
  1.0.0 issuance. Selection fixtures deliberately stop before runtime mutation.
- Source MAKE BAT built the UI (`tsc -b && vite build`) and produced 153 app
  entries as alpha 0.5.1. The update ZIP contains the original numbered folder,
  153 payload files and four package-level files; compressed size is 1.17 MiB.
  All 153 payload sizes and SHA256 hashes were checked inside the ZIP against
  the pack manifest.
- The actual pack's payload UPDATE BAT selected alpha 0.5.1, resolved the
  correct full portable and applied 153 files: **30 passed, 0 failed**.
- The actual `APPLY-UPDATE.bat` reapplied that pack: **30 passed, 0 failed**,
  `createdFromSource: false`, still alpha 0.5.1. No additional version was
  allocated while applying it.
- Full bundle remains 35.98 GiB by manifest logical bytes. This app pack does
  not include base runtimes or model checkpoints. ADR0070 records the workflow.

## Remaining gap and next round

The owner supplied the second machine's successful console output on
2026-10-12. Its D-drive portable selected alpha 0.5.1 from
`updates/App-alpha-0.5.1-NoVibeVoice`, reported `updated: true`, 153 app files,
`createdFromSource: false`, `modelLayerChanged: false`, and **30 passed, 0 failed**.
This is owner-reported evidence of transfer, application and the runtime gate;
the agent did not execute commands on that host.

Exact next portable round: start the updated app from the D-drive portable root
and benchmark fixed media there. Startup and actual audio/GPU processing remain
unverified on that host. Phase03 remains 60%; independent STT timing still awaits
Conviction.
