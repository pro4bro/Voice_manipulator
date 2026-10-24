# OUTPUT-LIFECYCLE-01 — Shared output recovery and Training Queue

One bounded development round, 2026-10-24. The owner requested visible Training
progress, per-Session/per-Version Export/Delete symbols and recoverable removal
with consistent reusable UI and behavior. ADR0142 and `docs/OUTPUT-LIFECYCLE.md`
record the ownership and reuse contract.

## Delivered

- Queue reconciles Training Run persistence/process liveness and measured stage
  progress before returning task receipts. Stale Done no longer hides running,
  failed, cancelled or interrupted runs. Train400/400 remains96% until the later
  pipeline stages complete. Resumed attempts share one operation/History.
- Voice Output and LipSync Session/Version rows have separate Export/Delete
  icons. Session actions remain available while collapsed. Voice retains WAV,
  subtitle and timing formats alongside Session/Version ZIP packages.
- Delete retains the entire slot state and generated artifacts in a project-owned
  Recycle Bin. Restore preserves IDs and original editing state. Permanent
  deletion and Empty Bin remove only owned products, reject live jobs or retained
  references and roll back staged file moves if metadata cannot be committed.
- Common action types, controls, bin presentation, hierarchy/recovery policy and
  checked artifact export/purge are reusable modules. Media Pool and pending OBS
  footage use the shared bin shell with their existing source-media adapters.
- Removing an active Voice slot clears Script/config/output checkout and refreshes
  ordinary output pickers. Recycled audio is retained for restoration and protected
  from premature clip-cache pruning.

## Verification

| Check | Actual result |
|---|---|
| Full frontend | 159 files /1286 tests passed,189.76s, before the final Export menu and deletion-checkout additions |
| Final feature frontend | 4 files /18 passed, including icon ZIP/WAV actions, Session/Version IDs, restore/purge/empty routing and deleted active checkout |
| Wider integration frontend | 7 files /167 passed,21.14s: shared controls, Voice panel, LipSync, Version hook, WorkspaceShell, MediaPool and Queue model |
| Typecheck/build | Passed after final source changes; Vite226 modules |
| Full backend | 1606 passed,3 existing warnings,878.62s; no failed test or timeout |
| Final backend | 28 passed,2 deprecation warnings,17.04s: lifecycle, Queue, Voice Session and LipSync Session after final backend changes |
| Queue red reproduction | Restoring the old receipt-only implementation makes the live-run-over-stale-Done regression fail: expected running, got complete; production source restored |
| Confirmation mutation | Inverting the shared soft-delete confirmation makes its action test fail; source restored byte-for-byte and tests/build pass |
| HTTP/artifact fixture | Live Training projection0.555 with200/400 steps despite stale complete receipt; actual ZIP has two Voice Versions and byte-identical WAV; delete hides output/clears Script, restore recovers Script and WAV; LipSync delete/restore succeeds |

The backend checks cover restoration before the parent Session, deleting the last
Version, empty bin, independent copies, rollback, source preservation, reference
and active-generation guards, relative ZIP members and packaged rendered output.
LipSync rendered fixture bytes prove ownership/packaging, not real video quality.

Evidence is under ignored `.scratch/output-lifecycle01/` and
`.scratch/output-lifecycle-*.log`. HTTP evidence: `api-evidence.json`,
`session-export.zip` and fixture configuration. Restored WAV SHA256:
`5948cb15bf1960a5d348f78608aaf8f2aa329ba235f1ac9472cda894e01d39cb`.
The isolated HTTP fixture API on port18562 was stopped after verification.

## Review and limits

Reviewed correctness, state transitions, reference ownership, project-relative
paths, Windows file failures, API errors, UI capability boundaries and Queue
write throttling. Final review removed an unused API wrapper, surfaced LipSync
context-export errors, corrected deletion copy and prevented generic LipSync
button CSS from overriding shared symbol controls. No dependency or quality gate
changed.

Live browser inspection was unavailable: the browser tool returned “Local browser
use is disabled in Work settings.” No screenshot or live dark/light UAT is claimed
for this round. Component tests and the real HTTP/ZIP/WAV fixture supply evidence
within that limit. No actual training/model inference, owner runtime restart,
owner project modification or source-media deletion occurred.

Packages include product-owned state/results; immutable reference footage remains
in the original project. Package import and secure erasure are outside this round.
Existing real-model listening and Phase06 quality gates remain open. Phase03
stays60%. Stop this bounded round.
