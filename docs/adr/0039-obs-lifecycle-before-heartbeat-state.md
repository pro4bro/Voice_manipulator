# 0039 — Lifecycle events own open OBS video-span state

Date: 2026-10-03
Status: Accepted
Round: UX-10B

## Context

The native bridge sends its latest output status in a heartbeat before sending
queued lifecycle events. During the real six-source gate, the heartbeat set
`obs_status` to paused before `obs-pause` reached the reducer. That event then
failed its recording-state precondition. The queued event blocked subsequent
control ACKs; the app remained recording and showed REC instead of PAUSE.

## Decision

While `active_span_id` exists, lifecycle events own the runtime's OBS state and
native clock boundaries. Inventory/lease heartbeats still synchronize, but
their observed output status cannot advance the open span's state. When there
is no active span, the existing heartbeat observation behavior is retained.

## Consequences and evidence

Pause/Resume/Stop can consume their ordered native events and preserve pause
intervals. The app may show the preceding OBS state until the queued event is
received; it does not invent an interval from heartbeat arrival time.

A regression sends each heartbeat before its corresponding lifecycle event,
checks pause boundaries and the completed recording, and fails before the fix.
The same OBS process recovers its blocked Pause after an isolated API restart;
fresh native Pause/Resume/Stop then pass. See the UX-10B gate report.
