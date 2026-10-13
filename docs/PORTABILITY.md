# Portability Contract

## Feedback and release parity

Owner decision, 2026-10-13: implement all feedback in the main app source first,
then produce its numbered portable update. Validate the corrected behavior in
both source and installed portable and verify matching app file hashes. A
portable-only patch does not complete a product fix. Runtime/model weights
remain separate from app updates.

Voice Collection models can be exported individually as verified voice-entry ZIP
packages and imported into a collection on another machine, then into its project.
The package includes referenced trained artifacts, reference audio, consent and
publication lineage with relative paths. Base weights stay outside the package;
the destination needs a compatible installed engine. See ADR 0072 for format,
integrity checks, limits and the standalone model versus Model Set distinction.

## Application Folder

All launcher paths are derived from the folder containing the repository.
Application dependencies live under `.runtime`, FFmpeg lives in
`.tools/ffmpeg`, caches live in `.cache`, and the built web application lives in
`apps/web/dist`. These folders are intentionally excluded from Git because they
are machine-specific or large. VibeVoice and research engines use
`.runtime/engines` by default; the app no longer silently reads sibling
checkouts.

A normal Windows `venv` is not a portable runtime. Its `pyvenv.cfg` and console
entry points can refer to the Python installation that created it. Editing only
the activation script does not remove that dependency. A folder may be called a
portable test bundle only after `scripts/test-portable-runtime.ps1 -Profile All`
passes from the moved folder. See `docs/PORTABLE-RUNTIME.md`.

For app-only refreshes of an already built portable folder, see
`docs/PORTABLE-APP-UPDATES.md`. The app update excludes embedded runtimes,
upstream engines, model caches and checkpoints; those remain a separate base
layer and require a new validated base package when changed.

Runtime processes use isolated CPython 3.11.9 embedded distributions below
`.runtime/python/<profile>`. Their `python311._pth` files contain only relative
paths to vendored packages and the product/engine source needed by that profile.
The build-machine venvs remain dependency sources for preparing a bundle and are
not launcher dependencies.

The source checkout at `engines/OmniVoice` is a Git submodule. Clone with
`--recurse-submodules` or run `git submodule update --init --recursive`.

The runtime controller uses only paths derived from the current repository
root. It listens on port 18119, starts API/Studio through
`scripts/pro4bro-workloads.ps1`, and writes only ignored logs/session state
under `data/logs` and `data/runtime`. Restart also copies the product-owned
Studio adapter into `.runtime/omnivoice-studio`; it never writes into
`engines/OmniVoice` or persists the current drive letter in a project manifest.

## Project Folder

The folder containing `project.json` is the only project root. Persistent paths
inside that folder use forward-slash relative values:

```text
project.json                         projectPath=".", location="."
assets/media/index.json              sourcePath="assets/media/.../source.ext"
assets/media/index.json              analysisPath="assets/media/.../analysis.wav"
```

The folder also contains:

```text
assets/                              original and derived project media
activity/events.jsonl                machine-readable event history
notes/ACTIVITY.md                    human-readable event history
notes/PROJECT_HANDOFF.md             project-level continuation notes
jobs/                                project job state
exports/                             final deliverables
cache/                               rebuildable project cache
```

To relocate a project, stop active jobs, move the whole folder, choose Open
Existing in Project Hub, and select the moved folder. The app rewrites only its
disposable recent-project locator; it does not rewrite project-internal paths.

## Migration

On load, old `project.json` files containing absolute `projectPath`/`location`
values are rewritten to `.`. Old Media Pool entries are converted to paths
relative to the project root when the referenced files are inside that project.
The migration is atomic and appends `PROJECT_MIGRATED` to the project activity
notes.

Windows cannot express a relative path between different drive letters. For an
external project on another drive, its canonical project files remain fully
portable, while the disposable recent-project registry may need to be rebuilt
with Open Existing after moving the app or project.
