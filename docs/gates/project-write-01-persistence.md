# PROJECT-WRITE-01 — Windows project persistence

Date: 2026-10-03. Checkout baseline: `3c31fd0`,
`feat/03-04-high-quality-training`; starting tree clean.
Status: Complete for the single-API repository transaction seam.
Next: **RUNTIME-VOICE-01**.

## Reproduction and causes

Owned Windows metadata fixture only; no original media/model artifacts edited.
Before repair, eight synchronized workers alternated reopen and last-page writes
(30 iterations each). Seven workers failed with Windows file-access
PermissionError; raw evidence: `.scratch/project-write-01/before-stress.json`.

Three regressions failed before implementation (10 existing tests passed):
shared staging payload overwritten, stale reopen losing a concurrent page change,
and temporary-file residue after failed replace. `red.log` preserves this run.
The forced staging barrier checks each writer's own payload before replacement;
the stale-snapshot test pauses reopen while another repository instance saves.

The fixed `.json.tmp` path was a proven writer collision. Missing transaction
serialization separately lost a newer page update. A real Windows open reader
also denied replacement; its dedicated regression proves bounded recovery after
handle release. This does not prove an external reader caused the older
UI-CONTRAST log failures.

## Repair

`file_project_repository.py` shares a reentrant lock between instances with the
same resolved registry root, covering public read/mutate calls and migrations,
manifest/locator writes, forgotten state and activity. Atomic writes use unique
same-directory staging files, flush/fsync/close before replacement and cleanup.
Windows errors 5/32/33 get six attempts and 310 ms total backoff; persistent
failure propagates and retains the old JSON. ADR 0040 records the guarantee.

## Evidence

| Check | Result |
| --- | --- |
| Repository tests, actual bundled core Python on Windows | 16 passed in 5.79 s; includes real locked reader, bounded permanent denial and six concurrent repository instances |
| Full backend: `-m pytest services/api/tests -q` | 507 passed, 2 deprecation warnings, 171.29 s |
| Frontend: `npm test -- --maxWorkers=1` | 465 passed / 55 files, 116.90 s |
| `npm run typecheck`, `npm run build` | Both passed |
| Concurrent actual HTTP mutations | Eight workers x 80 requests = 640/640 HTTP 200; reopen and page changes against one owned project |
| Running browser | 80 rapid page changes during stress phases plus two final navigation clicks; no console errors before restart |
| Fresh API / browser reopen | API PID changed from 28872 to 69140; exact saved metadata retained; browser returned to Voice Manipulator / Voice Output |
| Copied project | Open Existing API reopened a copy under `Moved/`; language `vi`, purpose `course`, page retained; original locator restored afterward |
| JSON / portability | Manifest location/projectPath `.`, relative registry locator resolves correctly, zero staging residues or project write errors |

Ignored evidence namespace: `.scratch/project-write-01/`: `http-stress.py`,
`http-stress.json`, `before-restart.json`, `after-restart.json`, `reopened.png`,
`green.log`, `backend.log`, `frontend.log`, `typecheck.log`, `build.log`, managed
runtime action snapshots and logs. Runtime/controller tests use ports
18219/18220/18281 and their own data/APPDATA. Owner projects/listeners untouched.

### Harness failures retained

The initial HTTP harness sent `page` in JSON instead of the endpoint's query
parameter and received 422. It was corrected; the 640-request accepted run uses
query parameters. Those rejected requests are excluded from the accepted count.

The first managed restart timed out in API readiness after 60 s; the controller
stopped its workloads. `failed-restart-readiness.log` and
`failed-restart-api.err.log` preserve evidence. A subsequent managed Start passed
in 15.812 s, launched a fresh API, and the metadata/copy/browser gate passed.
The timeout's cause is unconfirmed; runtime readiness is not claimed repaired
by this persistence round. Initial PowerShell harness launch needed process-only
ExecutionPolicy Bypass; no machine policy was changed.

## Remaining boundaries

Serialization covers one API process and one registry namespace. Two processes
or two registries writing the same project are not serialized. Individual JSON
replacement is atomic; the manifest and locator are not a crash-atomic pair.
Permanent external locks/ACL denial still report failure. Source media,
transcription accuracy, spool latency and final physical OBS acceptance are
outside this round. RUNTIME-VOICE-01 next diagnoses bundled worker import and
proves actual protocol replies; Voice Changer enumeration remains blocked.
