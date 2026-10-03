# ADR 0038: Workspace recording selection wins during render

Date: 2026-10-03. Status: Accepted.

## Context

UX-08B reproduces a selection feedback loop using two physical OBS recordings.
Media Pool requests recording B, but Timeline's local selection still holds A
until its synchronization effect runs. The notification effect echoes A back
to the workspace during that render. Requests alternate between A and B;
Script and audio can disagree and fetches fail under the resulting churn.
A regression reproduces the stale callback in both selection directions.

## Decision

Timeline resolves recording identity in this order: active project capture,
workspace-requested recording, local uncontrolled selection, journal fallback.
The requested identity takes effect in the same render. The explicit Timeline
selector continues notifying the workspace; local selection still supports a
caller with no requested recording. Active recording remains authoritative.

## Consequences

Media Pool and Timeline no longer fight over a requested footage. This changes
neither recording IDs nor persisted media formats. Selection remains transient
and does not add F5 selection persistence. Physical reopen/playback and group
recycle/restore pass after rebuilding; unrelated capture/STT latency remains
outside this decision. Evidence: `docs/gates/ux-08b-two-recording-lifecycle.md`.
