# RUNTIME-VOICE-01 — Bundled Voice Changer worker import

Date: 2026-10-03. Baseline `2fa1e1e`, branch
`feat/03-04-high-quality-training`; starting working tree clean.
Status: Complete for worker sibling imports and harmless protocol acceptance.
Exact next: **LIVELINK-INGEST-18A**, profile six-source spool/Stop tail.

## Reproduction and diagnosis

`.runtime/python/core/python.exe .scratch/runtime-voice-01/probe.py` exercised
EngineWorkerProcess with actual `.runtime/python/voice-changer/python.exe`, the
product worker script, empty PYTHONPATH, devices then idle status. Before repair
it failed in seconds with `ModuleNotFoundError: No module named 'voice_stream'`;
`red.log` retains the original traceback. No audio stream was opened.

The pre-fix regression at the same child-process seam failed (11 other tests
passed). It changes cwd to a temporary directory and supplies an irrelevant
PYTHONPATH. Ranked causes were embedded interpreter isolation, missing sibling
files, and cwd/environment dependency. `voice_stream.py` was present. Actual
Python reported isolated=1 with `_pth` search paths limited to its runtime,
product API root and site-packages. PYTHONPATH did not repair the import; adding
the explicit sibling directory did. The script folder was absent from sys.path.

## Repair

`voice_changer_worker.py` adds `Path(__file__).resolve().parent` before importing
its product-owned siblings. This also permits the lazy sibling `rvc_live` import.
The same pattern already exists in `omnivoice_epoch_size.py`. No global runtime
path configuration, EngineWorkerProcess protocol, domain type, API, source audio,
model, engine checkout or project format changed.

## Validation

| Check | Actual result |
| --- | --- |
| Focused Voice Changer tests before fix | 1 failed / 11 passed, 2.60 s; exact sibling ModuleNotFoundError |
| Focused tests after fix | 12 passed; final isolated APPDATA run 2.23 s |
| Original real-worker probe | 66 devices, `ok=true`, idle status |
| Missing named-device request | `ok=false`, localized ValueError; status stays idle; resolution rejects before stream construction |
| Copied runtime / source subset | Independent copy under `.scratch/runtime-voice-01/Moved Bundle`, foreign cwd, empty PYTHONPATH, isolated empty APPDATA; 66 devices and idle/missing-device replies passed |
| Copied import origins | All interpreter paths within moved root; numpy/sounddevice loaded from copied site-packages |
| Actual RVC runtime, same worker | 66 devices and idle status; no RVC model loaded or conversion started |
| Full API tests | 508 passed, 2 deprecation warnings, 161.57 s |
| Frontend tests | 465 passed / 55 files, 117.64 s |
| Frontend typecheck and build | Both passed |
| `scripts/test-portable-runtime.ps1 -Profile All` | 24 passed / 0 failed on current checkout |
| Diff review/hygiene | Worker bootstrap is the only product seam; git diff --check passed |

After full suites, the test fixture was narrowed further to isolated APPDATA
and a redundant import removed; the focused 12-test suite was rerun. Existing
warnings concern Starlette/httpx and Python audioop deprecation.

## Evidence and boundaries

Ignored `.scratch/runtime-voice-01/`: `probe.py`, `red.log`, `green.log`,
`test-red.log`, `test-green.log`, `moved-probe.py`, `moved-result.json`,
`moved-files.json`, `moved-sys-path.json`, `rvc-protocol.json`, `backend.log`,
`frontend.log`, `typecheck.log`, `build.log`, `portability.json`, `portability.log`.
The copied runtime is a real independent file copy, not symlinks into the source;
its `_pth` file is unmodified. It includes only this runtime and three sibling
worker files; it is not a moved full application release.

A first extra path assertion found the host's user-site directory appended by
`import site`. The accepted moved probe uses empty APPDATA, with all paths and
required dependency origins checked. Runtime-wide user-site policy was not
changed. This round proves the worker does not need that host directory, another
checkout or developer PYTHONPATH; it does not certify global import hardening.

All probes shut down their own workers. No input/output audio stream, model
inference, project media or OBS runtime was started. Enumerated devices are the
actual Windows host inventory, not conversion-quality evidence. Live RVC model
loading, microphone/virtual-cable latency, six-source ingestion and final
clean-machine acceptance remain separate gates. Next 18A matters because the
measured six-source backlog and approximately five-minute Stop tail remain.
