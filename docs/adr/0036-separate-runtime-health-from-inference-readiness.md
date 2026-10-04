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

## Persisted recovery evidence — LIVELINK-STT-12L

Startup logs recovery scan start/finish through `pro4bro.activity`, including
PID, elapsed seconds, project count and queued live/MKV/detailed worker counts.
These rows distinguish discovery/scheduling from listener readiness; they do
not certify inference or transcript completion. No project identity, media path
or transcript content is added. Recovery behavior and deadlines are unchanged.

Six isolated persisted-project takes kept listeners/health stable; one additional
project-list request exceeded a two-second harness budget and is retained as an
incomplete take. The historical natural listener loss still did not recur.
See `docs/gates/livelink-stt-12l-persisted-startup.md` for corpus, harness-cost,
cache and inference limits. Matching future failure evidence remains required
before attributing or claiming a repair of that historical trigger.

## Recovery storage and startup diagnostics — RUNTIME-READY-01B

Resumed worker project lookups and MKV STT metadata reads use `asyncio.to_thread`
so repository/library locks and cold checkpoint reads cannot block listener
binding on the event loop. Existing locks, durable checkpoint schemas and
result-before-cursor ordering stay in force. An already running thread read
finishes even when its awaiting coroutine is cancelled.

The production entrypoint attaches a bounded Python startup observer after
configuring existing logging. Three samples at 15/30/45 seconds record thread
frame locations, without locals/source text, until listener-binding or terminal
startup-failure logging. Lifespan completion alone does not mean binding. This
uses Python frame inspection, with no native faulthandler timer or new WinAPI
calls. Its operational evidence goes to the existing API error log and does not
restart services, mutate projects or extend launcher deadlines. It cannot
capture a native crash that exits before sampling.

Real Uvicorn storage-wait regressions and full-console launches pass; natural
intermittent/native failure attribution remains open. See the 01B gate.

## Controller startup budget amendment — RUNTIME-READY-01C

On 2026-10-04, controller PID 19904 remained alive without a listener at the
30-second deadline, then bound port 18119 and answered health about 0.6 seconds
later. A prior same-day cold start took 20.680 seconds. The controller launch
budget is now 60 seconds; process-exit, listener and HTTP evidence remain
unchanged. This prevents the observed healthy late bind from being rolled back.
The transient startup delay itself is not attributed to a specific import,
disk operation or host load without a captured profile.
