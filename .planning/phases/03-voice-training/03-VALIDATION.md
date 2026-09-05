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
| API orchestration starts a real run | Training runner and start route | Pending |
| Checkpoint publish and Voice Model Set lineage | Publish adapter and integration test | Pending |

## Explicit Non-Evidence

- A saved Training Catalog does not mean a dataset has been compiled.
- A transcript does not prove that a supplied script matches the recording.
- Manual speaker labels do not mean diarization or isolation has executed.
- Training controls do not mean OmniVoice fine-tuning is connected.
- `/api/training-runtime` reports the missing runtime but does not install packages or start a training process.
