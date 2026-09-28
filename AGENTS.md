# Agent Guide

## Start in the right checkout

- Run `git rev-parse --show-toplevel` before editing or launching. Work from that
  repository root, derive paths from it, and inspect `git status --short` so
  existing user work remains intact.
- For development work, read `docs/WORK-ROUNDS.md` first for the current round,
  then `docs/PROJECT-STATUS.md`, `.planning/STATE.md`, and `.planning/ROADMAP.md`.
  `docs/SESSION_HANDOFF.md` provides topology; its older progress statements and
  `docs/NEXT_SESSION.md` yield to the current ledgers. Read
  `docs/STABILIZATION-PLAN.md` and `docs/STABILIZATION-LOG.md` when revisiting
  stabilization work or its feedback.
- Complete one bounded development round per invocation, verify it, report the
  evidence and remaining gap, then stop. An explicitly requested instruction or
  configuration change does not advance a product round.

## Product boundaries

- This is a local-first React/TypeScript/Vite UI in `apps/web`, a FastAPI service
  in `services/api`, and PowerShell-managed local runtimes. Use
  `docs/PROJECT-STATUS.md` to distinguish implemented slices from planned work.
- Treat `engines/OmniVoice` as read-only upstream. Product code belongs outside
  `engines/` and reaches engines through product-owned adapters. Never report a
  processor as successful before its required artifact exists.
- Follow `docs/PORTABILITY.md`: persistent project paths are relative to the
  folder containing `project.json`; project assets stay with that folder. Move
  and reconnect projects through Open Existing. Keep runtime, base-model, and
  cache folders out of Git while preserving project-owned media and adapters.
- Preserve source media; create analysis/processing WAVs deliberately and retain
  source-to-derivative provenance. Check sample rate, channels, format, timing,
  clipping, and boundary transitions for affected audio operations.

## Lead and Worker

- The Lead owns requirements, architecture, round scope, delegation, integration,
  diff and test review, artifact checks, and the final report. The project sets
  no Lead reasoning effort; the user controls it through the session. Explicit
  session model selections can override the project model default.
- Delegate only bounded work that benefits from a separate Worker. Give each
  Worker the objective, round, relevant context, file ownership, constraints,
  acceptance criteria, validation, and expected report. Keep overlapping edits,
  dependent steps, and shared GPU/runtime state serial. Reuse a relevant Worker
  thread for the same scope and effort; choose an appropriate fresh instance when
  a different effort is needed and the client cannot change it in place.
- The Worker inspects relevant files, stays within its assignment, runs relevant
  checks, and reports changed files, commands, artifacts, failures, and open
  concerns. Escalate architecture, public API, persistent-format, or product
  decisions, ownership conflicts, and any need to broaden the round to the Lead.
- The Lead chooses Luna Worker effort per task: `high` is the default; `medium`
  suits bounded investigations, `xhigh` difficult integration, and `max` only
  exceptional risk. Improve task scope and context before merely raising effort.

## Validation and project references

- Run relevant frontend checks from `apps/web`: `npm test`, `npm run typecheck`,
  and `npm run build`. Run backend checks with an available project Python
  interpreter and `-m pytest services/api/tests -q` from the repository root;
  development `.venv` and portable `.runtime/python` serve different purposes.
  Report actual output and validate real media/model artifacts when tests alone
  cannot prove quality.
- Read `CONTEXT.md` before naming domain types; record durable decisions under
  `docs/adr/`. See `docs/agents/domain.md` for domain documentation and
  `docs/agents/issue-tracker.md` for local `.scratch/` issues.
