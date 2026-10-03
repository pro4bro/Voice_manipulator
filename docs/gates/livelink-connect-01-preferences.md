# LiveLink connection recovery

## LIVELINK-CONNECT-01 — Preferences transport recovery (2026-10-04)

Owner reported Failed to fetch and native Disconnected. On inspection both API
and controller proxy answered installation/status requests normally, but OBS
was closed. Opened installed OBS through the existing API action; its real
hello/heartbeats returned 200 and connection became connected. Pairing remained
valid; no token reset, binary update or source media mutation was necessary.
The original outage trigger was not captured and is not attributed to pairing.

Preferences had a reproducible separate defect: an initial transport rejection
left its checking/error state indefinitely. It now retries only status GETs
every three seconds after fetch TypeError, clears errors on recovery, cancels
retries on unmount and suspends them during manual actions. Install/Repair are
never automatically repeated after an uncertain result. Removed obsolete text
claiming native Tools integration was still planned.

Regression baseline: 2 failed / 3 passed. Fixed: 5 passed. Full frontend 468
passed / 55 files; typecheck/build pass. Portable backend installation/connection
suite: 17 passed. Browser at the controller URL shows Preferences installation
status, actual OBS path and running state without Failed to fetch. Test_OBS 7
mixer shows Connected and six currently available source rows; API inventory
also retains missing source identities (22 total), not 22 currently active rows.

Installed binary differs from the current package but connects correctly; an
update requires OBS closed and is not claimed performed. API startup/native
failure acceptance and sustained capture/STT quality remain open. Exact next:
LIVELINK-INGEST-18A, profile six-source spool and Stop tail.

