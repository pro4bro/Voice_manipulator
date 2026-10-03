# RUNTIME-READY-01 — Startup timeout and checkpoint I/O

Date: 2026-10-03. Baseline `e796ad1`, starting working tree clean.
Scope: Repair one measured event-loop blocking seam; restore the actual local
runtime. The original intermittent timeout is not proven exclusively explained.

## Incident and evidence

The owner's PID 35832 stayed alive, had no API listener and failed readiness at
61.063 s. `data/logs/pro4bro-readiness.log` retains this incident. Its API log
showed recovery scan finishing in 2.721 s: 38 projects, nine live tracks, one MKV
watcher, four MKV STT workers and seven OBS detailed workers. Application startup
had not completed. Increasing the launcher timeout would not remove a blocking
operation, so its 60-second deadline stays unchanged.

Profiled launches of copied Test_OBS 6/7 metadata, partial copied checkpoint
inventory and then original data did not reproduce the full 60-second failure.
Their health responses succeeded; captured stacks showed an idle Windows event
loop after startup. The first actual production launcher Start, before the fix,
also passed in 4.621 s, API PID 23844. Thus an ordinary successful retry does not
prove the original failure fixed or establish its sole cause.

Ranked candidates: synchronous cold checkpoint scans inside resumed async STT,
repository/media lock waits, and work queued before Uvicorn binds. Inspection
found detailed STT `_read_chunks` synchronously enumerating/reading thousands of
PCM metadata files on the API event loop. Its immutable-prefix cache reduces
later scans, but the first recovery scan still blocks before its first await.

## Reproduction and change

The regression runs real `ObsLiveLinkDetailedStt.process_once` with a persisted,
already-transcribed two-channel checkpoint. A 250 ms read delay per channel models
cold file I/O, and an event-loop heartbeat must run within 150 ms. Before the
repair the heartbeat was delayed 515 ms: 1 failed / 5 passed. After repair the
focused suite passes all six tests. No FFmpeg or recognizer is called by this
scan-only fixture; it preserves frame cursors and publication state.

The initial fixture was incomplete (missing FFmpeg descriptor, then empty PCM),
and those setup failures did not prove the diagnosis. They were corrected;
`test-red.log` contains the actual heartbeat assertion failure and
`test-green.log` the accepted green run.

`ObsLiveLinkDetailedStt.process_once` now awaits
`asyncio.to_thread(self._read_chunks, ...)`. The existing chunk-cache lock and
validation remain intact; only blocking filesystem work leaves the event loop.
No timeout increase, acknowledgement weakening, source audio rewrite, cursor
advance rule or recognition behavior change. Running thread reads may finish
after task cancellation; they only read/cache the immutable prefix.

## Acceptance and boundaries

Actual production `scripts/pro4bro-workloads.ps1 -Action restart` passed with the
fix: API PID 49052 ready in 3.094 s, Studio PID 45636 ready in 2.175 s. Recovery
retained the same 38-project/nine-track/one-watcher/four-MKV/seven-detailed-worker
inventory. Post-restart HTTP: health 200 in 15 ms; 38-project list 200 in 78 ms.
A subsequent full-console launch still timed out (PID 70128, 61.113 s).
A diagnostic full-console launch passed at 3.416 s but later had native access
violation 0xc0000005 in python311.dll (Windows event 1000, PID 71192); periodic
faulthandler was enabled only for that diagnostic run. Correlation does not prove
the dump caused the crash. Its partial stack included MediaIndexStore.read_index
on the event-loop thread. Temporary instrumentation was removed.

Final ordinary full-console launch: console PID 58984, controller 38364,
API 55788, Studio 68868; API readiness 3.108 s, Studio 1.696 s. The user's
runtime is now running at its normal frontend/controller URL, with normal
console ownership.
Temporary profiling API processes were stopped; port 18220 is released.
The final full stack remained running for subsequent console heartbeats; 25
monitor cycles / 75 controller-status, health and project-list requests passed
without failures (`final-monitor.json`).

Frontend 465 tests / 55 files passed in 121.46 s; typecheck and build passed.
The first full backend run included the incomplete test fixture and failed only
that new test (508 others passed). Final corrected backend run: **509 passed**, two deprecation warnings,
197.78 s. No media/model quality is claimed from these
checks. Original project metadata may undergo its normal resume/migration on
legitimate app startup; original audio is preserved.

Ignored evidence: `.scratch/runtime-ready-01/`: `api.py`, `stacks.log`, copied
metadata/immutable PCM links, launcher and HTTP JSON/logs, focused and full test
logs. Copied JSON is independent; only immutable PCM chunks were hardlinked.
An initial broad copy was stopped after it proved unnecessarily expensive;
focused fixtures replaced it. A background Start-Process orchestration command
was rejected by automatic approval; the diagnostic API used an owned terminal
session instead. No confirmation or machine policy change was required.

This repair prevents the demonstrated cold-scan stall, and the actual runtime
now answers normally. No captured stack from the original PID exists, so any
future timeout still needs a live stack capture to identify remaining I/O/lock
waits. Exact next repair is **RUNTIME-READY-01B**, capture the intermittent full-console
startup stall/native failure and prove repeated ordinary launches. This precedes
**LIVELINK-INGEST-18A**, profile
six-source spool/Stop-tail latency; the approximately five-minute archive gap
remains open. This unplanned repair does not consume that queue entry.
