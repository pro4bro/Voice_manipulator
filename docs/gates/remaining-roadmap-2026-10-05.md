# Remaining Roadmap Prerequisites — 2026-10-05

## Scope and method

Read-only audit of the remaining executable roadmap after the current near-term
queue. Sources inspected: `.planning/ROADMAP.md`, `.planning/STATE.md`,
`.planning/phases/03-voice-training/03-03-PLAN.md`, `03-04-PLAN.md`, the Phase
04–07 plans, `docs/WORK-ROUNDS.md`, `docs/GAP-PLAN-2026-10-03.md`,
`docs/PROJECT-STATUS.md`, and `docs/gates/SPEAKER-SIMILARITY-PROTOCOL.md`.
Project JSON metadata, audio-path existence, WAV headers, and training-run
metadata were read locally. No runtime, GPU, model inference, UI, installation,
or download was used. No model checkpoint was loaded or quality-tested.

The current `.planning/STATE.md` says there is no *checked-in sample project*
with consented ready audio. That statement is compatible with the local
`data/projects` evidence below: those are user project folders, not checked-in
fixtures. Any implication that this machine has no consent-attested candidate
corpus is stale. The state entry also still points to 03-03B as the last
activity; `docs/WORK-ROUNDS.md` and the newer project-status entries are the
more useful round-level context.

## Next bounded executable milestone: 03-03C calibration

The next actionable slice is to freeze a consent-approved Vietnamese trial
manifest and measure the cached Community-1 embedder at the pinned revision
`3533c8cf8e369892e6b79ff1bf80f7b0286a54ee`. The frozen protocol accepts PCM16
WAV, converts to mono 16 kHz, requires clips of at least three seconds, uses
whole-window embeddings and cosine similarity, and requires every set member
to pass. Record positive and negative scores and select an operating point
from those measurements. The current 0.70 threshold is provisional.

The backend is **available but not calibrated**. Its recorded same-file score
of 1.0 demonstrates runtime connectivity only. It is not identity evidence and
cannot publish a set. The dedicated WeSpeaker backend is not installed and
reports unavailable; calibration can use Community-1 without installing it.
Sources: `docs/gates/SPEAKER-SIMILARITY-PROTOCOL.md` and the 03-03B entry in
`docs/WORK-ROUNDS.md`.

### Local corpus and model artifacts

| Local project | Verified metadata and artifacts | Suitability boundary |
| --- | --- | --- |
| `data/projects/conviction-voice-over` | One consent-attested Vietnamese profile. `assets/training/datasets/dataset-eb1e45117cae.json`: 148 segments, 1,005.25 seconds, 137 train / 11 dev; all segments are `captureTier=import`, `textProvenance=stt`. Referenced `assets/media/asset-22ebb74b5a9f/analysis.wav` exists and is mono PCM16 at 24 kHz, 1,102.53 seconds. `jobs/training/run-1cd11fbe1ea1/run.json` says complete at step 1000; checkpoint files total about 7.41 GB. | This completed run is `full-finetune` with `useLora=False`; it does not satisfy the 03-03 plan’s LoRA-only contract. STT text is not ground-truth guided capture. |
| `data/projects/test-6` | Two consent-attested Vietnamese male profiles. Eight manifests under `assets/training/datasets/`; each has 30–31 segments and about 178.50–200.69 seconds, with user-provenance text and train/dev splits. All referenced audio paths exist. Three completed LoRA runs have checkpoints: `run-3ac3407bebe1` (550 steps), `run-56e984ff9999` (550), and `run-c35847dcb06f` (500); each targets the same profile and each checkpoint tree is about 2.90 GB. | Each manifest draws each speaker from one source asset. Most manifests repeat the same segment/source selection; they are not eight independent recordings. These may support a trial set, but the owner must confirm consent scope and the clips’ suitability for identity calibration. |

The `test-6` metadata provides candidate positive trials from distinct utterances
of one profile and negative trials across its two profiles. It does not establish
between-session robustness: each profile is represented by one source asset in
each manifest. Do not count repeated manifests as independent trial recordings.
Freeze the exact clips and pairings after consent/suitability review. If the
intended calibration must generalize across sessions, obtain another approved
recording session per profile before claiming that coverage.

### From calibration to a real gated publish

After measuring and recording the Community-1 operating point, attempt the real
03-03C acceptance with a consent-approved LoRA run and its exact lineage. The
existing completed `test-6` LoRA checkpoint is a candidate, not yet accepted:
verify it loads, produce a project-owned Voice Output from the exact Voice
Model, compare against the trusted project reference, and exercise the actual
gate and portable Voice Model Set publication. No Voice Model Set or gate
evidence artifact was found in either inspected project. If the old checkpoint
fails the current acceptance conditions, run a fresh LoRA job from the frozen
manifest. The present GPU lease/hardware availability was not checked; a fresh
training or embedder run needs the normal GPU lease and available compute.

The local consent records establish an attestation, but this audit did not
determine whether they explicitly cover speaker-identity threshold calibration
or cross-profile comparison. Owner confirmation is the concrete human input
before those clips are frozen for that purpose.

## Later executable scope and dependency order

| Order | Milestone | What can proceed after its preceding gate | Concrete missing input or acceptance evidence |
| --- | --- | --- | --- |
| 1 | Phase 2 candidate reconciliation | Can be planned independently of model calibration; preserve existing source timing and candidate revisions. | Per-word review and confirmation of realtime, accurate, AI, and user alternatives remains unimplemented. |
| 2 | 03-04 guided capture | Durable Reading Session work can be split into a bounded first slice; actual quality/tier acceptance follows real capture. | Durable session persistence, measured capture check and post-take QC, human guided-reading takes with known text, block finalization/reference harvesting, tier policy, and identity lock. Current reading UI is mostly in-memory. |
| 3 | 04-01 dock/session | After Phase 3 acceptance, implement the dock contract and migrate pages while preserving active services. | Six-zone schema and migration, accessible drag/resize spike, and `WorkspaceSession` ownership tests proving recording, playback, and jobs survive panel moves. No dock/session contract is present today. |
| 4 | 05-01 Voice Changer | After Phase 3 publication and Phase 4 session ownership, run the frozen conversion gate and then proceed with accepted file/live workflow slices. | The plan calls for at least 40 utterances from two source speakers converted to two targets, including a cross-gender pair; frozen Vietnamese CER/F0/identity/RTF measures; owner blind A/B; and measured device-loopback latency. The existing gate is partial/failing on cross-speaker CER; similarity, cross-gender coverage, latency, and owner A/B remain open. Physical input/output-device access is needed for loopback evidence. |
| 5 | 06-01 LipSync | After Phases 4 and 5, implement reviewed inputs, persisted jobs, and one evaluated render adapter. | Approved project video/audio and face-shot map, a fixed evaluation reel, candidate engine/model revision and licence review, GPU/memory and visual/identity measurements, decodable duration-checked outputs with lineage, and human QC approval. The plan exists; no product implementation is reported. |
| 6 | Phase 7 release and LIC-01 | After core workflows and licence review, implement delivery/security adapters, then package and validate the desktop release. | Pinned source/model terms audit; ModelStore catalogue/download/hash/resume/disk management; DPAPI SecretStore and authentication/authorization before second-user or remote exposure; signed installer, updater/rollback, and offline/clean-machine acceptance. 07-01 defines seams only. GPU driver installation remains user-managed where required; current machine hardware was not inspected. |

These are executable milestones, not declarations that work is blocked forever.
The gates identify which preceding evidence must exist before claiming the
dependent product behavior. For example, Phase 5 evaluation and non-live
planning can be split ahead of Phase 4, but its live stream must wait for
`WorkspaceSession` lifecycle ownership as specified in 05-01.

## Verification record

- Repository root: `E:/AI_RND/PRO4BRO/VOICE_MANIPULATOR/PRO4BRO_VOICE_MANIPULATOR`.
- Metadata inspection confirmed 0 missing audio paths among the inspected
  manifests and confirmed the `conviction-voice-over` WAV header above.
- The initial metadata read using the Windows default encoding failed on a
  non-ASCII JSON byte; rerunning with explicit UTF-8 completed successfully.
- This is an evidence audit, not a product test run. No calibration score,
  checkpoint-load result, generated output, gated publication, current GPU
  availability, or later-phase implementation is claimed.
