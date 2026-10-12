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
current web UI, checks the runtime manifest, applies the app-only update,
verifies all app hashes and runs the portable gate. On success the transfer
pack is at the predictable path `updates/app-current` inside this portable.
The BAT window stays open so the result can be read. Existing portable
services are restarted after success.

For the first transfer to another machine, copy the entire updated portable
folder (about 36 GiB). Keep its internal folder structure intact. On the
other machine run `VERIFY-PORTABLE.bat`, then `start-pro4bro.bat`.

For later app-only changes, click `UPDATE-PORTABLE.bat` in the development
machine's portable first. Copy only its `updates/app-current` folder (about
4 MiB) into the other machine's portable at the same relative path. Move an
older `app-current` aside before copying, so the new pack is a complete
folder. Then click `UPDATE-PORTABLE.bat` on the other machine. With no source
checkout above that portable, it applies the copied pack. Run
`VERIFY-PORTABLE.bat` before starting the app.

## Different machine

1. If the development portable is not inside the source checkout, double-click
   `MAKE-PORTABLE-UPDATE.bat` in the source checkout. The resulting folder path
   appears in its output; it is under `.scratch/portable-updates`.
2. Copy that whole folder to the portable machine and name it
   `updates/app-current` inside the portable folder. Replace an older
   `app-current` folder as a complete folder, not file by file.
3. Double-click `UPDATE-PORTABLE.bat` in the portable folder.

The update manifest records the source commit and whether uncommitted changes
were included. The update is a snapshot at creation time. Model/checkpoint
weights and user projects are excluded. If Python dependency inventory differs,
the update stops before changing any app file. A post-update gate failure
restores the previous app files and bundle manifest.

When Python requirements, embedded runtimes, engine source or checkpoint files
change, create and transfer a new full base bundle. An app pack cannot carry
those changes.

The standalone `.portable-bundle.json` continues to record total logical bytes
and the two layer manifest paths. A hardlink staging bundle can share disk blocks
with source files on one volume; the updater swaps in new independent app files
without editing the shared model/runtime files. A copied bundle on another drive
has its own physical files.
