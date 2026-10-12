# PORT-UPDATE-01 — portable app refresh

Date: 2026-10-12. This bounded round makes app changes transferable without
copying the 35.98 GiB model/runtime payload again. The existing NoVibeVoice
bundle is at .scratch/portable-release/Pro4Bro-Portable-20261012-NoVibeVoice.

## Scope

- MAKE-PORTABLE-UPDATE.bat creates a 153-file app snapshot with per-file SHA-256,
  source revision, profile and runtime/requirements compatibility hashes.
- UPDATE-PORTABLE.bat inside the portable either builds from an ancestor source
  checkout or applies a copied updates/app-current pack. It stages files, swaps
  app-owned paths, runs the portable gate and restores exact previous bytes on
  failure. Only services belonging to that bundle are stopped and restarted.
- App and base runtime/model inventories are separate. Existing loader paths
  remain in place. The updater excludes checkpoints, engine source, embedded
  Python, model caches, user projects and recordings.

## Verification

- Source batch creator produced .scratch/portable-updates/app-update-final-v4-20261012:
  154 total files including the manifest, 4,124,288 bytes (3.93 MiB).
- The portable batch found the source checkout automatically, built the UI,
  applied 153 app files and returned updated=true, modelLayerChanged=false,
  gatePassed=29, gateFailed=0.
- Base inventory has 12 components and zero app-owned components. Bundle manifest
  reports 97,553 logical files and 38,635,534,688 bytes (35.98 GiB).
- A modified README with unchanged pack hash was rejected before mutation;
  the bundle manifest hash remained the same.
- A corrupted OBS package manifest with a matching pack entry hash passed the
  staging check, failed the post-update gate and triggered rollback. Bundle,
  app-layer, model-layer and OBS manifest hashes matched their pre-update values
  byte for byte afterward.
- PowerShell parse checks passed for the four affected scripts. Git diff check
  passed. Backend: 744 passed, 2 existing warnings. Frontend: 780 passed across
  84 files with two workers; focused Script/Timeline: 64 passed. Typecheck and
  production build passed. The default parallel frontend run hit two existing
  load-sensitive Script/Timeline cases (778/780); both passed in isolation and
  the bounded two-worker full run.

## Remaining gap and next round

This verifies the updater on the build machine. Copy the portable to another
Windows machine, run VERIFY-PORTABLE.bat, copy the 3.93 MiB app pack to
updates/app-current, run UPDATE-PORTABLE.bat, then start the app and benchmark
fixed media. That physical transfer matters because this machine cannot prove
the target GPU/driver, OBS installation or relocated path behavior.

Changes to Python requirements, upstream engines or model checkpoints still
need a separately validated base/runtime build. Product Phase 03 remains 60%;
the next planned feature round is STT-TIMING-ACCURACY-01 when the Conviction
timing reference is available.
