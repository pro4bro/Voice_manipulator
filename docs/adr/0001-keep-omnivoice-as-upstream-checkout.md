# ADR 0001: Keep OmniVoice as an upstream checkout

## Status

Accepted

## Context

Pro4Bro needs OmniVoice capabilities while upstream updates must remain easy to receive. Editing engine files would create a permanent merge burden and couple product code to one engine.

## Decision

Keep the official repository at `engines/OmniVoice` as an independent Git checkout. Put every Pro4Bro route, adapter, cache rule, launcher, UI, and patch outside that directory. Update with a fast-forward-only script after checking for a clean engine worktree.

## Consequences

- Upstream updates remain inspectable and reversible.
- Pro4Bro must maintain an adapter rather than importing engine internals throughout the app.
- Engine environment and model setup need explicit orchestration in later phases.

