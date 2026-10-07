# TASK-STOP-DEVICE-01C — settle cancelled activity

2026-10-07. Repairs the stale running footer observed during real STT and
community-1 acceptance. No engine, PCM, project format or recognition setting
changes. Training/Generate and older physical/identity gates remain open.

## Reproduction and repair

`activity-before-fix.json` shows two ActivityTasks still running even though their
STT/diarization media is cancelled and Studio has no active job. Queue cancellation
branches updated media but never finished the corresponding Activity Center task.

Focused regression initially fails3 cancellation/failed-ack assertions and passes
the queue-stop case. The new `job_cancelled` helper settles cancellation as
cancelled; failed engine acknowledgement settles as failed. Both queues also
settle activity when active footage disappears. First Stop keeps the active task
running until processing completes. Existing cancellation checks suppress late
results/progress; tests exercise actual queue paths. Generic Activity Center
terminal overwrite semantics remain a separate contract, with no new caller.
The five changed source/test files pass36 focused activity/queue tests with the
two existing deprecation warnings. Diff review confirms bounded scope.

## Actual new-API acceptance

Restarted only the owned fixture API (PID8620), then repeated both engines.
The harness's Stop-Process InputObject form raised NullReference even outside
the sandbox; guarded `-Id -Force` succeeded. This was fixture restart handling,
not a product readiness or cancellation failure.

- community-1 actual job binds worker22472; GPU sample6191MiB/89%. Queue Stop
  drops pending work while its ActivityTask remains running. Browser two Stop
  activations and Yes cancel the inference; media/activity both become cancelled,
  Studio worker/job maps empty, OS PID lookup absent.
- Medium STT actual job binds worker86536; GPU samples6582MiB/45% and
  6938MiB/87%. Queue Stop retains running activity with zero pending work.
  API hard Stop cancels/reaps it and settles activity. No task remains running.
  The browser's footer returns to READY after its finished-task retention period.
- All seven analysis WAVs and the original speech hash agree with the pre-fix
  snapshot. Completed transcripts/diarization data remain retained. No accuracy,
  word-boundary, latency or speaker-identity acceptance is inferred from samples.

Evidence under `.scratch/task-stop-device-01`: `01c-dia-queue-stop.json`,
`01c-dia-gpu.json`, `01c-dia-stopped.json`, `01c-stt-active.json`,
`01c-stt-queue-stop.json`, `01c-stt-stopped.json`, `01c-final-ui.txt` and
`activity-acceptance.json`. `verify_activity.py` passes all assertions.
Browser console is clean; screenshot capture again reports unavailable, so
saved DOM/API/process evidence is used without a screenshot or mouse claim.

## Checks, cleanup and next scope

Full checks pass: frontend560/63 files, host API650/two existing warnings
(193.36s), Studio22/two existing warnings, typecheck/build and diff check.
Full logs use the `01c-` prefix under the fixture directory.
Source Studio release succeeds; all owned fixture
controller/API/Studio PIDs are stopped, no inference worker remains. The sole
scratch preferences copy is removed; original preferences remain untouched.
Browser fixture tab is closed and its original visibility setting restored.
`cleanup.json` records these checks. Ignored audio/evidence files are retained.

Normal app was stopped at the post-test status check. Official launcher starts
it again in a durable hidden host console, PID64036; controller444/API20188/
Studio8356 are running, all three HTTP health statuses are ok. Current Studio
source is synchronized by the launcher. Readiness timing is recorded in the
normal readiness log: controller3.553s/Studio3.291s/API3.409s; launcher
stdout/stderr are retained with the fixture.
This is startup/source activation, not a second normal-project model run.

Next TASK-STOP-DEVICE-01D: real Training Stop/checkpoint Resume and Generate Voice
Stop/rerun using a selected project/Speaker and compatible manifest/checkpoint.
No suitable persisted acceptance artifacts were found; owner selection question
is pending. Native picker/mouse/audible scrubbing, physical mic/OBS and second
machine LAN/Tailscale checks retain their human/device prerequisites. Existing
recognition budgets and Phase03-04 quality work do not advance in this round.
