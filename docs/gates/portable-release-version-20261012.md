# PORT-VERSION-01 — portable app release version

Date: 2026-10-12

## Completed

- Added `APP-VERSION.json` with `alpha 0.5.0` as the source app release.
- Added `releaseChannel` and `releaseVersion` to generated app packs, full
  bundle manifests, and installed app-layer manifests. Update packs also have
  a readable `VERSION.txt`.
- The updater accepts the first versioned pack over the earlier unversioned
  portable. It refuses a lower release and changed app hashes under the same
  release. Identical packs can be applied repeatedly.
- Documented patch, phase-minor and stable 1.0.0 transitions in ADR0069 and
  portable update instructions.

## Verification

- Four affected PowerShell files parsed without errors; `git diff --check`
  found no whitespace errors.
- Source pack creation with `-SkipWebBuild` produced 153 app entries and
  `VERSION.txt` containing `alpha 0.5.0`.
- Click-equivalent runs of the portable `UPDATE-PORTABLE.bat` each built the
  UI with `tsc -b && vite build`, applied 153 files, and passed 30/0 checks.
  Both reported `alpha 0.5.0`.
- Bundle manifest, app-layer manifest, pack manifest and `VERSION.txt` all
  report `alpha 0.5.0`. Installed bundle is 35.98 GiB by logical bytes;
  `updates/app-current` is 3.94 MiB.
- A copied pack with a changed README and recomputed file hash, still labeled
  `alpha 0.5.0`, was rejected with an explicit bump instruction. An `alpha
  0.4.9` pack was also rejected. The installed bundle manifest hash did not
  change after the content rejection. The temporary conflict pack was removed.

## Remaining gap

The folder and transfer pack have not yet been copied to a second Windows
machine. That physical test is needed to prove runtime portability and the
fixed-media benchmark. Exact next portable round: copy, verify, start, and
benchmark on that machine. Phase03 remains 60%.
