# LIVELINK-08N-A: Observable retained outbox

Date: 2026-10-04. Parent LIVELINK-08N remains open.

## Delivered

Native aggregate health travels through optional authenticated v3 hello and
heartbeat, validated API snapshots and the OBS recorder panel. It reports
retained/rejected chunks, oldest retained age, worker chunks awaiting disk,
capture memory frames, attached-Track overflow and the last spool failure.
Counts are global across recordings, not attributed to the selected project.
Rejected PCM remains retained. Read failures, missing legacy reports, missing
legacy timestamps and stale disconnected reports remain visibly unknown.

Nullable enqueue timestamps migrate the existing machine-local SQLite database;
all legacy PCM and provenance remain intact. Audio callbacks do not query SQL
or perform HTTP. ACK/delete, FULL/WAL, PCM publication and source media remain
unchanged. Details and clock/overflow limits: ADR 0041.

## Verification

- Release native DLL and both native test executables build successfully.
  CTest: **2/2 passed**, 6.63s. Existing upstream nameless-union warnings remain.
- Native spool tests cover fresh timestamp, reopen, rejected subset, old-schema
  migration with byte-for-byte retained rejected PCM, duplicate-write rollback,
  unavailable storage and actual `SQLITE_FULL` from connection-local
  `max_page_count=4` with a 4MiB insert. No real disk is filled; previous PCM
  survives the failed transaction and the full error is visible.
- Connection regressions **18 passed**; malformed/bool/negative/unsafe-integer
  fields reject with 422 without replacing the last report. Legacy/new process
  clears previous health; disconnect marks stale. HTTP heartbeat/status asserts
  the actual route passes telemetry. That new regression first failed because
  Pydantic discarded the field, then passed after adding optional request fields.
- Full frontend **55 files / 471 passed**, 35.53s, with four workers;
  typecheck and build pass (Vite 282ms).
- First full backend **526 passed**, 159.80s, precedes the final HTTP schema fix.
  Final full backend on the completed source: **526 passed**, 164.38s, two
  existing audioop/Starlette deprecation warnings.
- Real in-app browser fixture on owned port 18235 renders the actual controller
  and product styles with stubbed status/journal responses only. Verified stale,
  unreadable and legacy states; no console errors/warnings. Dark panel foreground
  `rgb(243,240,231)`, background `rgb(21,23,20)`; width 528px has no horizontal
  overflow. Screenshot inspection confirms readable wrapped text. This is UI
  evidence, not a connected OBS recording or production latency test.
- Owned fixture tab and Vite PID 81844 are closed; owner app/OBS untouched.

## Remaining gate / exact next

**LIVELINK-08N-B** implements scoped retry/export with unchanged PCM/provenance
and verifies a longer isolated multi-source API outage, stopped-recording
recovery, simulated storage failure and ACK-only emptying. Until that gate,
08N is not complete and no package/installed plugin update is claimed.
18B/18C optimization and the pending human budget decision remain open.
