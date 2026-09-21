# Work Rounds

This ledger applies the owner's progress-reminder rule. Each invocation performs
one bounded round, verifies it, records what the round means, and stops. The
closing report must always name: completed scope, evidence, remaining gap, why
that gap matters, and the exact next round.

## Queue

| Round | Scope | State | Why it matters |
| --- | --- | --- | --- |
| 03-03A | Voice Model Set persistence and lineage | Complete | Creates a portable, reproducible publication candidate without falsely claiming identity approval. |
| 03-03B | `SpeakerEmbedder` port, adapters, frozen protocol, threshold and reject path | Complete | Prevents a usable checkpoint from being published as the wrong speaker. |
| 03-03C | Calibrate the chosen backend and run one real manifest-to-checkpoint-to-gated-publish acceptance | Next | Proves the local runtime, identity operating point, and real model artifacts rather than only orchestration tests. |
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

## Round 03-03B — 2026-09-22

Completed:

- Added the `SpeakerEmbedder` port and two subprocess adapters: cached
  Community-1 embedding and separately installable WeSpeaker ResNet34-LM.
- Froze protocol v1: 16-bit PCM, mono 16 kHz, minimum 3 seconds, whole-window
  embedding, cosine similarity, and all-members-must-pass.
- Added project-safe gate inputs using Voice Output IDs rather than caller-owned
  paths; output-to-voice lineage must match exactly.
- Persisted model revision, threshold/calibration state, scores, candidate IDs,
  and decision reason; low scores reject, calibrated passes publish, and high
  scores under an unmeasured threshold remain pending.
- Added machine-local backend preference, discovery API, gate API, web client
  types, and GPU lease participation.
- Reproduced and fixed the Windows TorchCodec failure by preloading PCM WAV as
  the in-memory waveform shape documented by pyannote.

Evidence:

- Backend suite: 364 passed.
- Frontend suite: 288 passed; TypeScript/Vite production build passed.
- Cached Community-1 revision
  `3533c8cf8e369892e6b79ff1bf80f7b0286a54ee` loaded in the real Studio runtime;
  same-file smoke score was `1.0`.
- Dedicated WeSpeaker correctly reports unavailable instead of downloading or
  pretending success.

Still missing:

- Round 03-03C must create the real positive/negative trial evidence, calibrate
  one backend-specific threshold, and complete a real gated publish.
- GAP-PLAN and LIC-01 remain queued after that acceptance round.
