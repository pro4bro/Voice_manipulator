# USER-FEEDBACK-23 — API readiness during project recovery

Date: 2026-10-12

## Symptom and cause

The source launcher reported `Pro4Bro API readiness timed out after 60 seconds`
with PID 45496 alive. Its readiness log recorded port 18120 without a listener
at 61.067 seconds. The API log recorded Uvicorn starting at 08:09:58 and
completing application startup at 08:10:39. The recovery scan spent 41.657
seconds reading 23 projects before the lifespan yielded, so Uvicorn could not
bind and serve `/api/health` within the launcher's deadline. The process had
not crashed.

## Change

The API starts the existing project/OBS recovery scan as a lifespan-owned task.
Fast recovery gets up to one second to finish before the listener opens; a slow
scan continues after health becomes available. Completion and exceptions remain
in the API log. Shutdown cancels and joins the scan before closing resumed
workers. Checkpoint ownership and queue reconciliation logic are unchanged.
ADR 0068 records the readiness contract.

## Verification

- A deliberately blocked project-list scan reproduced the old timeout in the
  regression before the fix. After the fix, a real Uvicorn listener answered
  `/api/health` with `status=ok` while the scan was still blocked; the scan
  completed after storage was released.
- Focused LiveLink/MKV/launcher/readiness checks: 52 passed, 2 warnings.
- The first full backend run found 5 races in tests that expect quick project
  recovery before startup returns. A one-second fast-path wait addressed these;
  the affected 11 tests passed, and the final full backend run passed 742 tests
  with 2 pre-existing deprecation warnings in 212.85 seconds.
- `git diff --check` passed. Frontend tests were not run because this round
  changes only the API lifespan and its backend test/docs.

## Limit and next round

The regression proves the HTTP listener can answer during slow recovery and
the backend suite remains green. It does not reproduce the owner's exact 23
project filesystem state under a fresh launcher run: ports 18119, 18081 and
18120 were held by a separately running portable bundle and were left intact.
The existing portable folder was built before this source change. Restart the
source launcher and confirm the API readiness line reaches `state=ready`, then
wait for `Runtime recovery scan finished` in the API output before evaluating
restored processing states. Rebuild the portable bundle before testing this
fix from that bundle. The next planned feature round remains
STT-TIMING-ACCURACY-01 after the owner supplies the Conviction reference.
