# Portable app updates

The portable has two operational layers:

| Layer | Inventory | Contents | Update route |
| --- | --- | --- | --- |
| App | `.portable-app-layer.json` | API, built UI, Studio adapter, OBS bridge package, launchers and scripts | `scripts/maintenance/MAKE-PORTABLE-UPDATE.bat` then `UPDATE-PORTABLE.bat` |
| Base runtime and models | `.portable-model-layer.json` | Embedded Python profiles, upstream engine code, model/checkpoint caches and tools | Rebuild or a separately validated base/model pack |

The layer split is enforced by the app update's allowlist and file hashes.
Existing relative paths are retained; physically moving checkpoint directories
would require updating every engine loader and proving cross-drive portability.
The app pack never includes `.cache`, `.runtime/python`, OmniVoice upstream
source, or `.runtime/engines`.

## App release version

Creating a new pack automatically allocates the next app release and names its
folder, for example `App-alpha-0.5.1-NoVibeVoice`, then
`App-alpha-0.5.2-NoVibeVoice`. The owner does not edit the version file or rename
the transfer folder. The generator updates `APP-VERSION.json` under an exclusive
lock; a failed build does not publish a completed pack. Applying an existing
pack retains its number. Each new creation allocates another patch number,
even if the app files are identical.

When the next planned phase begins, the maintainer sets the next phase baseline
to `alpha 0.6.0`; automatic patch numbering continues from there. After planned
functions are complete, the maintainer sets channel `stable` and baseline
`1.0.0`. `lastIssuedVersion` distinguishes a new phase baseline from an already
issued release. These are maintenance steps, not steps for the owner to perform
when copying an update.

The update folder has a readable `VERSION.txt`; `app-update.json`, the portable
`.portable-bundle.json`, and `.portable-app-layer.json` record `releaseChannel`
and `releaseVersion`. The updater reads manifests in the immediate subfolders
of `updates` and chooses the highest numeric version matching this portable's
profile. It ranks `0.5.10` above `0.5.9`, regardless of folder name or date.
Older folders can stay in place. The updater rejects a downgrade and conflicting
app bytes sharing one version. `schemaVersion` describes the JSON format
and does not follow the app release number. The internal npm/API versions are
independent.

## Same machine

For alpha 0.5.8 and newer, double-click `UPDATE-PORTABLE.bat` inside a portable
folder located under this source checkout. It finds
`scripts/new-portable-app-update.ps1`, builds the current web UI, allocates a
version, checks the runtime manifest, applies the app-only update, verifies app
hashes and runs the portable gate. On success, `transferPack` reports its
numbered folder inside `updates`. This source-build mode is enabled on the
pack's recorded source machine. A newer received pack is applied first. A
portable on another machine applies its copied packs. The BAT window stays open
so the result can be read. A running portable's controller, API and Studio are
stopped before replacing files; their ports must be free. The console launcher
reopens the full stack after success or rollback, unless `-NoRestart` is passed.

### One-time updater migration

An installed alpha 0.5.7 or earlier must receive the fixed updater through the
pack entrypoint once: its root updater leaves the controller running and Windows
can refuse to move `services/api`. Alpha 0.5.5 or earlier also accepts only the
legacy six-BAT inventory and rejects a four-BAT update pack. For this update,
create the numbered pack with `scripts/maintenance/MAKE-PORTABLE-UPDATE.bat`, copy it
into `updates`, and click that pack's `APPLY-UPDATE.bat` once. It runs the
updater shipped in the pack, removes the two verified legacy launchers, and
installs the compatible root updater. After it succeeds, use the portable
root's `UPDATE-PORTABLE.bat` for later updates.
Alpha 0.5.8 and newer can use either entrypoint.

For the first transfer to another machine, copy the entire updated portable
folder (about 36 GiB). Keep its internal folder structure intact. On the
other machine run `VERIFY-PORTABLE.bat`, then `open-pro4bro-console.bat`.

For later app-only changes, click `UPDATE-PORTABLE.bat` in the development
machine's portable first. Copy its whole numbered folder (about 4 MiB), such as
`updates/App-alpha-0.5.1-NoVibeVoice`, into the other portable's `updates`.
Keep the original folder name. Then click `UPDATE-PORTABLE.bat` beside
`open-pro4bro-console.bat` on the other machine; it selects the newest version. Run
`VERIFY-PORTABLE.bat` before starting the app.

## Different machine

1. If the development portable is not inside the source checkout, double-click
   `scripts/maintenance/MAKE-PORTABLE-UPDATE.bat` in the source checkout. The resulting folder path
   appears in its output; it is under `.scratch/portable-updates`.
2. Copy that whole numbered folder into the portable machine's `updates` folder.
   Keep its original name and its `payload`, `app-update.json`, `VERSION.txt`
   and `APPLY-UPDATE.bat` together.
3. For alpha 0.5.7 and earlier, click the new pack's `APPLY-UPDATE.bat` once.
   For alpha 0.5.8 and newer, double-click `UPDATE-PORTABLE.bat` beside
   `open-pro4bro-console.bat`.

`APPLY-UPDATE.bat` and the BAT inside `payload` resolve the enclosing full
portable and apply the highest available compatible version. They do not
generate from source. A pack extracted elsewhere explains that the complete
portable is required and that the whole pack belongs under its `updates`.

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
