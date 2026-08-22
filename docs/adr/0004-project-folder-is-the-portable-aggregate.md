# ADR 0004: The Project Folder Is The Portable Aggregate

## Status

Accepted

## Context

Absolute paths in app registry records and Media Pool indexes prevented a
project from surviving a folder or drive relocation. Studio output URLs also
coupled Timeline playback to an external runtime folder.

## Decision

Treat the folder containing `project.json` as the aggregate root. Persist `.` in
the manifest, persist media paths relative to that folder, serve analysis audio
through a project route, and keep human plus machine-readable activity inside
the project. Treat the app-level registry as a disposable locator and provide
Open Existing to reconnect a moved folder.

## Consequences

- Moving the whole folder preserves source media, transcript history, notes,
  jobs, exports, and cache references.
- Runtime responses may contain resolved display paths, but on-disk project
  records do not depend on the current workstation path.
- A locator crossing Windows drive letters may need manual reconnection because
  no valid filesystem-relative path exists between those volumes.
