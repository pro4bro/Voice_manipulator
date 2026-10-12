# ADR 0068: Open the API listener before scanning persisted project work

Date: 2026-10-12

## Context

The API lifespan awaited recovery across every registered project before
Uvicorn opened port 18120. On the affected start, the scan took 41.657 seconds
for 23 projects; combined with Python startup, readiness exceeded the launcher's
60-second deadline even though the API process remained alive.

## Decision

Run the existing durable recovery scan as a lifespan-owned task. Wait up to one
second for the common fast recovery case, preserving immediately reconciled
state. If it takes longer, yield startup so Uvicorn can bind and answer health
while project files are read. Keep the task's exception in the API log and
cancel/join it before closing recovered workers during shutdown. The checkpoint
validation and queue reconciliation rules remain the same.

`/api/health` indicates listener readiness. Persisted processing states may
still be reconciling immediately after health becomes available; the recovery
completion log marks when that work has finished.

## Consequences

Slow project storage no longer consumes the entire launcher readiness budget.
Recovery remains asynchronous and may overlap with early UI reads. If recovery
fails, its exception is logged without silently discarding the task.
