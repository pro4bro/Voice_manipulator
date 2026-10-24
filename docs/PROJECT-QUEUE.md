# Project Queue — approved implementation contract

Round: PROJECT-QUEUE-01. Owner approved the revised footage mockup on 2026-10-23.
This implements the approved workflow in one bounded round; phase percentages
and unrelated engine quality gates do not advance.

## Acceptance

- Every scheduled or running project operation is recorded, including operations
  lasting over five seconds. Unknown progress stays indeterminate with a real
  stage; percentages come from measured work, not elapsed-time animation.
- Import, STT, subtitle alignment and diarization share one Footage tab. One slot
  identifies its parent footage; child track operations remain individually
  visible. The slot averages the current child task fractions with equal weight.
  Unknown child progress makes the aggregate unknown. Only scheduled operations
  participate; repeated older attempts remain history, not extra weight.
- Training, Generate, Lip Sync, Export and Other retain separate tabs. Task children
  may expand. Complete tasks are gray and move to Done; failed, cancelled and
  interrupted tasks must retain their actual state, never masquerade as Done.
- Queue opens from the Status bar and receives the same real progress as local
  controls. Project changes cannot display another project's task history.
- Task history lives under the portable project's jobs/task-queue directory.
  Atomic snapshots preserve completion through reopen and process restart.
  Queued/running work owned by a dead process becomes interrupted; this feature does
  not silently restart inference or introduce a new execution scheduler.
- Completion requires the operation's existing validated result/artifact.
  Alignment completion produces a preview, not automatic Apply.

## Implementation and verification

Provider: extend existing ActivityCenter with project task persistence and stable
asset/footage/parent identities. Existing operation queues retain execution and
cancellation ownership. Consumer: a project Queue dialog and Status bar, polling
the project API with stale-response guards. No new package dependency.

Backend uses the repository's snake_case/Pydantic camelCase alias conventions;
frontend uses the existing React components, semantic controls and theme tokens.
Tests live alongside current activity/queue/worker tests. Protect source media,
manual timing locks, project portability and upstream engine boundaries.

Commands from the repository root:

```powershell
.venv/Scripts/python.exe -m pytest services/api/tests -q
```

From apps/web:

```powershell
npm test
npm run typecheck
npm run build
```

Verify persistence/restart, concurrency, queued-to-running-to-terminal transitions,
project isolation, footage means, repeated attempts, unknown values, dialog
keyboard access and browser rendering. Use a disposable project for real media
verification; preserve the owner's manually corrected Conviction project.

## Use

Open **QUEUE** at the right end of the Status bar. Footage contains Import, STT,
Align Subtitle and Speaker Diarization. Expand a footage to see its operations;
completed operations are gray, running operations orange, pending operations blue.
Expand Chi tiết for actual stages/errors. Training, Generate, Lip Sync, Export
and Other have separate tabs. The upper list retains failed/cancelled/interrupted
attempts for inspection. Successful slots move to Done.

An em dash means the engine has not provided a measurable total. Percentages may
return to indeterminate between measured copy/alignment stages and validation.
Queue shows task history; start/retry/stop controls stay with their existing
features. Global runtime operations without a project use Status; Queue history
begins when this version starts recording operations.

## OUTPUT-LIFECYCLE-01 correction (2026-10-24)

Training Run state and measured progress now reconcile the receipt projection on
each Queue read. Stale Done cannot override running, interrupted, failed or
cancelled Training Runs. Train400/400 remains96% until checkpoint/publication
finish. Resumed attempts appear under the same operation's History. See ADR0142
and `docs/gates/output-lifecycle-01-20261024.md`.
