# USER-FEEDBACK-25 — cache choice and source reveal

2026-10-12. Owner feedback: importing a footage should offer a “Cache file”
checkbox. Checked copies the source file into the project; unchecked retains a
link to its original host path. Footage context menus need separate “Reveal in
Explorer” and “Reveal in Project Folder” actions, with the latter disabled
when no project source copy exists.

## Bounded implementation

- The primary Media Pool import action uses the host file picker. Its in-app
  confirmation dialog has a checked-by-default “Cache file” checkbox. The
  completed-container track import dialog uses the same choice. The choice is
  passed through ModuleRegistry and WorkspaceShell to the existing native
  import API; the previous two-button dialog did not provide this control, and
  the track dialog's third cache argument was lost in the registry callback.
- The API now passes its machine-local source registry into the media importer.
  Uncached imports retain the original absolute locator only in that local
  registry; project media metadata keeps a relative prospective source path
  and project-owned analysis derivatives. Cached imports copy the source to
  `assets/media/<asset-id>/source.<ext>`, which moves with `project.json`.
- Reveal in Explorer resolves the machine-local original for host imports.
  Reveal in Project Folder resolves the project-owned source when cached. For
  a child track, both commands address its parent container. The project
  action is disabled in the UI when the parent host source is uncached, and
  the API also rejects a direct request. A cached project copy still reveals
  after reopening on a machine without the original-path registry.
- Browser upload remains available as a secondary action. Browsers do not
  disclose a usable original absolute path to this API, so that dialog shows
  “Cache file” checked and disabled and explains that upload always stores a
  project-owned source. On that path, the project copy is the app's source.

## Verification

- Real half-second two-track MKV API tests cover checked/unchecked import,
  original/project reveal, child-track reveal, later cache enablement, source
  byte equality and an app instance without the machine-local source registry:
  **7/7 passed** in the affected backend file.
- Media Pool and WorkspaceShell focused tests: **104/104 passed**. They cover
  checkbox state, both import routes, an uncached track's disabled project
  action and forwarding `cacheLocal=false` through the workspace.
- Full frontend: **780/780 passed** across 84 files with two workers.
  An initial full run had an existing timing-sensitive Live Caption assertion;
  that unrelated file passed **51/51** on its own and the complete rerun passed.
- `npm run typecheck`, `npm run build` and `git diff --check`: passed.
- Full backend: **744/744 passed** in 228.16 seconds, with two existing
  deprecation warnings.

## Remaining acceptance

Native Windows acceptance remains: restart the source API/UI, import a small
file once with Cache file checked and once unchecked, inspect the context menu
and the opened Explorer selection, then move/reopen the cached project. DOM
tests and a mocked Explorer call do not prove the actual desktop window.
Uncached source links depend on the source file staying at its host path; moving
the project alone cannot carry that file. No source media or model artifacts
from the owner's project were changed. Phase03 remains 60%.

Exact next round: USER-FEEDBACK-25B native import/reveal acceptance on the
owner's machine after source restart. STT-TIMING-ACCURACY-01 still awaits the
Conviction anchor reference.
