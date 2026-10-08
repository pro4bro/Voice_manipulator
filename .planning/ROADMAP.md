# Roadmap: Pro4Bro Voice Manipulator

## USER-FEEDBACK-04 — Script row and history consistency (2026-10-09)

Owner confirms improved response. Logical speaker rows own their view fragments;
fixed checkbox/ordinal controls, checked-row attribution, pointer/focus Ctrl+A,
thirty-step session undo/redo and grouped track assignment are implemented.
Dense Timeline snippets restore overview text and increase detail with zoom,
preserving timestamps/hit tests. Frontend611/70, API677/two existing warnings and
typecheck/build pass: `docs/gates/user-feedback-04-script-rows-subtitles-and-history.md`,
ADR0051. Exact next UX-EDITING-DEVICE-01 requires permitted real visual/theme/
ordinal/density, history/scroll and audible acceptance. Existing tool restriction
and older physical/quality/download/second-machine gates remain. Phase03 budgets,
project schema and Queue proposal are unchanged.

## USER-FEEDBACK-03 — import slots and media selection (2026-10-08)

Immediate animated import choices/inspection rows, expandable folder tree,
closed multi-select detail constructors and immediate bulk checkbox intent are
implemented. Ordered writes and revision fences retain the newest action.
Bounded Script fragments and dense Timeline marker views preserve full-source
editing. Frontend602/69, API677/two existing warnings, typecheck/build pass; limits:
`docs/gates/user-feedback-03-media-tree-and-responsive-selection.md`, ADR0050.
Exact next UX-EDITING-DEVICE-01: permitted visual/native, real-STT selection/scroll
and audible acceptance. DOM tests do not establish real device latency. Existing
browser restriction and physical, reviewed recognition/speaker/identity, download
and second-machine gates remain. Phase03 budgets and Queue proposal are unchanged.

## USER-FEEDBACK-02 — Media Pool and pointer audio previews (2026-10-08)

Device multi-file Import, separate Host picker/errors, larger icons, root
breadcrumb clarification, lifecycle request fence and stage activity delivered.
Shared scrub preview covers ordinary/middle/imported/archived OBS interaction,
gain/mute and excluded boundaries. Frontend593/68, API677 and typecheck/build pass;
API runs and readiness timing caveat are in the current gate:
`docs/gates/user-feedback-02-media-and-audio-scrubbing.md`. Unified Queue is a
source-grounded proposal (`docs/AI-QUEUE-PROPOSAL.md`), not shipped orchestration.
Exact next UX-EDITING-DEVICE-01 requires permitted visual/native, real-load and
audible checks. Existing browser restriction and older physical, reviewed
recognition/speaker/identity, download and second-machine gates remain open.
This round does not complete Phase03-04 or change phase acceptance budgets.

## USER-FEEDBACK-01 — recovery and footage interaction (2026-10-08)

Bounded feedback delivery reconciles orphaned STT/DIA flags, validates resumable
MKV/OBS ownership and fences removal. Shared all/missing/cancel choices cover
STT/DIA/Training/Generate; forced clips and GPU terminal handover retain outputs.
Adjacent Import/folder icons, priority selection feedback and shared compact
subtitles are implemented. Frontend580/67, API677/two existing warnings,
typecheck/build pass: `docs/gates/user-feedback-01-processing-and-footage-ui.md`.
Actual PDCA stale state repaired without replacing completed transcripts; valid
Test_OBS_05 checkpoint owners retained. Exact next UX-EDITING-DEVICE-01 requires
allowed visual/native, real-load and audible checks. Older physical, reviewed
recognition/speaker/identity, download and second-machine gates remain open.
This round does not complete Phase03-04 or change phase acceptance budgets.

## TASK-STOP-DEVICE-01C — settle cancelled activity (2026-10-07)

Bounded STT/diarization Activity Center repair passes regression and actual
new-API GPU cancellation checks; first Stop retains active work and the footer
returns READY after hard Stop. Gate: `docs/gates/task-stop-device-01c-activity.md`.
Exact next01D needs selected project/Speaker and compatible Training/Generate
artifacts. Parent device/identity, physical and older phase gates remain open.

## TASK-STOP-DEVICE-01B — real diarization Stop (2026-10-07)

Cached community-1 No/Yes/new-worker rerun has actual process, raw-span and PCM
evidence in `docs/gates/task-stop-device-01b-diarization.md`. An observed stale
Activity Center task makes01C the exact next repair/acceptance slice. Parent
device, Training/Generate and older phase/physical gates remain open.

## TASK-STOP-DEVICE-01A — real STT Stop (2026-10-07)

Cached Medium/CUDA execution passes No/Yes/new-worker rerun on copied speech.
The cancelled record and original/analysis PCM remain unchanged; no speech
quality, latency or physical recording acceptance is claimed. Full checks and
tool limitations: `docs/gates/task-stop-device-01a-stt.md`. Exact next01B:
community-1 diarization. Parent device acceptance and older phase gates stay open.

## TASK-STOP-01 — confirmed processing Stop (2026-10-07)

The four processing panels share first-click queue Stop and two-click confirmed
active cancellation. Includes detailed MKV/OBS STT, owned subprocess shutdown,
publication fences, training Resume ownership and generation intake reservation.
Frontend560/63 files, API646, Studio22, typecheck/build and browser Yes/No proof pass. Full API
and Studio evidence: `docs/gates/task-stop-2026-10-07.md`, ADR0047.
Exact next: TASK-STOP-DEVICE-01 for real-model shutdown and rerun/Resume after
normal app/Studio restart. Older UX device and product phase gates remain open.

## UX-INTEGRATION-01 — requested editing workflow (2026-10-07)

Nine bounded UX rounds cover concurrent multi-file import, portable nested
organization, Script/native text edits, source-time word interpolation and
promotion, shared subtitle editing, working/cut exclusions and list gutters.
Frontend550/62 files, backend588, typecheck/build, real PCM preservation and
browser persistence have evidence in `docs/gates/ux-editing-2026-10-07.md`.
Owner device checks cover native picker, loaded STT smoothness and audible
timestamp scrubbing. Exact next: UX-EDITING-DEVICE-01. This UX delivery does not
advance Phase03-04 or close the older nine recognition/physical parent gates.

## 03-04A — durable Reading Session recovery (2026-10-05)

Server-owned pack/Speaker/card snapshot, revisions, take receipts, measured
coverage, skip/end and reopen now persist with the project. Stable capture IDs
recover lost upload results without duplicate assets; unpublished intents retire
without trapping the card. UI restores HQ in IDLE, requires explicit Speaker,
holds uncertain takes for exact retry and keeps card text instead of live ASR.
Real synthetic3s WAV/API and browser proof survives Unicode folder move,
Open Existing and official API restart with identical source/audio hashes.
Frontend507/58 files, backend570/twoexistingwarnings, typecheck/build/diff pass.
See `docs/gates/03-04a-durable-session.md` and ADR0045.
03-04 remains open for QC, flow segmentation, emotion blocks, references, tier
policy and identity acceptance; per-take Media Pool receipts are intermediate.
Nine near-term parents remain. Exact next acceptance requires reviewed19A
word/video anchors and physical OBS clocks, or trusted03-03C speaker labels
(owner question pending); no phase or budget advance is claimed.


## LIVELINK-STT-19B7 — preserved-context boundary rejected (2026-10-05)

One1.1s boundary candidate with repaired quiet PCM reduces final spans29->16,
but CER19.62->20.92% and WER24.19->26.14%; reject, retain0.5s default.
16/16 source spans and hashes match, no errors. Timing is confounded by the
concurrent fullbackend suite and additional Studio model load; no causal speed
claim or repeat. See `docs/gates/livelink-stt-19b7-1s-pcm.md`.
Full19A/19B CER, reviewed word anchors and physical OBS timing remain open.
Nine near-term parent rounds remain; no phase advance or budget relaxation.


## LIVELINK-STT-19B6 — corrected latency attribution (2026-10-05)

Completed paced replay with in-memory timing probes: post-last-offer p95
6.734s, intended source-end p95 6.891s, semaphore wait/session p95 1.578s,
HTTP/session p95 4.610s, event persistence p95 0.188s. CER19.62% still fails
15%; WER24.19% passes30%. Zero errors,29 final spans/input lengths agree,
16 source hashes unchanged. Run1 timing invalid; interrupted run2 retained,
cause unknown. Cachedmedium CUDA inference; no product setting change or
physical OBS timing claim. See `docs/gates/livelink-stt-19b6-timed.md`.
Nine near-term parent rounds remain. Next19B7 isolates1.1s boundary with
preserved quiet PCM; 03-04A durable-session implementation proceeds separately.


## LIVELINK-INGEST-18C2 — width-two candidate rejected (2026-10-04)

Sixty same-catalog groups/360 pairs per variant: two-pair width cuts group wall
15.23% (38.666s ->32.776s), pair p50/p95 137.801/282.156ms. Frozen throughput and
ACK screening fail; no API/native integration. All source/output bytes verified,
two fsyncs and ordered publication retained. Six profiling safety tests pass.
Unchanged product validation carries backend 561/frontend 477/typecheck/build.
Evidence docs/gates/livelink-ingest-18c2-width-two.md and JSON. 18B/18C stay open;
ten scheduled rounds remain. Budget question is pending, no threshold relaxed.
Next ingestion scope proposed LIVELINK-INGEST-18D design/candidate after explicit
budget disposition; physical OBS and full HTTP gate remain. No phase advances.


## LIVELINK-INGEST-18B2 — descriptor writer rejected (2026-10-04)

60-pair interleaved E: probe preserves two fsyncs and PCM-before-metadata; all
persisted/source bytes exact. Raw descriptor writer takes 5098.945ms vs current
4663.421ms (9.34% slower); candidate rejected before full HTTP/live OBS gate.
Production is unchanged; 18B acceptance remains open. Evidence:
docs/gates/livelink-ingest-18b2-raw-pair.md and JSON. Product validation carries
from 9c88c92 (backend 561/frontend 477/typecheck/build); helper checks follow in
18C2. Exact next requested scope 18C2 two-pair concurrency screening. No phase
or scheduled-round completion advances.


## VOICE-EXPORT-13B2 — subtitle timing bounds (2026-10-04)

Completed bounded repair: refuse words outside playable audio and cues collapsing
to equal SRT milliseconds, without inventing timestamps. Failed export preserves
prior valid SRT. Four observed regressions repaired. Actual API move/Open Existing
keeps WAV/word/line hashes and all source audio; invalid timing returns HTTP 400.
Full backend 561 passed; final exporter 10 passed after strengthening artifact
preservation checks. Unchanged frontend 477/typecheck/build carries from 13B1.
See docs/gates/voice-export-13b-bounds.md and companion JSON. Browser saved-file,
cancel and real speech evidence remain open; parent 13B is not accepted.
Exact next independent queued round UX-05B requires functioning browser control;
MKV-ACCEPT-01 retains reviewed 19A timing/recognition prerequisites. No phase or
scheduled queue completion count advances.


## VOICE-EXPORT-13B1 — truthful export handoff (2026-10-04)

Completed bounded repair: browser handoff is no longer reported as a confirmed
saved download; Voice Output SRT displays the count of cues omitted for untrusted
timing. Selected-output identity, API WAV bytes and word/line cues verified.
Backend 557, frontend 477/56 files, typecheck/build pass. Actual browser download
artifact/cancel/move evidence remains open after browser interruption; parent
VOICE-EXPORT-13B is not accepted. See docs/gates/voice-export-13b-handoff.md.
Next bounded work VOICE-EXPORT-13B2 export interval validation; MKV-ACCEPT-01
reviewed timing/recognition prerequisites remain open. No phase advances.


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

## MKV-FOLLOW-03 — selected-stream Cluster decode (2026-10-04)

Complete at measured decoder scope. Probe/decode all selected streams once per
complete Cluster while retaining original per-stream first PTS, PCM alignment,
fsync and per-Cluster checkpoint. Generated six-track/ten-minute backlog improves
99.213s -> 65.851s (33.63%, 9.11x timeline realtime). Retained actual OBS prefix
12 Clusters/49.92s improves serial control 20.430s -> 10.197s (50.08%). Decoder
calls drop 83.33%; all PCM/frame/gap metadata remain exact. Existing tiny AAC gaps
are preserved, not claimed fixed. Sampled process-tree RSS stays below 72 MiB;
not a hard bound for arbitrary Clusters. Owner source is read only/hash unchanged.

Generated six-track restart and Finish hashes pass; focused follower 19 tests
pass. Final full backend: **557 passed**, 167.31s, two existing deprecation warnings. Unchanged frontend
475/typecheck/build evidence carries from MEDIA-STAGES-02. See ADR 0044 and
`docs/gates/mkv-follow-03-backlog.md` with metrics JSON. No phase advances.
Exact next **MKV-ACCEPT-01**, physical writer/A-V/speech acceptance. Full 19A
reviewed timing and 19B accuracy prerequisites remain open, as do 18B/18C budgets.

## MEDIA-STAGES-02 — materialize omitted tracks (2026-10-04)

Complete at completed-container scope. A previously omitted audio stream can
be added from Media Pool Import under the same footage. API deduplicates repeat/
concurrent requests; new WAV and parent selection publish in one index write.
Original source and existing analyses are preserved. Decode/index failure stays
retryable; edited Script/selected child are retained across list refresh.

Real MKV/MOV/MP4, local cache/original, concurrent/retry and move/Open Existing
checks pass. Browser adds Track 2 immediately, shows two waveforms under one
footage, and retains both after reload/reopen; console clean. Generated tracks
are mono24k PCM16/4 seconds, 440/880 Hz, no clipping; source/cache bytes match.
Final backend 552, frontend 475 in 55 files, typecheck/build pass. Owned services
and tab close. Evidence: ADR 0043 and `docs/gates/media-stages-02-track-addition.md`
with metrics JSON. Still-growing MKV must Finish before adding an omitted track;
uncached sources need their original locator; unpublished failed derivatives may
remain. No STT quality or phase completion is claimed.
Exact next **MKV-FOLLOW-03**. 19A timing/physical and 19B accuracy stay open.

## LIVELINK-STT-19B2 — beam-search candidate rejected (2026-10-04)

Medium beam search 5 on the unchanged 19A corpus yields CER 22.17%, WER 25.97%,
still failing <=15% CER. The candidate is rejected; production beam 1/medium is
unchanged. Source hashes match. No physical/timing or phase acceptance advances.
Evidence: `docs/gates/livelink-stt-19b2-beam-candidate.md` and companion JSON.
19B recognition acceptance remains open; further context/segmentation diagnosis
must use a separate scope instead of lowering budgets. Exact next independent
queued work is **MEDIA-STAGES-02**; it does not depend on 19B acceptance.

## LIVELINK-STT-19B — larger model candidate rejected (2026-10-04)

Real large-v3 live candidate on frozen 19A speech reduces CER to 20.87% and
WER to 22.56%, still failing <=15% CER. Warm cadence plus drain takes 159.516s
versus 117.391s medium baseline; no exact latency percentile is inferred. Zero
request errors and original hashes unchanged. Product remains medium; no timing,
physical or phase acceptance advances. See
`docs/gates/livelink-stt-19b-model-candidate.md` and metrics JSON.
Exact next **LIVELINK-STT-19B2**, one medium beam-search candidate. The owner
requested sequential rounds in this session; commit each before proceeding.

## LIVELINK-STT-19A — real speech baseline (2026-10-04)

Two real-model runs freeze normalization, proposed budgets and curated
two-track Vietnamese references. Warm LiveLink live CER 22.97% and detailed
11.88% fail proposed CER budgets; growing MKV live 51.72% fails, detailed
9.19% passes text only. Original PCM/hash checks and browser seek pass.
Timing anchors, physical clocks, row/overlap and silence/seam acceptance remain
open. Full backend 547/frontend 473/typecheck/build pass. See
`docs/gates/livelink-stt-19a-speech-quality.md`. Exact next STT-19B is activated
for one measured LiveLink recognition accuracy failure. No phase advances.

## LIVELINK-08N-B — retained PCM recovery (2026-10-04)

Scoped retry/export and a real private six-source outage/restart complete parent
08N at health/recovery scope. Exact source PCM, Stop trimming and verified six
FLAC/WAV artifacts pass; final backend 536, frontend 473, native 2/2,
typecheck/build pass. Plugin 0.6.10 is installed with pairing unchanged. See ADR
0042 and `docs/gates/livelink-08n-b-outbox-recovery.md`. Exact next STT-19A;
speech quality and 18B/18C latency remain open. No product phase advances.

## LIVELINK-08N-A — visible retained outbox (2026-10-04)

Completed the optional native/API/UI health seam with legacy-safe machine-local
enqueue timestamps. Final backend 526, frontend 471 / 55 files, native 2/2,
typecheck/build and isolated real-browser fixture pass. See ADR 0041 and
`docs/gates/livelink-08n-a-outbox-health.md`. Parent 08N still needs scoped
retry/export and a longer multi-source API outage/Stop recovery in exact next
**LIVELINK-08N-B**. No product phase or installed-plugin acceptance advances;
18B/18C optimization/budget decision remains open.

## RUNTIME-READY-01B — Recovery storage waits (2026-10-04)

Resumed MKV STT could block Uvicorn before socket binding while reading project,
checkpoint or track metadata. Real Uvicorn regressions independently hold each
storage seam: baseline **3 fail**, repaired **3 pass**, with health available
while the read still waits and checkpoint bytes unchanged. Worker project reads
and MKV metadata reads now use threads under existing locks. A bounded Python
startup observer logs frame locations at 15/30/45 seconds if binding has not
completed; no faulthandler timer is installed and readiness budgets are unchanged.

Six full-console launches after the storage repair passed (API **3.184–5.023 s**)
and **306 HTTP checks**, including a 63.750-second final monitor. Final backend
**516**, portable media/readiness regressions **23** and diagnostics **4**,
frontend **465 / 55 files**, typecheck/build pass. Final entrypoint and full-suite
results: `docs/gates/runtime-ready-01b-recovery-storage.md`.

The historical intermittent timeout/native crash did not naturally recur;
its complete cause remains unconfirmed. RUNTIME-READY-01B completes the bounded
storage mitigation/diagnostics slice, not native-failure acceptance. Exact next:
**LIVELINK-INGEST-18A**, profile sustained six-source spool and Stop tail while
retaining the runtime gate. New runtime failure must be repaired from captured
evidence; the approximately five-minute Stop-to-archive gap remains open.

## RUNTIME-READY-01 — Owner startup timeout follow-up (2026-10-03)

Owner PID 35832 timed out before its API listener existed; recovery scanning had
finished in 2.721 s. The full intermittent failure did not reproduce on profiled
retries. A regression independently proved cold PCM checkpoint scans in resumed
detailed STT block the API event loop. Those reads now run through `to_thread`,
with existing prefix validation and locks preserved; launcher deadlines unchanged.

Actual production restart passed API readiness in **3.094 s**; health and the
**38-project** catalog returned 200 in **15/78 ms**. Focused **6**, backend **509**,
frontend **465 / 55 files**, typecheck/build pass. Evidence and the unresolved
original-cause boundary: `docs/gates/runtime-ready-01-checkpoint-io.md`.

This is an unplanned bounded repair, not completion of ingestion profiling.
The full-console path still reproduced a timeout after this mitigation; a
diagnostic launch also had a native Python access violation. Final ordinary
console startup passed at **3.108 s**. Exact next repair is
**RUNTIME-READY-01B**, capture these intermittent failures and verify repeated
ordinary starts before **LIVELINK-INGEST-18A**. Six-source spool/backlog and the
approximately five-minute Stop-to-archive delay remain open.

LiveLink/STT continuation (GAP-PLAN, 2026-10-03):
`RUNTIME-VOICE-01` completed bundled Voice Changer worker sibling imports.
Actual EngineWorkerProcess failed because embedded Python `_pth` isolation
omits the script directory. The worker now resolves its siblings from `__file__`.
Original and copied runtimes enumerate **66 devices**, return idle status and
reject a missing named device before opening an audio stream; actual RVC runtime
also returns harmless protocol replies without loading a model.

Evidence: Voice Changer **12 passed**, backend **508 passed**, frontend **465 /
55 files**, typecheck/build passed; current checkout portability audit **24/0**.
See `docs/gates/runtime-voice-01-worker-import.md` for reproduction, moved-runtime
proof and boundaries. Previous PROJECT-WRITE-01 persistence evidence remains in
`docs/gates/project-write-01-persistence.md`.

There are **11 scheduled rounds + 2 conditional repairs remaining** in
`docs/GAP-PLAN-2026-10-03.md`. Exact next: **LIVELINK-INGEST-18A**, profile the
six-source spool and Stop tail before tuning. The approximately five-minute
archive delay remains; real conversion/model quality, STT accuracy, physical DPI,
clean-machine transfer and speaker publication gates remain open.




Historical GAP-PLAN was documentation-only; its carried baselines are superseded
by the checks above. Its plan evidence remains in `.scratch/gap-plan/`.

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

Durable chunked live transcript handoff and recovery are implemented slices.
Remaining outside the completed plan artifact: the final per-word candidate
confirmation UX, frozen real-speech quality and wider capture/MKV acceptance
in GAP-PLAN. Phase 2 stays open despite its completed written plan artifact.

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
- [ ] 03-03: Runtime, run lifecycle, lineage, and the fail-closed `SpeakerEmbedder` gate are implemented; threshold calibration and a verified real gated publish remain.
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
