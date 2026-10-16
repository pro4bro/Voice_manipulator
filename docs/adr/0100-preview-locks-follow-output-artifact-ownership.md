# 0100 — Serialize preview publication by canonical output folder

Accepted 2026-10-17, round43.

The process-wide preview lock made a cached output wait behind an unrelated
output's FFmpeg and durable report write. Each immutable output owns its preview
variants and history-prefix artifacts. Serialize all those writes with one lock
per canonical output folder, shared by service instances in this process.

Canonicalize with realpath and platform normcase before lookup, resolving path
aliases and Windows casing. A short registry guard protects get/create; a strong
local reference keeps the lock alive for holders and waiters. Weak registry
values let unused entries disappear instead of growing with every edited output.
A folder moved and reopened has a new canonical path; this does not make editing
an actively moved folder supported or create a cross-process locking guarantee.

Different outputs can proceed independently; same output variants still serialize,
validate exact prefixes and publish atomically. Hash, PCM, durability, revision
and source-preservation checks are unchanged. This removes head-of-line blocking
for unrelated outputs; concurrent FFmpeg work can still contend for CPU/storage.
Event-controlled tests prove independence, one publication for duplicate requests,
release on failure, path aliases and registry collection. A controlled hold is
evidence of lock scope, not normal request latency or the250ms browser gate.
