# Work Rounds

This ledger applies the owner's progress-reminder rule. Each invocation performs
one bounded round, verifies it, records what the round means, and stops. The
closing report must always name: completed scope, evidence, remaining gap, why
that gap matters, and the exact next round.

## Queue

| Round | Scope | State | Why it matters |
| --- | --- | --- | --- |
| 03-03A | Voice Model Set persistence and lineage | Complete | Creates a portable, reproducible publication candidate without falsely claiming identity approval. |
| 03-03B | `SpeakerEmbedder` port, adapters, frozen protocol, threshold and reject path | Next | Prevents a usable checkpoint from being published as the wrong speaker. |
| 03-03C | One real manifest-to-checkpoint-to-gated-publish acceptance run | Queued | Proves the local runtime and real model artifacts, not only orchestration tests. |
| GAP-PLAN | Re-plan remaining code gaps from verified repository state | Queued | Turns the plan/reality comparison into ordered implementation rounds. |
| LIC-01 | Audit every borrowed repository at its pinned revision | Queued | Records license, notice/source obligations, model-weight terms, and distribution risk before release. |

## Round 03-03A — 2026-09-22

Completed:

- Added a separate `VoiceModelSet` domain aggregate with member roles, anchor,
  generation family, lifecycle status, timestamps, and reserved gate evidence.
- Persisted one atomic `assets/voice-model-sets/<set-id>/set.json` record using
  project-relative references only.
- Captured manifest ID/hash, engine revision, complete run config, base/model
  identity, segment count, and source run IDs as lineage.
- Connected non-RVC training publication to Model Set creation. A failed set
  write rolls back its new voice; RVC remains standalone by domain decision.
- Added list/get API and web client contracts. Deleting a pending set's only
  voice removes the set; published sets refuse that destructive shortcut.

Evidence:

- Backend suite: 357 passed.
- Focused set/publish contract: 5 passed.
- TypeScript typecheck: passed.
- Every new set stops at `pending-gate`; no code path marks it published.

Still missing:

- `SpeakerEmbedder` and its measured decision protocol (Round 03-03B).
- A real, consented end-to-end publish run (Round 03-03C).
- The code-gap implementation plan and repository/model license audit, both
  queued explicitly above rather than silently folded into this round.
