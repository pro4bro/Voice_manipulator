# Project Status — 2026-09-22

This snapshot compares the written plans with repository evidence. “Complete”
means the planned contract has evidence; “implemented slice” means useful code
exists but the whole contract or end-to-end acceptance gate is still open.

## Verification Baseline

| Gate | Result | Meaning |
| --- | --- | --- |
| Backend | 348 passed, 1 skipped | Current Python contracts are green; this is not a real-model quality measurement. |
| Frontend | 288 passed | Current UI/domain behavior is green under Vitest. |
| Production build | Passed | TypeScript and Vite can produce the browser bundle. |
| Diff hygiene | `git diff --check` passed | No whitespace/error-marker defect in the pending diff. |
| Upstream boundary | `engines/OmniVoice` clean | Product work has not modified read-only upstream source. |

## Plan Versus Reality

| Plan | Written intention | Repository reality | Status |
| --- | --- | --- | --- |
| 01-01 | Portable shell, persistence, modules, upstream adapter | Delivered and covered by project/module/portability tests | Complete |
| 02-01 + stabilization | Capture/import, finalized STT, Media Pool, Script/Timeline, timing, diarization | Delivered; timing trust and runtime/storage stabilization are real | Plan complete; Phase 02 still open |
| 03-01 | Catalog, profiles, annotations, Train UI | Delivered | Complete |
| 03-02 | Selected deterministic Dataset Manifest and supplied-script validation | Compiler, validator, portability, readiness, exporter inputs, and tests exist | Complete |
| 03-03 | Real run lifecycle ending in a gated Voice Model Set | Runtime/run/process/GPU/progress/cancel/resume and individual voice publishing exist | In progress |
| 03-04 | Durable guided capture, QC, tiering, reference harvesting, identity lock | Packs, capture tier, HQ Recorder, teleprompter, and read-along exist mostly in UI memory | In progress |
| 04-01 | Six-zone dock plus `WorkspaceSession` | Fixed page manifests and Dashboard exist; no dock state/migration/session ownership | Planned |
| 05-01 | Evaluate and ship file/live Voice Changer only after Vietnamese gate | RVC/Applio, consent, live device stream, recording, and first gate exist | In progress; gate incomplete/failing |
| 06-01 | LipSync page, engine adapter, jobs, QC | No product implementation found | Planned |
| 07-01 | Define model/security seams only | Models, ports, and glossary split exist; intentionally no adapters | Complete |
| Phase 07 release | Install/download/verify models, secure credentials, package/update app | Training descriptors exist, but release infrastructure does not | Not started |

## Completed Capabilities And Why They Matter

| Capability | Evidence boundary | Product meaning |
| --- | --- | --- |
| Portable project aggregate | Relative manifests/media paths and move/reconnect tests | A project can move without baking one workstation's drive path into its data. |
| Runtime lifecycle stabilization | Controller/job ownership, restart, storage/polling fixes | New code can be loaded without rebooting and background processes do not silently outlive their owner. |
| Finalized local STT | Import/record queue, Faster-Whisper timing, Script/Timeline persistence | Audio becomes editable, replayable project knowledge rather than a transient transcript. |
| Word timing trust | Per-word trust, warnings, subtitle exclusion | Bad timestamps stay reviewable but cannot silently corrupt timed exports. |
| Speaker diarization | Queue, progress sidecar, reviewed label assignment | The app can answer “who spoke when” without pretending it isolated voices. |
| Training Catalog and attribution | Speaker/environment profiles and file/word annotations | Training data has an explicit human identity and emotion owner. |
| Dataset compiler and validation | Deterministic manifests, script validation, portability tests | A training run consumes a frozen, reproducible input rather than whatever happens to be selected later. |
| Training execution foundation | Run journal, engine export, process parsing, GPU lease, cancel/resume | Long GPU work is observable, recoverable, and less likely to collide with STT/diarization. |
| Multiple training/generation adapters | OmniVoice, VibeVoice, RVC descriptors/adapters/tests | The application has real engine seams instead of one hard-coded training path. |
| Individual project voices | `ProjectVoice` store, reference, model/adapter paths, generation tests | A single cloned/trained/converted voice can be selected and used today. |
| Voice Output and Script generation | Project output store and generation/UI tests | Generated speech returns as a managed project artifact instead of an engine-side file. |
| HQ reading front end | Reading packs, capture tier, Recorder mode, teleprompter/read-along tests | The user can begin guided capture with known text and structured coverage. |
| Voice Changer live slice | Consent, RVC training, device preflight, native stream/recording | Real microphone-to-device conversion exists behind product-owned adapters. |
| Dashboard and activity stream | Project overview, pipeline readiness, unified activity tests | Users can see what the workstation is doing and what can run next. |
| Model/security architecture seams | Phase 07 domain models and ports | Future distribution/security work has boundaries and cannot be “completed” by a fake always-success adapter. |

## Missing Capabilities And Why They Matter

| Missing part | Exact gap | Why it matters |
| --- | --- | --- |
| Per-word candidate reconciliation | Realtime/accurate/AI/user variants are not fully merged and confirmed per word | Users cannot resolve competing transcript sources at the smallest reviewable unit. |
| Voice Model Set | No aggregate binds compatible neutral/emotion Voice Models to one anchor and lineage record | Selecting separate adapters can drift identity and make one speaker sound like several. |
| `SpeakerEmbedder` identity gate | No port/adapters, frozen protocol, measured threshold, or reject-on-fail publish path | A checkpoint can be usable while still sounding like the wrong person. |
| Real 03-03 acceptance run | No recorded consented manifest-to-checkpoint-to-gated-publish evidence | Unit tests prove orchestration contracts, not that the whole local model stack produces a usable artifact. |
| Durable Reading Session | Current session state is largely frontend memory | Closing/restarting the app can lose guided-reading progress and provenance. |
| Capture Check and post-take QC | No persisted noise/level/clipping preflight or accept/review/retake pipeline | “HQ” currently describes the workflow, not measured recording quality. |
| Block finalization and reference harvesting | Accepted cards are not finalized into per-emotion block assets/references | Hundreds of takes remain awkward training inputs and identity anchors are not reproducibly harvested. |
| Tier policy | No `HQ only`/`HQ + clean`/`All selected` compiler policy with noise warning | Mixing channels/noise floors can train the model toward recording conditions instead of the speaker. |
| Dockable workspace | No six-zone schema, migration, accessible drag/resize, or `WorkspaceSession` | Moving a panel could otherwise restart/lose active recording, playback, or jobs. |
| Voice Changer gate completion | Cross-speaker CER fails; similarity, cross-gender, loopback latency, owner A/B absent | Fast output is not enough if Vietnamese words change or the target identity is unproven. |
| File-conversion workflow | Live conversion exists, but the planned persisted file job/lineage acceptance is incomplete | Offline converted audio needs reproducible inputs, parameters, output, and next-step routing. |
| Isolation, dubbing, Voice Patch | Honest placeholders/partial surfaces, no complete processors | These are core Manipulator promises and must return verifiable artifacts before being called available. |
| LipSync | Plan only | The fourth production workflow cannot yet render or QC video derivatives. |
| Model delivery | No download/hash/update/disk-management adapters | A clean workstation cannot reliably acquire the same runtimes and weights. |
| Security enforcement | Secrets remain outside the planned DPAPI store; no auth/authorization adapters | Remote or multi-user use would expose credentials and actions without enforceable identity. |
| Desktop release | No installer, signing, updater, rollback, or offline acceptance | The product remains a development checkout rather than a supportable desktop application. |

## Domain Decision

`ProjectVoice` is retained as the implementation record for one **Voice Model**.
It does not replace a **Voice Model Set**. The set is a later aggregate over
compatible Voice Models plus anchor, lineage, and identity-gate evidence. See
ADR 0011. This preserves all current APIs while keeping plans 03-03/03-04 honest.

## Recommended Execution Order

1. Finish 03-03 set persistence, lineage, `SpeakerEmbedder`, and one real gated publish.
2. Finish or explicitly defer the durable 03-04 capture/QC/finalization slice.
3. Complete the Voice Changer measurement gate; do not broaden engine adoption while it fails.
4. Build Phase 04 `WorkspaceSession` before expanding live processors.
5. Continue remaining Manipulator processors, LipSync, then desktop/security delivery.
