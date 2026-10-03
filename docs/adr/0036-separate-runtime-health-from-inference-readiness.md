# ADR 0036: Separate runtime health from inference readiness

## Status

Accepted — LIVELINK-STT-12K, 2026-10-03.

## Context

The cold-start gate needs to distinguish a process exiting, losing its listener,
and remaining alive while a health request is slow. Studio's `/api/status`
calls `_resolve_device`, importing Torch and probing CUDA on the first request.
Isolated cold launches measured 2.672–3.594 seconds for that request while the
listener remained present. A 0.6-second probe timed out while API/controller
health and independent native/netstat listener inventories remained healthy.
This establishes a readiness-probe defect, not the cause of the historical
natural listener loss observed in 12F.

## Decision

- Studio exposes an asynchronous `/api/health` returning only its service health.
  It does not import Torch, probe CUDA, load a model or consume an inference
  worker. `/api/status` retains device/model diagnostics and their existing
  semantics. Healthy HTTP is never evidence of model or artifact success.
- All three launcher readiness waits use the shared PowerShell helper. It checks
  the launched process before and after HTTP, requires `status=ok`, and applies
  elapsed-time budgets: controller 30, Studio 150 and API 60 seconds. A pending
  one-second HTTP attempt and terminal evidence collection can overrun the
  nominal deadline; attempts no longer multiply timeout and sleep durations.
- Register workload PIDs immediately after launch, before readiness waits, with
  atomic replacement of the existing machine-local session record. Failed
  startup rolls back the launched processes and removes that session record.
- Record startup waiting/ready/exited/timeout with UTC time, elapsed time,
  expected PID, process life, exit code, listener PID and probe result. The
  controller also observes changes approximately every two seconds outside
  lifecycle actions, recording process life, listener ownership and lightweight
  HTTP health separately. Foreign listeners are never probed by the observer.
- Existing runtime status fields continue to describe listener ownership. This
  round does not redefine their public/UI contract or project persistence.

## Consequences

Runtime failure evidence survives the action that launched the process. Logs
distinguish a live process without a listener from an exited process and a
listener whose HTTP probe timed out. Stable polls do not add duplicate records.
The portable bundle includes and hashes the new shared readiness helper.

The observer belongs to the controller process: it cannot record after that
process dies. Console readiness and existing process-tree ownership still
govern controller startup/exit. The observer does not automatically restart
workloads, change project state, or prove transcription quality.

Five isolated cold cycles did not reproduce natural listener loss. Persisted
project recovery backlog and the historical foreground/detached launch topology
remain a separate diagnostic gate; see the 12K acceptance record.
