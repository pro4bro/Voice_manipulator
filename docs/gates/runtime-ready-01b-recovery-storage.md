# RUNTIME-READY-01B — Recovery storage waits and startup evidence

Date: 2026-10-04. Checkout baseline: `5471f2b`; working tree initially clean.

## Result and boundary

Implemented a demonstrated recovery/storage stall repair and bounded startup
diagnostics. Repeated ordinary full-console launches pass. The historical
60-second timeout and Python access violation did **not** recur naturally in
this round, so their complete cause is still unconfirmed. In particular, no
evidence attributes that native crash to WinAPI, checkpoint scanning, or
faulthandler. Native-crash acceptance remains open.

## Red-capable reproduction

`services/api/tests/test_runtime_recovery_readiness.py` creates a portable
project, persisted MKV follow/STT checkpoints and a selected track, then starts
real Uvicorn on an owned socket. Discovery schedules the actual resumed MKV STT
worker. Independently hold its project lookup, checkpoint read, or actual
Media Library lock after discovery finishes. While that read remains blocked,
the server must bind and return JSON `status=ok` from `/api/health` within 500 ms.
The test releases the wait in `finally`, stops its server and checks checkpoint
bytes are unchanged. It does not require a recognizer or pretend to certify
speech/audio quality.

Command: `.venv/Scripts/python.exe -m pytest services/api/tests/test_runtime_recovery_readiness.py -q`.

With both product files restored temporarily to baseline, **3 failed** in
4.61 s: the API could not bind/respond while each storage read was stalled.
With the repair, **3 passed** in 3.11 s. This reproduces the owner's process-
alive/no-listener shape at a controlled storage seam; it is not a captured
stack or explanation of the historical natural incident.

## Repair

- Resolve projects with `await asyncio.to_thread(projects.get, ...)` in MKV
  watcher, MKV STT and OBS detailed STT worker loops. Previously the project
  lookup was evaluated on the event loop, including as an argument to
  `to_thread(growing_mkv.poll, projects.get(...), ...)`.
- Move MKV STT checkpoint loads and selected/active track reads into threads.
  Retain the coroutine lock, existing library/repository locks, durable result-
  before-cursor order and processing semantics. Cancellation cannot stop an
  already running thread read; the existing serialized repository/library
  operations finish under their own locks.
- The production `python -m app` entrypoint configures the existing timestamped
  logging once, then attaches `StartupDiagnostics` before running Uvicorn.
  Unless Uvicorn logs listener binding or terminal startup failure, emit up to
  three `[startup-stall]` Python stack samples at 15/30/45 seconds to the API
  error log. Lifespan completion alone does not suppress these samples because
  the known incident occurs between recovery and listener readiness.
- Sampling uses `sys._current_frames()` from an ordinary Python thread. It
  records frame filenames, line numbers and function names, excludes locals
  and source text, caps frame depth and releases frame references. There is no
  native faulthandler timer or signal-based interruption. This supplies future
  stall evidence; it cannot recover a process or guarantee capture of a native
  crash that exits before the sampling deadline.

Readiness deadlines remain API 60 / controller 30 / Studio 150 seconds. There
is no change to source PCM, audio processing, checkpoint schema or engine code.
Discovery and some later publication I/O are still synchronous; an arbitrary
disk/lock stall is not claimed impossible.

## Ordinary full-console evidence

Same original 38-project catalog and recovery state throughout: 9 live tracks,
1 MKV watcher, 4 MKV STT workers and 7 OBS detailed workers scheduled.
Each launch uses `scripts/pro4bro-console.ps1 -Command start` in its own hidden
PowerShell console, with the real job object, controller, workload launcher,
Studio and API. Stops use the ordinary full-stack stop command. No diagnostic
wrapper, alternate data root or faulthandler was used.

Initial baseline API PID 74432 was ready in 6.832 s. Four more baseline launches
all passed:

| API PID | Readiness seconds |
| --- | --- |
| 19484 | 2.998 |
| 46972 | 3.412 |
| 74964 | 3.397 |
| 67028 | 3.857 |

Four launches after the storage repair all passed:

| API PID | Readiness seconds |
| --- | --- |
| 69544 | 5.023 |
| 66912 | 3.309 |
| 66776 | 3.390 |
| 70496 | 3.341 |

Each repaired launch passed 12 cycles of controller status, JSON API health
and project-catalog GETs: **144 successful HTTP checks**. Baseline probe logging
included `/health`, which serves the SPA fallback; it is only HTTP-response
evidence. The launcher's baseline readiness records still used the correct
`/api/health`. The repaired harness checks the correct health JSON. These warm
retries do not establish a speedup or prove the intermittent failure cured.

Two more full-console launches with the final entrypoint/diagnostics code:
API **15404 / 70644**, readiness **3.184 / 3.280 s**, **72 HTTP checks** pass.
Neither emits a spurious `[startup-stall]` after listener binding. Final
controller **28996**, Studio **73836**, console **67660** remain running.
The final stack passes **90 additional HTTP checks over 63.750 s**, validating
controller `overall=running`, API JSON `status=ok`, and the 38-project catalog.
Maximum observed request time is **109 ms**. Test_OBS 7's media read returns
three assets in **16 ms**; Test_OBS 6 returns its existing empty list. These
reads do not establish restored/deleted footage or STT quality.

Totals after storage repair: **six ordinary full-console starts**, **306
successful HTTP checks** (144 + 72 + 90). The two final starts include the
new diagnostic entrypoint. The original natural failure did not recur.

## Verification

- Initial full backend: **512 passed**, 175.33 s.
- Portable core Python: **23 passed**, 75.47 s, covering the real Uvicorn
  regression, generated two-track MKV/PCM/STT checkpoint fixtures and OBS
  detailed STT regressions; no skips.
- Diagnostics plus storage readiness: **7 passed**, 3.06 s. Tests verify a
  bounded Python wait stack, binding/failure cancellation, observer teardown
  and continued observation after lifespan completion.
- Portable core diagnostics: **4 passed**, 0.11 s.
- Frontend: **465 passed / 55 files**, 53.86 s. Typecheck and build pass.
- Final full backend with diagnostics: **516 passed**, 155.18 s; two existing deprecation warnings.

Ignored local evidence: `.scratch/runtime-ready-01b/`: red/green test logs,
backend/frontend/typecheck/build and portable logs, full-console logs and
`readiness-summary.json`. The repeat harness leaves the final stack running.

## Remaining acceptance and exact next round

The demonstrated storage seam is repaired. Future natural timeout evidence
must include `[startup-stall]` frames, readiness/PID records and recovery rows;
native exit needs its matching Windows crash evidence. A successful unit test
or warm restart does not close the historical native-failure gate.

Resume **LIVELINK-INGEST-18A**, profile six-source spool and Stop-tail latency,
carrying the runtime gate into that sustained workload. An observed new stall
or native exit becomes a bounded runtime repair based on the new evidence;
repeating already-green warm launches alone is not another acceptance claim.
