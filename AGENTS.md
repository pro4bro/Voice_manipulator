# Agent Guide

Read `docs/SESSION_HANDOFF.md`, `.planning/STATE.md`, and `.planning/ROADMAP.md` before implementation. Treat `engines/OmniVoice` as read-only upstream source. Product code belongs outside `engines/` and reaches engines only through adapters.

Preserve the portability contract in `docs/PORTABILITY.md`: project manifests and Media Pool indexes store project-relative paths, project files remain inside their own folder, and runtime/model folders are never committed. When a project moves, reconnect it through Open Existing instead of writing a new absolute path into `project.json`.

## Agent skills

### Issue tracker

Issues use local markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md` and root `CONTEXT.md`.
