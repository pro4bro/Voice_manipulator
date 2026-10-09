# USER-FEEDBACK-08 — controller readiness and startup evidence

2026-10-09. Baselineadaecc4, branch `feat/03-04-high-quality-training`.
One bounded startup round; ADR0055 records the contract.

## Original evidence and attribution limits

Readiness log: PID25916 waited at04:30:08.918 UTC and timed out at04:31:09.740,
elapsed61.450 seconds, process alive, listener absent, probe WebException. It had
exited before inspection. The owner retried: PID48216 passed controller readiness
at04:39:28.474, elapsed8.196 seconds; Studio75816 passed in11.746 seconds. Those
processes also exited before the repair launched any normal service. That retry
overwrote controller output, so there is no surviving original Python stack.
Earlier PCM checkpoint/API recovery memories are context, not this root cause.

Three isolated portable-core controller boots before repair all passed in13.000,
2.250 and1.907 seconds. This did not reproduce the natural timeout. Inspecting the
installed HTTPX path identified default CA loading/proxy discovery before binding.
A real-Uvicorn fixture then stalled `ssl.create_default_context`, reproducing
pre-listener health timeout; another fixture with missing SSL_CERT_FILE failed
startup. The pre-import diagnostic test failed to capture its injected slow HTTPX
import. All three tests failed before implementation. The initial socket fixture
also needed a cleanup/timing correction: warm Uvicorn config and fence its actual
client-creation phase; release delayed reads and join the server before closing
the socket. This isolates the specific blocker rather than measuring unrelated
cold protocol imports.

## Delivered

Controller upstream/observer clients use only fixed HTTP loopback destinations,
ignore environment proxies and avoid certificate loads. Tests verify actual bind/
health without certificate reads, and a real backend HTTP round trip with invalid
CA/proxy environment. External HTTPS behavior is untouched. No deadline increase.

The original CLI arms StartupDiagnostics before HTTP/FastAPI/Pydantic imports.
Boot/import completion rows carry PID and elapsed time; bounded stack snapshots
at15/30/45 seconds omit locals/source. Uvicorn bind cancels the watcher. An injected
slow dependency import now records its exact waiting frame. Original launcher
identity, port ownership and lifecycle APIs remain.

All three launch boundaries copy nonempty previous stdout/stderr into unique
UTC/GUID files in startup-history before truncation. Worker red/green PowerShell
tests check spaces/non-ASCII paths, contents, retry uniqueness, missing/empty files
and a blocked archive destination without disrupting launch. Existing packaging
already includes the readiness helper in copy/required-file lists.

## Isolated and storage evidence

Post-repair portable-core boots passed in4.750/1.157/1.141 seconds. Cache/system
conditions differ; this is not a claimed percentage improvement or cold budget.
The real CLI code path also bound/responded in1.156 seconds with boot/import/bind
markers and no false startup-stall. Observer output was redirected to scratch;
no lifecycle/model actions were dispatched. A first runpy harness omitted
alter_sys and produced an artificial __main__ forward-reference observer error;
the corrected harness uses alter_sys=True and retains a clean2.2-second observation.

During the first full API run, Get-PSDrive reported C: free0 bytes. Tests could
not create tmp_path directories:184 passed/503 setup errors,172.95s. The only
retained recent fixture files were495/73 bytes, so the agent deleted nothing.
Later C: independently had85,192,183,808 free bytes (native logical-disk inventory).
Neither the space change nor the historical timeout is attributed to an agent
cleanup. Final validation uses process-local TMP/TEMP and fresh pytest basetemp
under ignored `.scratch/user-feedback-08/` on E. No system environment setting
or user file was changed to achieve that.

Evidence: `.scratch/user-feedback-08/baseline-startup-evidence.json`,
`startup-evidence.json`, `probe-controller-start.py`, `probe-cli-start.py`,
`cli-startup-evidence.json`, copied controller logs and `api-validation-on-e.log`.

## Validation

Focused controller/startup regressions3/3 pass. Worker launcher/readiness5/5 pass;
one earlier existing2-second probe was flaky under concurrent load and passed the
standalone/final Worker run. Final integrated API on E: **687 passed**, two existing
Starlette/httpx and audioop warnings,389.88s. `git diff --check` passes. Frontend
source is unchanged; USER-FEEDBACK-07's639/73/typecheck/build results are carried,
not rerun or claimed as new UI evidence.

After tests, verified18119/18120/18081 had no listeners and launched the actual
`scripts/pro4bro-console.ps1 -Command start` in its own hidden managed console.
No existing runtime was stopped. Normal console PID12912, controller71448,
Studio82792, API73256 remain running for the owner. Actual readiness rows:
controller1.897s, Studio4.354s, API11.393s; all passed existing deadlines.
Controller imports-complete0.766s, boot/bind markers retained; all three direct
health endpoints return status=ok. `/api/runtime/status` overall/api/studio are
running, busy=false, lastError=null. Logs retain normal frontend bundle/project
requests, but no browser automation/visual acceptance is claimed.

Real startup-history contains previous controller stdout/stderr and Studio logs
with unique UTC/GUID names, proving integration at the actual launch boundaries.
Old API logs were empty and correctly skipped. Actual evidence:
`.scratch/user-feedback-08/normal-start-evidence.json`, normal-console stdout/
stderr, `data/logs/pro4bro-readiness.log` and the startup-history folder. Startup
uses ordinary project recovery behavior; no inference action was manually
dispatched. Fixture controllers were terminated; normal owner stack is left up.

## Remaining gap and exact next round

The natural PID25916 timeout has no surviving stack, so its exact cause is not
declared proven. Exact next **RUNTIME-READINESS-DEVICE-01**: normal idle/cold start
cycles with retained phase/stack/listener evidence under the existing deadlines;
if a stall recurs, diagnose that captured frame. UX-EDITING-DEVICE-01 OBS Stop/
waveform/playback and editing/scroll checks resume afterward. STT word-truth and
other existing physical/acoustic/LAN gates remain. Phase03 stays60%; upstream,
portable project schema and source media are unchanged.
