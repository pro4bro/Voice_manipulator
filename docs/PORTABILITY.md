# Portability Contract

## Application Folder

All launcher paths are derived from the folder containing the repository.
Python packages live in `.venv`, frontend packages in `apps/web/node_modules`,
FFmpeg in `.tools/ffmpeg`, caches in `.cache`, and the preferred legacy sidecar
in `.runtime/omnivoice-studio`. These folders can move with the application but
are intentionally excluded from Git because they are machine-specific or large.

The source checkout at `engines/OmniVoice` is a Git submodule. Clone with
`--recurse-submodules` or run `git submodule update --init --recursive`.

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
