# Portable app updates

The portable has two operational layers:

| Layer | Inventory | Contents | Update route |
| --- | --- | --- | --- |
| App | `.portable-app-layer.json` | API, built UI, Studio adapter, OBS bridge package, launchers and scripts | `MAKE-PORTABLE-UPDATE.bat` then `UPDATE-PORTABLE.bat` |
| Base runtime and models | `.portable-model-layer.json` | Embedded Python profiles, upstream engine code, model/checkpoint caches and tools | Rebuild or a separately validated base/model pack |

The layer split is enforced by the app update's allowlist and file hashes.
Existing relative paths are retained; physically moving checkpoint directories
would require updating every engine loader and proving cross-drive portability.
The app pack never includes `.cache`, `.runtime/python`, OmniVoice upstream
source, or `.runtime/engines`.

## Same machine

Double-click `UPDATE-PORTABLE.bat` inside a portable folder located under this
source checkout. It finds `scripts/new-portable-app-update.ps1`, builds the
current web UI, stages an app-only update under `updates/generated-*`, checks
the runtime manifest, applies it, verifies all app hashes and runs the portable
gate. Existing portable services are restarted after success.

## Different machine

1. In the source checkout, double-click `MAKE-PORTABLE-UPDATE.bat`. The resulting
   folder path appears in its output; it is under `.scratch/portable-updates`.
2. Copy that whole folder to the portable machine and name it
   `updates/app-current` inside the portable folder. Replace an older
   `app-current` folder as a complete folder, not file by file.
3. Double-click `UPDATE-PORTABLE.bat` in the portable folder.

The update manifest records the source commit and whether uncommitted changes
were included. The update is a snapshot at creation time. Model/checkpoint
weights and user projects are excluded. If Python dependency inventory differs,
the update stops before changing any app file. A post-update gate failure
restores the previous app files and bundle manifest.

The standalone `.portable-bundle.json` continues to record total logical bytes
and the two layer manifest paths. A hardlink staging bundle can share disk blocks
with source files on one volume; the updater swaps in new independent app files
without editing the shared model/runtime files. A copied bundle on another drive
has its own physical files.
