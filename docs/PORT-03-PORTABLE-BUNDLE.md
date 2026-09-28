# PORT-03 portable bundle

Date: 2026-09-23

## Delivered in this round

- Added `scripts/build-portable-bundle.ps1` with `HardLink` staging and physical
  `Copy` modes. It runs the source portability gate before emitting a bundle,
  never overwrites an existing destination, supports Windows long paths, and
  leaves `.bundle-incomplete` behind if creation is interrupted.
- Added a bundle manifest with source revision state, component file/byte
  counts, exclusions, and SHA-256 hashes for launch and plugin-critical files.
- Excluded Git metadata, developer virtual environments, Node modules, OBS
  source cache, tests, logs, installer caches, user projects, and recordings.
- Added `scripts/install-obs-plugin.ps1` and `INSTALL-OBS-PLUGIN.bat`. The
  installer uses OBS's machine-wide Windows plugin layout, verifies the copied
  DLL hash, preserves an existing install unless `-Force` is explicit, and can
  create per-user `config.json` when project ID, token, and source UUIDs are
  supplied together.
- Added `VERIFY-PORTABLE.bat` and a portable quick-start guide.
- Extended `test-portable-runtime.ps1`: a source checkout now has 21 checks; a
  generated bundle additionally validates its manifest, critical hashes,
  exclusions, and completion state.

## Local acceptance evidence

Bundle path:

` .scratch/portable-release/Pro4Bro-Portable-20260923-port03b `

The path is separate from the source application root. Hardlinks keep the
staging folder from allocating a second 117.60 GiB on this build drive; copying
the folder to another drive materializes normal independent files.

The staging path is still nested under the repository's ignored `.scratch`
folder, so Windows Explorer adds its 117.60 GiB logical size to the repository
properties even though NTFS stores the linked content once. The full storage
accounting and duplicate-content audit are in
`docs/PORT-03-STORAGE-AUDIT.md`.

| Check | Result |
| --- | --- |
| Bundle inventory | 128,574 files; 126,267,432,964 bytes (117.60 GiB) |
| Source `Profile All` | 21 passed, 0 failed |
| Bundle `Profile All` | 25 passed, 0 failed |
| Manifest critical hashes | Passed |
| Build-only content exclusion | Passed |
| OBS installer fixture | DLL copied; SHA-256 matched; two-source config parsed |
| Bundle API health | `ok`, private `core/python.exe` |
| Bundle Studio health | `ok`, private `stt/python.exe` |
| Service shutdown | Both ports released |
| Backend regression | 383 passed |
| Frontend regression/build | 293 passed; production build passed |

## Remaining external gate

This workstation has no installed OBS instance and is not a clean second
machine. Therefore PORT-03 clean-machine acceptance is still open. On the next
Windows test machine, copy the physical bundle, run `VERIFY-PORTABLE.bat`, start
the app, install/restart OBS, configure the bridge, and record one microphone
plus one meeting-application source.

OBS source UUID entry is still manual because the native plugin does not yet
have a source-picker settings panel. This does not affect DLL installation, but
it matters for the first real multi-source setup and must be observed during
the external gate.
