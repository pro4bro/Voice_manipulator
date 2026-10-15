# VM-REF-RANDOM-01 — frozen schedule gate

## Scope and frozen budgets

This round persists reproducible, project-owned random reference schedules for
timed bindings. The planner accepts an explicit integer seed and the two
independent flags `randomValues` and `randomTimes`. A new seed is used only when
the caller explicitly previews/applies that seed. Reads and project reopen load
the recorded events and check stored fingerprints without regenerating events.

The acceptance budgets for this planner are:

- Every event has a positive interval of at least **0.25 seconds**.
- Events cover the full target interval without gaps, overlaps, or zero-length
spans; at most **32 events** are emitted per binding schedule.
- Apply requires an exact preview key and expected document revision. Source,
  binding, Script-lock, and active timeline changes mark the saved schedule stale
  or reject apply.
- A voice edit that overlaps the assigned target interval requires reassignment;
  non-overlapping prior edits map the target through the active edit journal.
- Timed target duration must be at least 0.25 seconds. Untimed Script references
  receive an explicit conflict; no event times are guessed.

There is no latency budget for actual synthesis in this round: no reference
conditioning processor is connected. Every event reports `applied: false` and
an unsupported capability blocker. A schedule is a frozen planning artifact,
not evidence that emotion, delivery, timing, or other audio properties changed.

## Evidence

`.venv/Scripts/python.exe -m pytest services/api/tests/test_reference_schedule.py -q` passed
4/4. The adjacent regression run
`.venv/Scripts/python.exe -m pytest services/api/tests/test_reference_schedule.py services/api/tests/test_reference_bindings.py services/api/tests/test_voice_edits.py -q`
passed 22/22. Coverage includes all four flag combinations, deterministic
replay, exact target coverage, unrelated-binding independence, project
relocation/reopen, optimistic revision, inherited Script locks, source
staleness, and changed-target edit conflicts.

The standalone `ReferenceScheduleEditor` UI component passed its focused
frontend suite (5/5) and `npm run typecheck`. It restores the saved seed/flags
and event snapshot without auto-preview, requires explicit Preview before Apply,
shows unsupported conditioning blockers, and ignores late preview responses
after input changes. No live API or browser UAT is claimed for this component.

## Remaining gate

This round delivers the planner, preview/apply persistence boundary, freshness
checks, event integrity and the editor integrated into expanded Reference Detail.
Final schedule tests7 pass, including real production-app route registration
and HTTP preview/apply/read/stale409; affected Reference Detail/editor UI7 pass.
Earlier standalone5/5 evidence above is historical. Incremental Fix Voice Generated
integration, actual conditioned audio, and human listening evidence remain open.
These are required before presenting any schedule as applied audio.
