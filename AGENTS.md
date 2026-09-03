# Agent Guide

## Working Tree

The working tree is this checkout's repository root: the directory containing
both `.git` and `AGENTS.md`. Derive every local path from that root; do not
record or depend on a drive letter, network share, or another checkout's path.

Before editing or launching, confirm the current directory is the repository
root with `git rev-parse --show-toplevel`. Work done from another copy is lost,
and a stack started from one can serve the wrong code while appearing healthy.

A stabilization pass is in progress. Read `docs/STABILIZATION-PLAN.md` and
`docs/STABILIZATION-LOG.md` first; the log holds the current round pointer and the
project owner's feedback. Do one round per invocation, then stop.

Read `docs/SESSION_HANDOFF.md`, `.planning/STATE.md`, and `.planning/ROADMAP.md` before implementation. Treat `engines/OmniVoice` as read-only upstream source. Product code belongs outside `engines/` and reaches engines only through adapters.

Preserve the portability contract in `docs/PORTABILITY.md`: project manifests and Media Pool indexes store project-relative paths, project files remain inside their own folder, and runtime/model folders are never committed. When a project moves, reconnect it through Open Existing instead of writing a new absolute path into `project.json`.

## Agent skills

### Issue tracker

Issues use local markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md` and root `CONTEXT.md`.
