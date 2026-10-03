# LIVELINK-STT-12K — runtime readiness and retained failure evidence

Date: 2026-10-03. Source baseline: `52032ef`.

## Verdict and boundary

Readiness repair, diagnostic logging and controlled recovery gates pass.
**The historical natural cold-start listener-loss gate remains open.** Five
isolated cold cycles did not reproduce it. This is not evidence that the
original trigger was fixed; no owner project registry or recovery backlog was
loaded, and no new OBS audio/artifact acceptance is claimed in this round.

## Feedback loop and finding

Agent-runnable loop:

```powershell
.runtime/python/core/python.exe .scratch/livelink-stt-12k/cold_start.py --cycles 5
```

The loop starts product API (`-m app`), Studio (`-m studio_app.server`) and the
controller with isolated machine-local data/session paths. It records child
exit status, direct API/Studio/controller HTTP, the controller proxy/status,
and listener ownership from both product native TCP inventory and independent
`netstat`. Every service must remain healthy for 15 seconds after readiness.

- First harness attempt used the nonexistent Studio `/api/health` route and
  got 404. That is retained as a harness error, not a product listener loss.
- With the actual old `/api/status` route and a 0.6-second HTTP budget, cycle 1
  captured `ReadTimeout` for Studio. All three processes were alive; both TCP
  inventories agreed the listeners were present. API, controller and proxy
  returned 200, and controller ownership status remained `running`.
- With a five-second request budget, five cycles passed. The first Studio
  status request in cycles 1–4 took 3.594, 2.703, 2.672 and 2.812 seconds.
  Studio status initializes Torch/CUDA through `_resolve_device`.
- Ranked hypotheses compared status work, background startup, real process exit
  and inventory misclassification. The measured status delay supports the first
  for this reproduced timeout. It does not explain the earlier natural loss.
- `test_health.py` failed twice with 404 before the dedicated health route was
  added. The new tests prevent device/model initialization from entering health
  and preserve a failed model-load state rather than masking it as success.

## Repair and diagnostics

Studio's asynchronous health is independent of device/model initialization.
Launcher health waits now fail explicitly on child exit, retain the exit code,
require a valid health payload, and use elapsed deadlines. Controller startup
uses the same helper. The launcher registers PIDs before health waits so a
managed child awaiting readiness is distinguishable from a foreign listener.
The existing session record is replaced atomically and removed on rollback.

`data/logs/pro4bro-readiness.log` retains startup evidence. Structured
`runtime-observation` entries in `pro4bro-runtime-actions.log` retain unexpected
changes with expected PID, process life, listener PID, ownership and health.
The observer has a 0.75-second HTTP timeout, probes only managed listeners and
logs changed snapshots rather than every poll. ADR 0036 records the contracts.

## Controlled launch and recovery replay

```powershell
.runtime/python/core/python.exe .scratch/livelink-stt-12k/managed_recovery.py
.runtime/python/core/python.exe .scratch/livelink-stt-12k/analyze.py
```

The replay uses the product workload script/helper with only repository/data
paths redirected to the test directory. Product Studio source is synchronized
to its ignored runtime through the normal launcher. Controller recovery calls
the same `/api/runtime/actions` endpoint used by Windows → Restart all.

Final successful run:

- Cold startup succeeds. During a concurrent `/api/status` device initialization
  lasting 3.062 seconds, health continues returning 200; the slowest measured
  health response is 0.110 seconds.
- Deliberately terminate the verified test API PID 38164. The observer records
  absent listener and dead expected PID. Restart recovers API PID 33456, with
  26.068 seconds from the loss snapshot to the ready snapshot, including a
  three-second deliberate diagnostic hold and orchestration/probe time.
- Deliberately terminate test Studio PID 41104. Its listener/process loss is
  retained separately. Restart recovers Studio PID 51324 in 22.167 seconds
  measured on the same basis.
- Controller PID 53388 remains unchanged in all 37 snapshots. Each recovery is
  followed by 10 stable samples. The final observer log contains 16 transitions,
  including live children before listener creation, dead children after the
  injected exits, and the recovered healthy services. No automatic restart is
  inferred; these are explicitly requested recovery actions.
- Cleanup stops all test workloads/controller, removes the isolated session,
  and leaves ports 18119/18120/18081 free. Owner registry/media, OBS configuration
  and plugin installation are untouched.

Earlier replay harness attempts are retained separately: capturing a launcher
through inherited output pipes prevented `communicate` completion even after
PowerShell exited; direct log files fixed that harness boundary. Shell-based
failure injection also did not reliably assert process termination; the final
replay terminates the verified PID directly and waits for both process exit and
port release before asserting recovery. Neither is counted as a natural loss.

## Validation and retained evidence

Backend: 500 passed in 195.91 seconds (two existing warnings). Studio: 16 passed
in 1.11 seconds (Starlette/audioop deprecation warnings). Frontend: 54 files,
458 tests in 59.59 seconds. Typecheck, production build and diff check passed.
Focused checks cover real PowerShell/HTTP retries, invalid health, process exit
code 7, live-process readiness deadline, observer timeout versus missing port,
foreign-port isolation, changed-state deduplication, and Studio health without
Torch/model work. Frontend runtime contracts remain compatible.

Ignored `.scratch/livelink-stt-12k` retains `samples.json`, timeout/harness
snapshots, service stdout/stderr, `managed-samples.json`, `managed-actions.json`,
`managed-report.json`, `acceptance.json`, cleanup and portable Core reports, and
the isolated diagnostic logs. The manifest includes/hashes the readiness helper;
the local Core profile passes six checks. A new full portable bundle is not
claimed built or tested by this round.

## Remaining gap and exact next round

`LIVELINK-STT-12L`: replay cold startup against an isolated copy of the persisted
recovery backlog and compare foreground/detached launch topology using the new
PID/listener/health evidence. The empty-data cycles cannot explain the 12F owner
registry recovery path. The natural disk-stall cause, owner plugin installation,
workspace selection/Script follow through reconnect and wider LIVELINK-08
source/UI/portability gates remain separate open work.
