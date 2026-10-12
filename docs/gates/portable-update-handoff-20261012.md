# PORT-UPDATE-02 — repeatable portable handoff

Date: 2026-10-12. This bounded round makes the current portable's own
UPDATE-PORTABLE.bat the single click for app changes while the portable sits
under the development checkout. A successful update places the transferable
app pack at updates/app-current and leaves the BAT result visible.

## Evidence

- Ran the portable BAT three times from the existing NoVibeVoice folder.
  Each run built the web UI, applied 153 app files and returned
  updated=true, modelLayerChanged=false, gatePassed=29, gateFailed=0.
- Repeating the update promoted the new pack to updates/app-current and
  retained the earlier pack as updates/app-previous-*. The final current
  pack is 3.93 MiB. The portable manifest remains 35.98 GiB logically.
- Ran VERIFY-PORTABLE.bat directly from the portable folder: 29 passed,
  0 failed. The window now displays the result until a key is pressed.
- Ran MAKE-PORTABLE-UPDATE.bat from the source checkout after adding its
  visible completion pause; it produced a separate 153-file update pack.
- The final portable contains the updated BAT, updater script, current
  app pack and step-by-step PORTABLE-README.md. The app pack records source
  revision abfdaea; its dirty flag records the in-progress documentation
  and BAT changes included in this round.
- PowerShell updater parse and git diff checks passed. The automatic
  npm build includes TypeScript compilation. No frontend or backend
  product logic changed in this round.

## What to copy

First move: copy the whole updated portable folder, preserving its internal
paths. On the other Windows machine run VERIFY-PORTABLE.bat, then
start-pro4bro.bat. The transfer needs space for about 36 GiB plus any
projects created later.

Later code-only updates: click UPDATE-PORTABLE.bat inside the development
portable, then copy only its updates/app-current folder into the other
portable at that exact relative path. Move the other machine's previous
app-current aside before copying; avoid creating a nested
updates/app-current/app-current folder. Click UPDATE-PORTABLE.bat on the
other machine, then VERIFY-PORTABLE.bat.

The target-machine transfer, installed GPU/OBS behavior and fixed-media
benchmark remain unverified here because no target path or machine is
connected to this task. Python requirements, engine code or checkpoint
changes require a new validated base bundle rather than this app pack.
Product Phase 03 remains 60%. The exact next portable round is the
physical copy, target verification, startup and media benchmark.
