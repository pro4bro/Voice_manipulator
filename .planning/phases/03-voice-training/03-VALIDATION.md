# Phase 03 Validation Matrix

## Completed In Plan 03-01

| Contract | Evidence | Status |
| --- | --- | --- |
| Project-owned Training Catalog | Backend persistence tests and `assets/training/catalog.json` adapter | Passed |
| Speaker Profile metadata | Voice Vault UI and API round-trip | Passed |
| File speaker/emotion tags | Media annotations endpoint and Media Pool right-click test | Passed |
| Timed-word tags | Script unit test and persisted words | Passed |
| `mix` emotion rollup | Backend media-library test | Passed |
| Recorder-free Training page | Workspace manifest test and browser QA | Passed |
| Checkpoint default 1,000 | Train unit test and browser QA | Passed |
| Synchronized Light/Dark surfaces | Browser QA at 1280x720 | Passed |
| Upstream engine isolation | Clean submodule at `38e992bc60f85548faeb77e8fa70158ba71deb30` | Passed |

## Completed In Plan 03-02

| Contract | Required Evidence | Status |
| --- | --- | --- |
| Selected subset only | Compiler test with selected and unselected assets | Passed |
| Known-script alignment | Deviation and coverage test | Passed |
| Mixed-speaker safety | Unassigned-span rejection test | Passed |
| Portable Dataset Manifest | Move-project integration test | Passed |
| Deterministic compilation | Stable semantic-output test | Passed |
| Training readiness UI | Frontend valid/error state tests | Passed |

## In Progress In Plan 03-03

| Contract | Evidence | Status |
| --- | --- | --- |
| Training run record survives restart and detects interruption | `test_training_runs.py` | Passed |
| Runtime package report before installation | `test_training_runs.py`, `/api/training-runtime` contract test | Passed |
| Manifest to OmniVoice JSONL and dev split | `test_omnivoice_dataset_export.py` | Passed |
| Engine output parsing and process cancellation | `test_training_process.py`, `test_training_log_parser.py` | Passed |
| Single GPU lease | `test_gpu_lease.py` | Passed |
| API orchestration starts a real run | `TrainingRunner`, start route, runtime-aware UI, and provisioned Python 3.11 CUDA runtime | Passed |
| Individual project-voice publication | `_publish_voice`, `FileProjectVoiceStore`, generation/voice tests | Passed for a single Voice Model |
| Voice Model Set aggregate and lineage | Portable set persistence plus manifest-hash, engine-revision, config, member-role, source-run, API, publish, and cleanup tests | Passed; remains `pending-gate` by design |
| Speaker identity gate | `SpeakerEmbedder` port, two adapters, frozen protocol, persisted evidence, preference, negative and uncalibrated publish tests | Passed for enforcement; real threshold calibration remains |
| Real project checkpoint to gated publish | Consented project run and recorded artifact evidence | Pending |

## In Progress In Plan 03-04

| Contract | Evidence | Status |
| --- | --- | --- |
| Reading Pack library and schema rejection | `test_reading_packs.py`, reading-pack API | Passed |
| Capture provenance on media and manifests | `test_capture_tier.py`, compiler tests | Passed |
| HQ Recorder, reading plan, teleprompter, and word-follow logic | Recorder/Teleprompter/read-along tests | Passed as an in-memory UI slice |
| Durable Reading Session persistence and moved-project resume | Repository/API integration tests | Pending |
| Capture Check and Environment Noise Profile offer | Measured backend adapter and boundary tests | Pending |
| Post-take QC and accept/review/retake | Audio/STT boundary tests | Pending |
| Per-emotion block finalization and Media Pool registration | Project integration test | Pending |
| Reference harvesting per speaker/emotion | Voice Vault integration test | Pending |
| Tier policy and noise-floor mismatch warning | Compiler/UI tests | Pending |
| Voice Model Set identity lock | Set persistence, gate, and cross-set rejection | Pending |

## Adjacent Implementation Beyond The Phase 03 Plans

| Slice | Evidence | Status |
| --- | --- | --- |
| Multi-model training catalog and adapters | Model descriptors plus OmniVoice/VibeVoice/RVC tests | Implemented; not a substitute for set publication |
| Script generation and project Voice Output | voice-script, generator, output store, and UI tests | Implemented |
| RVC/Applio training and live Voice Changer | RVC, stream, device, consent, and UI tests | Implemented slice; quality gate incomplete |
| Vietnamese RVC gate | `docs/gates/2026-09-15-rvc-vietnamese-gate.md` | Partial; cross-speaker CER fails provisional gate |

## Explicit Non-Evidence

- A saved Training Catalog does not mean a dataset has been compiled.
- A transcript does not prove that a supplied script matches the recording.
- Manual speaker labels do not mean diarization or isolation has executed.
- A provisioned runtime and start route do not prove a real project run has reached a checkpoint.
- `/api/training-runtime` reports readiness; provisioning is explicit through `scripts/provision-training-runtime.ps1`, and training starts only from a validated manifest.
- A persisted `ProjectVoice` proves that one Voice Model is usable. A persisted Voice Model Set proves aggregate lineage only; `pending-gate` does not prove identity approval.
- Passing unit/contract tests for HQ reading UI does not prove that a Reading Session survives restart or produces finalized training blocks.
