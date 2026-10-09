---
current_phase: 3
current_phase_name: Voice Training
total_phases: 7
current_plan: 3
total_plans_in_phase: 4
status: In progress
progress: 60%
last_activity: 2026-10-09 — USER-FEEDBACK-10 shared Script scroll.
last_activity_desc: Stable measurement caches and anchors, manual browsing priority, common scrollbar across table/prose/channel/live routes. Frontend654/75 plus final focused53/4, typecheck/build pass; API687 carried08. Native scroll acceptance and STT-GAP-01 remain; Phase03 budgets unchanged.
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (status reconciled 2026-09-22)

**Core value:** One portable project carries audio through transcription,
training, generation, conversion, and later LipSync with honest lineage.
**Current focus:** Phase 03 Voice Training — gated publication.

Detailed plan-vs-code evidence: `docs/PROJECT-STATUS.md`.

## USER-FEEDBACK-10 — 2026-10-09

Commit `9fcd554` stabilizes shared Script scrolling: semantic measurement caches,
anchor-preserving height changes, logical-row chrome and header offsets, and
manual browsing priority over playback/data-refresh follow. Table, prose,
archived channels and OBS realtime now share an explicit keyboard/pointer
scrollbar. Table toolbar no longer expands the scrollbar's region. Read-only
owner topology explains different routes: OBS1,136 words/10 turns/25 fragments;
Conviction665/15/19; PDCA42,107/3/659. Three red regressions reproduce anchor
movement, refresh cache churn and Script refresh returning5,000->0; green now.
Full frontend654/75 before final toolbar containment refinement; final focused
53/4, typecheck/build pass. Backend unchanged; API687 is carried08 baseline.
Gate `docs/gates/user-feedback-10-script-scroll.md`, ADR0057. Natural wheel
smoothness, end reachability and visible OBS scrollbar on the owner device still
need UX-EDITING-DEVICE-01 after reload; source/jsdom is not that acceptance.
Exact next executable STT-GAP-01 retains recognizer/merge artifacts on an isolated
copy; native Script acceptance can proceed alongside. No owner media/transcript,
normal service/model, schema/upstream or Phase03-budget change. Phase03 stays60%.

## USER-FEEDBACK-09 — 2026-10-09

Commit4568e3f repairs paused zoom/metadata/drag-release view movement, archived
playback follow and standard PCM detail after Stop. Repeated status/journal refresh
regression preserves the04:00 window. Actual owner media verifies normalized1ms
peaks and unchanged source hashes. Final realtime segment notes expose gaps in
trusted detailed-word coverage without changing word data or STT completion.
Frontend646/74, typecheck/build and relevant API waveform2 pass; full API687 is
carried08 baseline. Gate `docs/gates/user-feedback-09-obs-archive-view.md`, ADR0056.
Exact next STT-GAP-01 reproduces missing words on an isolated copy with retained
recognizer/merge artifacts: actual28.668s gap has audio/realtime text but no raw
segment checkpoints. UX-EDITING-DEVICE-01 natural scrolling, Stop waveform and
audible playback acceptance remains; original rapid jumping is not device-proven.
No services/inference/owner media or transcripts/schema/upstream changed. Read-only
normal closure status is API stopped/Studio running/busyfalse; restore normal
service operation before owner acceptance. Startup/device/LAN/word-truth and
Phase03-budget requirements remain.

## USER-FEEDBACK-08 — 2026-10-09

Removed unnecessary CA/proxy work for controller HTTP loopback clients. Controlled
Uvicorn/environment/early-import regressions pass; CLI captures bounded startup
frames and launchers preserve previous nonempty output. API687/two existing
warnings passes with E temp storage; initial C full fixture errors are recorded,
no owner files deleted. Actual normal controller1.897s/Studio4.354s/API11.393s
readiness passes; runtime/health running/ok and normal stack left up.
Gate `docs/gates/user-feedback-08-controller-readiness.md`, ADR0055.
Original PID25916 stack and idle/cold reliability remain unproven. Exact next
RUNTIME-READINESS-DEVICE-01 records normal idle/cold starts; then UX-EDITING-DEVICE-01
native OBS Stop/waveform/playback/editing acceptance. Frontend07 evidence carried.
No manual inference dispatch, schema/upstream or Phase03-budget change; stays60%.

## USER-FEEDBACK-07 — 2026-10-09

Owner confirms Record signal/overlap detection. Logged406-second stopped overview
exceeded the backend live120-second cap. Stopped full snapshots now permit bounded
recording duration with incremental600-bin extrema; live/cursor120 caps remain.
Immediate journal refresh and same-take overlapping bins retain Stop waveform.
Actual copied owner envelopes pass with600 audio points/channel; baseline adapter
reproduces422. Original MKA/two WAV hashes unchanged. Frontend639/73, API682/two
existing warnings, typecheck/build pass; gate:
`docs/gates/user-feedback-07-obs-stop-waveform.md`, ADR0054.
Exact next UX-EDITING-DEVICE-01: reload, existing take overview and native >120s
Record -> Stop -> waveform/zoom/playback, plus prior editing/scroll acceptance.
Reviewed STT word truth and browser/physical/quality/LAN prerequisites remain.
No normal service/model, owner media or schema mutation; Phase03 stays60%.

## USER-FEEDBACK-06 — 2026-10-09

One-pass deletion preserves surviving word identity and commits once. Large Script
deletion runs in a Worker with cancellation/fences; pending/error feedback retains
UI control and source data. Changed-text history skips full snapshot serialization.
Table/prose timing notices scroll outside the transcript value with measured
virtual/overlay offsets. Logged historical-owner KeyError no longer blocks current
OBS journal writes; missing completed journals retain explicit errors. Fresh PCM,
waveform/transcript fixture and actual Worker bundle pass. Frontend637/73,
API680/two existing warnings, typecheck/build pass; gate:
`docs/gates/user-feedback-06-script-deletion-and-obs-journal.md`, ADR0053.
Next UX-EDITING-DEVICE-01 real long-footage deletion/scroll and native OBS acceptance
needs permitted device checks after reload. STT-TIMING-ACCURACY-01 word truth remains.
No normal service/model, owner media or schema mutation; Phase03 stays60%.

## USER-FEEDBACK-05 — 2026-10-09

Timeline word edits route shared30-step history across overview/focused editors;
live drags cancel before undo. Per-word4px spatial filtering preserves source
identity with zoom detail. Atomic IN/OUT and direct drags warn at actual collisions,
retaining10%; tiny words/noncontiguous selections remain valid. Positive estimates
retain original timing and remain untrusted. Promotion guidance is a2s hover portal.
Studio phrase-edge fences prevent cross-word/adjacent-gap overlap. Frontend627/71,
API679/two existing warnings, typecheck/build pass; gate:
`docs/gates/user-feedback-05-timeline-word-timing.md`, ADR0052.
Next STT-TIMING-ACCURACY-01 needs reviewed word truth and isolated comparison;
`docs/STT-TIMING-ACCURACY-PLAN.md` records previous aligner tail regression.
UX-EDITING-DEVICE-01 visual/audio and older prerequisites remain. No normal
service/model, owner-media or schema change; Phase03 stays60% and R5/R6 gates hold.

## USER-FEEDBACK-04 — 2026-10-09

Fragments remain bounded inside one speaker row; explicit/inherited same profiles
merge. Fixed selection controls and ordinals, checked-row-only attribution,
pointer/focus Ctrl+A and thirty-step project-session undo/redo are delivered.
Cross-track speaker assignments undo as one action. Dense subtitle summaries
restore readable overview text with zoom detail and original source timing.
Frontend611/70, API677/two existing warnings, typecheck/build pass; current gate:
`docs/gates/user-feedback-04-script-rows-subtitles-and-history.md`, ADR0051.
Owner confirms responsiveness from03. Next UX-EDITING-DEVICE-01 needs permitted
visual/theme/ordinal/subtitle/history/scroll and audible evidence. Existing tool
restriction and older physical/quality/download/LAN gates remain. Phase03 stays60%.

## USER-FEEDBACK-03 — 2026-10-08

Animated import placeholders precede metadata/cache choices and retain same-name
feedback. Expandable folder slots replace breadcrumb navigation. Multi-select
retains list IDs without loading Script/Timeline; bulk ticks change immediately
and save in order, fenced against stale opens/reads. Long Script fragments and
dense subtitle overviews bound mounted DOM while retaining full source indexes.
Frontend602/69, API677/two existing warnings, typecheck/build pass; limits in
`docs/gates/user-feedback-03-media-tree-and-responsive-selection.md`, ADR0050.
Next UX-EDITING-DEVICE-01 requires allowed real browser/native, real-STT selection
and scroll, and audible checks. Existing tool restriction and older physical/
quality/download/LAN gates remain. Phase03 stays60%; Queue is still proposed.

## USER-FEEDBACK-02 — 2026-10-08

Larger device Import and separate Host chooser, corrected root breadcrumb,
stale-read lifecycle fence and STT/DIA/Training activity implemented. Shared
pointer preview covers ordinary, middle alignment, multitrack and archived OBS,
preserving gain/mute, excluded boundaries and release/source cancellation.
Frontend593/68, API677 and typecheck/build pass; API results/timing caveat are in
`docs/gates/user-feedback-02-media-and-audio-scrubbing.md`. Queue tabs/hierarchy
and durable GPU dispatcher are proposed, not implemented. Exact next
UX-EDITING-DEVICE-01 still needs allowed visual/native, real-load and audible
checks; browser tool restriction and older device/quality/LAN gates remain.
Phase03 stays60%.

## USER-FEEDBACK-01 — 2026-10-08

Startup/Open Existing reconcile orphan STT/DIA; dedicated checkpoint ownership
is validated and removal fences all affected workers. Shared all/missing choice
dispatches only confirmed targets. Generate force uses new clips and hands over
GPU before terminal status; eligibility verifies WAVs and effective settings.
Icon Import/folder-plus, independent media loading, deferred selection feedback
and shared compact subtitles are implemented. Frontend580/67, typecheck/build
and API677/two existing warnings pass. Actual recycled PDCA MP3 flag
repaired; completed results preserved, Test_OBS_05 valid resumes retained.
Exact next UX-EDITING-DEVICE-01 needs allowed UI/device and real-load evidence;
older quality/identity/physical/download/LAN gates remain. Phase03 stays60%.

## TASK-STOP-DEVICE-01D1–01D3 — 2026-10-07

Resume dev-token cache and Windows tokenizer process pressure repaired. Actual
Generate queue/hard Stop/rerun retains WAVs. Actual Training Stop reaps four
processes and retains11 checkpoint hashes; same-run checkpoint5 Resume completes
20, publishes LoRA and generates WAV.19 retained source/reference hashes agree.
API658, frontend560/63, typecheck/build pass; fixture services cleaned. See the
four01D gates. Next UX-EDITING-DEVICE-01 needs native/audio/load evidence; older
physical/download/LAN and trusted recognition/speaker labels stay open. API
checkpoint-list freshness and unfinished-save recovery remain separate notes.

## TASK-STOP-DEVICE-01C — 2026-10-07

Cancellation settles STT/diarization activity instead of leaving a running
footer. Failed acknowledgement remains failed; first Stop stays running.
Real GPU/new-API and focused regression proof in the01C gate. Exact next01D:
Training checkpoint Resume/Generate Stop using compatible project artifacts.
Owner selection is pending; fixture services/token copy are cleaned.

## TASK-STOP-DEVICE-01B — 2026-10-07

Real community-1 No/Yes/rerun preserves completed spans and all seven WAVs.
See `docs/gates/task-stop-device-01b-diarization.md`. Exact next01C repairs
the observed stale Activity Center task after STT/diarization cancellation.
Training/generation and physical acceptance retain their prerequisites.

## TASK-STOP-DEVICE-01A — 2026-10-07

Real Medium/CUDA No/Yes/rerun passes with actual worker reaping and stable
cancelled records/source PCM. Gate: `docs/gates/task-stop-device-01a-stt.md`.
Next01B runs community-1 diarization. Training Resume and generation need their
compatible project artifacts; physical OBS/native evidence remains separate.

## TASK-STOP-01 — 2026-10-07

STT, diarization, training and generation share queue Stop with a repeated-click
Yes/No dialog for active cancellation. Owned subprocess control and result
fences preserve completed artifacts/PCM/checkpoints. See the task-stop gate and
ADR0047. Next: TASK-STOP-DEVICE-01, real-model Stop then rerun/Training Resume
after normal app/Studio restart. UX-EDITING-DEVICE-01 remains open.

## UX-INTEGRATION-01 — 2026-10-07

Nine requested UX rounds execute under the owner's all-round override. Portable
organization, concurrent multi-file import, shared Script/subtitle edits,
provisional timing and effective working/cut intervals are integrated.
The real PCM and browser fixtures retain source hashes; interpolation never
claims verified recognition. See `docs/gates/ux-editing-2026-10-07.md`.
Next: UX-EDITING-DEVICE-01 — the four owner checks after normal app restart.
Older near-term parents and Phase03-04 retain their documented prerequisites.

## Current Position

Phase: 3 of 7 (Voice Training)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-10-07 — Real Training Stop/Resume and Generate artifacts checked.

Progress: [████████████░░░░░░░░] 60% artifact count (product phases: 1/7 complete)

The 60% figure is GSD's 6/10 plan-summary artifact count. It is not product
completion: historical Phase 02 summaries and a seam-only Phase 07 plan count,
while user-visible success criteria in Phases 2-7 remain open.

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

## LIVELINK-STT-19B7 — preserved-context boundary rejected (2026-10-05)

One1.1s boundary candidate with repaired quiet PCM reduces final spans29->16,
but CER19.62->20.92% and WER24.19->26.14%; reject, retain0.5s default.
16/16 source spans and hashes match, no errors. Timing is confounded by the
concurrent fullbackend suite and additional Studio model load; no causal speed
claim or repeat. See `docs/gates/livelink-stt-19b7-1s-pcm.md`.
Full19A/19B CER, reviewed word anchors and physical OBS timing remain open.
Nine near-term parent rounds remain; no phase advance or budget relaxation.

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

## Verification Baseline

## LIVELINK-CONNECT-01 — Preferences transport recovery (2026-10-04)

Owner reported Failed to fetch and native Disconnected. On inspection both API
and controller proxy answered installation/status requests normally, but OBS
was closed. Opened installed OBS through the existing API action; its real
hello/heartbeats returned 200 and connection became connected. Pairing remained
valid; no token reset, binary update or source media mutation was necessary.
The original outage trigger was not captured and is not attributed to pairing.

Preferences had a reproducible separate defect: an initial transport rejection
left its checking/error state indefinitely. It now retries only status GETs
every three seconds after fetch TypeError, clears errors on recovery, cancels
retries on unmount and suspends them during manual actions. Install/Repair are
never automatically repeated after an uncertain result. Removed obsolete text
claiming native Tools integration was still planned.

Regression baseline: 2 failed / 3 passed. Fixed: 5 passed. Full frontend 468
passed / 55 files; typecheck/build pass. Portable backend installation/connection
suite: 17 passed. Browser at the controller URL shows Preferences installation
status, actual OBS path and running state without Failed to fetch. Test_OBS 7
mixer shows Connected and six currently available source rows; API inventory
also retains missing source identities (22 total), not 22 currently active rows.

Installed binary differs from the current package but connects correctly; an
update requires OBS closed and is not claimed performed. API startup/native
failure acceptance and sustained capture/STT quality remain open. Exact next:
LIVELINK-INGEST-18A, profile six-source spool and Stop tail.

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

Previous bounded round: `RUNTIME-VOICE-01` (2026-10-03).
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


Previous UI-CONTRAST-01B observed browser acceptance remains historical evidence.

Previous UX-11B recording-name gate remains historical evidence.

Existing UX-08B footage lifecycle, CAPTURE-10B and 12L/12M gates remain
historical evidence.
The historical phase baseline below remains distinct from these focused checks.

- Backend: 364 passed.
- Frontend: 288 passed.
- TypeScript/Vite production build: passed.
- `git diff --check`: passed.
- `engines/OmniVoice`: no tracked modification.

## Accumulated Context

## Decisions Made

| Phase | Summary | Rationale |
| --- | --- | --- |
| 03 | Keep `ProjectVoice` and Voice Model Set distinct | One usable artifact cannot carry a coordinated set's identity, lineage, and gate guarantees. |
| 03 | Dataset Manifest remains engine-free | Exporters may change engine shape without changing portable project truth. |
| 05 | RVC gate remains failed/partial | Speed and pitch evidence cannot override failed cross-speaker CER or missing measurements. |

## Completed Contracts

- Stabilization W0-W4; R5 declined and R6 intentionally skipped.
- Phase 01, plans 03-01 and 03-02, and seam-only plan 07-01.
- 03-03 runtime/run/export/process/GPU/progress/cancel/resume foundation.
- Individual project voices, generation/output, and an RVC live-conversion slice.

## Pending Todos

No GSD todo files. Planned work remains in ROADMAP and PROJECT-STATUS.

## Blockers

- 03-03 still lacks backend-specific threshold calibration and one real gated publish run.
- 03-04 lacks durable sessions, measured capture/QC, finalization, tier policy, and identity lock.
- No checked-in sample project supplies consented, ready audio for the real training acceptance run.
- RVC similarity, cross-gender, loopback latency, and owner blind A/B are unmeasured.
- `audioop` blocks a clean Python 3.13 upgrade; Starlette test client emits an `httpx` deprecation warning.

## Deferred Items

| Category | Item | Status | Deferred At |
| --- | --- | --- | --- |
| STT review | Final per-word candidate reconciliation | Open | Phase 02 |
| Workspace | Six-zone docking and `WorkspaceSession` | Planned | Phase 04 |
| Manipulation | Isolation, dubbing, production patch/file workflows | Planned | Phase 05 |
| Video | LipSync implementation | Planned | Phase 06 |
| Distribution | Model delivery, security adapters, installer/updater | Planned | Phase 07 |

## Session

**Last Date:** 2026-09-22
**Stopped At:** Round 03-03B complete; the gate works and fails closed while thresholds are uncalibrated. Round 03-03C is next.
**Resume File:** None
