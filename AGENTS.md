# Agent Guide

## The working tree is on E:

`E:\AI_RND\PRO4BRO\VOICE_MANIPULATOR\PRO4BRO_VOICE_MANIPULATOR` is the only copy
that is edited or run. Two others exist and are **not** the working tree:

- `V:\AI_RND\...` (`\\192.168.100.102\hub\...`) — kept as a backup, read only.
- `E:\AI_RND\PRO4BRO_VOICE_MANIPULATOR` — an older layout, abandoned.

Check which path you are in before editing or launching anything. Work done in a
copy is lost, and a stack started from one serves the wrong code while looking
entirely healthy — that mistake has already cost this project a full session.

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
