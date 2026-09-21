# Roadmap: Pro4Bro Voice Manipulator

## Overview

Build one portable, local-first production workspace that carries project audio
from capture and transcription through dataset preparation, voice creation,
voice manipulation, LipSync, and a distributable Windows desktop release.

This roadmap distinguishes three states that older snapshots blurred:

- **Complete**: implemented and backed by the plan's required evidence.
- **In progress**: usable slices exist, but at least one plan contract or
  end-to-end acceptance gate remains open.
- **Planned**: a contract may exist, but no product slice is claimed complete.

## Phases

- [x] **Phase 1: Foundation** - Portable project shell and reusable application modules.
- [ ] **Phase 2: Speech to Text** - Trustworthy capture, transcription, review, timing, and diarization.
- [ ] **Phase 3: Voice Training** - Deterministic datasets, real training runs, and gated voice publication.
- [ ] **Phase 4: Dockable Workspace** - Six-zone docking and lifecycle-independent workspace sessions.
- [ ] **Phase 5: Manipulator Pipeline** - Generation and voice conversion with honest lineage and runtime state.
- [ ] **Phase 6: LipSync** - Reviewed video/audio inputs, adapter-backed rendering, and QC.
- [ ] **Phase 7: Desktop Release** - Model delivery, security boundaries, packaging, updates, and installation.

## Phase Details

### Phase 1: Foundation
**Goal**: Run a portable project-based React/FastAPI workstation whose modules do not import engine implementations.
**Depends on**: Nothing
**Requirements**: ENG-01, ENG-02, ENG-03, MOD-01, MOD-02, PRJ-01 through PRJ-07, UI-01 through UI-05
**Success Criteria**:
  1. A user can create, reopen, move, and reconnect a project without absolute project-internal paths.
  2. Shared modules compose multiple pages without page-specific copies.
  3. OmniVoice remains read-only and is reached only through product-owned adapters.
**Plans**: 1 plan

Plans:
- [x] 01-01: Application shell, persistence, shared modules, and upstream engine boundary.

### Phase 2: Speech to Text
**Goal**: Turn imported or recorded speech into a reviewable Script with source-provenanced timing, waveform playback, diarization, and honest processor state.
**Depends on**: Phase 1
**Requirements**: STT-01 through STT-13, WF-01, WF-03, WF-04, WF-05
**Success Criteria**:
  1. Finalized local STT persists text, revisions, word timing, and synchronized Script/Timeline playback.
  2. Untrusted timings remain visible for review but cannot silently enter subtitle cues.
  3. Diarization assigns reviewable speaker labels without claiming voice isolation occurred.
  4. Realtime, accurate, AI, and user candidates can be reconciled per word.
**Plans**: 1 written plan plus remaining unplanned review work

Plans:
- [x] 02-01: Capture, finalized STT, Media Pool, transcript review, timing stabilization, and diarization.

Remaining outside the completed plan artifact: chunked realtime transcript
handoff and the final per-word candidate confirmation UX. Phase 2 therefore
remains open even though its written plan and stabilization rounds completed.

### Phase 3: Voice Training
**Goal**: Compile selected, attributed audio into deterministic manifests; execute real model jobs; publish identity-safe project voices with reproducible lineage.
**Depends on**: Phase 2's finalized-audio and word-timing contracts
**Requirements**: TRN-01 through TRN-09
**Success Criteria**:
  1. Only selected, validated, speaker-owned segments enter a deterministic portable Dataset Manifest.
  2. A real run can start, cancel, resume, retain checkpoints, and report engine-derived progress.
  3. Published voice artifacts record their dataset, engine, configuration, and identity-gate evidence.
  4. Guided capture can resume after restart and produces QC-reviewed, tiered training material.
**Plans**: 4 plans

Plans:
- [x] 03-01: Training Catalog, Speaker Profiles, annotations, and Train UI.
- [x] 03-02: Dataset compiler, supplied-script validation, portability, and readiness UI.
- [ ] 03-03: Training runtime, run lifecycle, and Voice Model Set lineage are implemented; `SpeakerEmbedder` and a verified real gated publish remain.
- [ ] 03-04: Reading packs, capture tier, HQ Recorder, and teleprompter exist; durable sessions, capture/QC/finalize, tier policy, and identity lock remain.

### Phase 4: Dockable Workspace
**Goal**: Make module placement configurable without changing module behavior or stopping active work.
**Depends on**: Phase 3
**Requirements**: MOD-01, MOD-02, UI-01 through UI-04
**Success Criteria**:
  1. Six zones support persisted, keyboard-accessible docking and resizing.
  2. `WorkspaceSession` owns recording, playback, streams, and jobs independently of panel placement.
  3. Existing fixed manifests migrate without breaking current projects.
**Plans**: 1 plan

Plans:
- [ ] 04-01: Dock contract, migration, maintained-library spike, and WorkspaceSession.

Current page manifests, Dashboard, and module reuse are useful pre-work, not
evidence that the dock contract or lifecycle migration is complete.

### Phase 5: Manipulator Pipeline
**Goal**: Produce and transform project-owned voices and audio through real adapters, with complete lineage and no simulated processor success.
**Depends on**: Phase 3 publication contracts and Phase 4 session ownership for live streams
**Requirements**: MAN-01 through MAN-03, WF-01 through WF-04
**Success Criteria**:
  1. Text/script generation creates project-owned playable outputs through selected project voices.
  2. File and live voice conversion preserve lineage and pass a frozen Vietnamese quality/latency gate.
  3. Isolation, dubbing, and patching expose real adapter-backed jobs before being presented as available.
**Plans**: 1 written plan; additional processor plans remain

Plans:
- [ ] 05-01: Voice Changer evaluation, RVC training, file/live conversion, device loop, and verification.

Generation, Voice Output, RVC training, consent, and live device conversion are
implemented slices. The Vietnamese gate is partial and currently fails its
cross-speaker CER target; file-conversion workflow evidence, loopback latency,
speaker similarity, cross-gender coverage, owner A/B, and the other Manipulator
processors remain open.

### Phase 6: LipSync
**Goal**: Render approved project audio onto reviewed video through an interchangeable engine adapter and human QC.
**Depends on**: Phases 4 and 5
**Requirements**: WF-01 through WF-03; LipSync requirements to be assigned
**Success Criteria**:
  1. The user can approve eligible video, audio, and face-shot inputs before rendering.
  2. A persisted adapter-backed job reports real progress, diagnostics, cancellation, and retry state.
  3. Accepted derivatives return to the project with portable lineage.
**Plans**: 1 plan

Plans:
- [ ] 06-01: LipSync page, adapter contract, render lifecycle, engine gate, and QC.

### Phase 7: Desktop Release
**Goal**: Deliver the proven workstation as an installable, updateable, secure Windows application with explicit model/runtime management.
**Depends on**: Proven core workflows from Phases 1 through 6
**Requirements**: Packaging and model-management requirements to be assigned
**Success Criteria**:
  1. Base models/runtimes install, verify, update, report disk use, and remain machine-local.
  2. Project adapters and voice artifacts remain portable without duplicating shared base models.
  3. Credentials leave plaintext preferences before distribution, and authorization exists before a second user or remote exposure.
  4. A signed installer, updater, rollback path, and offline behavior are verified.
**Plans**: 1 current architecture plan plus future packaging plans

Plans:
- [x] 07-01: Define model-delivery and identity/security seams without pretending adapters exist.

The domain models and ports from 07-01 exist as designed. No `ModelStore`,
authentication, authorization, or secret-store adapter is wired; packaging,
installer, updater, signing, and release verification are not started.

## Progress

| Phase | Written plans complete | Status | Evidence boundary |
| --- | --- | --- | --- |
| 1. Foundation | 1/1 | Complete | Project, module, portability, and adapter tests |
| 2. Speech to Text | 1/1 | In progress | Finalized path works; realtime candidate UX remains |
| 3. Voice Training | 2/4 | In progress | Compiler and large run/runtime slice pass; gated set publication remains |
| 4. Dockable Workspace | 0/1 | Planned | Fixed manifests only; no dock/session contract |
| 5. Manipulator Pipeline | 0/1 | In progress | Generation and RVC live slices exist; plan gate remains incomplete |
| 6. LipSync | 0/1 | Planned | Plan only |
| 7. Desktop Release | 1/1 | In progress | Architecture seams complete; release implementation absent |

The GSD plan counter is only an artifact counter. Phase status above is the
product truth: a phase stays open when its user-visible success criteria remain
unmet even if every currently written plan has a summary.
