# Project Status — 2026-09-22

## Owner UX rounds — 2026-09-29

`UX-03` extends Shift range, Ctrl/Cmd toggle and Ctrl/Cmd+A selection with
appropriate batch actions across the primary editable lists: Voice Output,
Sound Library profiles/voices, Script rows, Project Hub, Speaker Isolation,
Training History, authored training passages, and Media Pool Recycle Bin.
`UX-04` fixes repeated PCM viewport requests caused by comparing a grouped API
response's point count with the requested density. Frontend 369 tests,
typecheck and build pass; backend 439 tests pass. Physical browser playback
remains unverified. The specialized OBS capture track Final STT list is the
next selection gap; see `UX-05` in `docs/WORK-ROUNDS.md`. Final `LIVELINK-08`
acceptance remains open.

## OBS LiveLink execution plan — 2026-09-28

The owner has deferred hands-on acceptance until Record state, a live waveform
for each forwarded channel, and automatic per-channel live transcription are
visible together. `LIVELINK-08` remains the final integration gate. The next
product round is final `LIVELINK-08` in `docs/WORK-ROUNDS.md`. The planning revision itself changed
execution order only; it did not provide physical acceptance.

`LIVELINK-08J` delivers an OBS-themed native dialog with a P4B/Pro4Bro header,
theme-aware panels, meters and controls, DPI-aware layout, and a vector brand
asset in plugin package 0.6.0. On development OBS 32.2.2 the installed package
loaded; dark/light and 1/5/20-source dialog screenshots were captured at 100%
DPI, Forward/alias persisted in a disposable collection, and Install/Repair
reported `installed` with pairing retained. QA scene/config changes were
restored. Actual 125%/150% DPI, the full simultaneous recording/STT matrix,
and the second Windows machine remain final `LIVELINK-08` gates.

`LIVELINK-08A` is complete on development OBS 32.2.2. Its API repair keeps
unsigned Matroska TrackUIDs out of the plugin's hello/heartbeat JSON while
retaining them in app status and project journals. The installed native plugin
now detaches source callbacks on scene collection change/exit. Three consecutive
physical OBS Start/Stop sessions each produced durable PCM, a ready MKA and a
matching MKV; the collection switch back to the owner's `Untitled` completed
without a retained-source warning or new crash. This run forwarded one Mic
channel; visible per-channel Record, waveform, live transcript and wider source
matrix remain in `08B`–`08J` and final `LIVELINK-08`. An earlier OBS access
violation exists in Windows events, but no available stack trace attributes it
definitively to this plugin.

`LIVELINK-08B` adds per-channel app capture evidence to v3 status/SSE:
recording owner, durable PCM count/sequence/sample high-water, last receipt,
gap metrics, and pending/receiving/stalled/paused/disabled/missing/disconnected
states. A project-owned checkpoint plus tail replay recovers these after an
API restart. Tests distinguish OBS Record and Forward ACK from actual silent
PCM persisted by the app. Backend 433 tests, frontend 307 tests, typecheck,
and build pass. Its capture evidence feeds the Recorder display completed in
`LIVELINK-08C`; the final integration gate remains open.

`LIVELINK-08C` is complete at the UI/component and development OBS gate.
Recorder has Record/Stop/Pause/Resume controls and 28 px channel rows. A red
pulsing `REC` means that the current app recording/project has persisted PCM;
all other states use a static gray dot, with separate labels and a reduced-
motion fallback. Frontend 318 tests, typecheck and build pass. In live OBS,
Start changed the app button to Stop; four channels received PCM and showed
red `REC`, while a fifth channel without PCM showed gray `PCM stalled`.
Stop returned every channel to gray Idle. Ignore Start kept the app idle and
every channel gray while OBS recorded; the policy was restored. UI screenshots
at 1600 and 1100 px are in `.scratch/`. Waveforms, automatic per-channel
transcription and the final LIVELINK-08 acceptance remain open.

`LIVELINK-08D` is complete at API/feed and real-MKA artifact level. Durable
PCM produces a 50 ms extrema sidecar per recording/channel/chunk before ACK;
the web receives bounded waveform snapshots keyed by recording-relative frame
and source sample range. Status SSE watermarks drive per-channel updates, with
a polling fallback and 32-chunk cursor. A stopped archive can rebuild portable
10-second envelope blocks from its MKA tracks. Backend 435 tests, frontend
320 tests, typecheck and build pass. A physical four-track OBS MKA gave exact
one-second peak matches between decoded PCM and its four envelopes. The
development API was restarted on port 18120, OBS reconnected, and the live
HTTP route returned the expected physical MKA channel envelope. Its Timeline
consumer is now delivered in 08E; transcription and final multi-channel
acceptance remain open.

`LIVELINK-08E` is complete at the UI and physical OBS gate. OBS LiveLink has
one live waveform lane per forwarded channel with a common ruler/playhead;
received silence, missing PCM, pauses, channel intervals and archive gaps are
distinguishable. Stopped MKA child tracks reopen with channel/source labels
and independent WAV playback/seek. Frontend 323 tests, backend 435 tests,
typecheck and build pass. App Record and physical OBS Start/Stop produced two
four-track MKA sessions; the latter also produced an MKV. Its Channel 2/3
archive peaks were 3091/1708 at 48 kHz and rendered as distinct lanes.
Evidence is in `.scratch/livelink08e-real-check.json`. Layout switching and
per-channel gain/level are delivered in 08F; live transcription and final owner
acceptance remain open.

`LIVELINK-08F` is complete at UI and reopened four-track OBS archive level.
The CỘT/LAYER switch precedes MARK IN; horizontal columns and vertical layers
keep channel gain, selected track and playhead while zooming/scrolling. Each
source has a horizontal preview gain and independent unmodified source level;
Web Audio applies 0–200% gain only to WAV playback in Pro4Bro. The 32 px layer
waveform is 62% of the earlier 52 px height. Frontend 330 tests, typecheck and
build pass;
component coverage includes 1/2/5/20 channels. The physical four-track MKA
reopened at 1280×720 and 900×720 with visible per-column controls and working
horizontal/vertical scrolling. A physical 20-source performance run, live STT,
overlap review and final owner acceptance remain open.

`LIVELINK-08G` is complete at API and real-recognizer fixture level. New
durable PCM chunks automatically enter separate bounded live STT queues per
recording/channel. Project-owned revisioned transcript events expose source
sample bounds, OBS-clock recording-relative seconds, partial/final/error,
lag, alias and segment-level timing trust through a reconnectable API.
Backend 438 tests pass. A 14.82-second spoken
fixture produced nine events on each of two channels using the running Studio
model, including partial and final text. The model repeated a phrase in its
draft, so these events cannot yet be treated as verified subtitles. Physical OBS simultaneous speech and
owner-visible integrated acceptance remain in the final LIVELINK-08 gate.

`LIVELINK-08H` is complete at UI and archived OBS fixture level. A first voiced
chunk emits an immediate `listening` event; the Script feed merges partial/final
revisions in place and orders source-owned rows by start time. Clicking a row
selects that channel and seeks its OBS Timeline. Both Layer and Cột show a
caption and utterance span per channel. Frontend 335 tests, backend 438 tests,
typecheck and build pass. In the running app, a temporary A→B→A transcript
journal on an existing four-track archive showed three ordered Script rows;
seeking B to 00:02 displayed A and B captions simultaneously. The fixture was
removed and the managed workloads restarted. Overlap coloring and replay
markers were delivered in 08I; physical OBS simultaneous speech and end-to-end
latency remain in final LIVELINK-08 acceptance.

`LIVELINK-08I` is complete at UI and archived four-track OBS preview level.
Cross-channel segment intersections create review markers on both Script rows
and Timeline lanes; draft text is red while the playhead is inside the shared
time and returns to normal at its end. Marker playback selects the right WAV
stem and stops at the overlap end. Frontend 343 tests, backend 438 tests,
typecheck and build pass. A temporary A→B→A journal on a physical OBS archive
showed two 00:02.00–00:05.00 markers; Channel 2 preview played from 2.00 to
5.00 and a Channel 1 marker selected its own WAV. The fixture was removed and
managed workloads restarted. Segment timing cannot locate individual words;
same-channel speaker overlap remains unassigned without evidence. Physical
simultaneous OBS speech and latency remain in final LIVELINK-08 acceptance.

## OBS LiveLink addendum — 2026-09-27

LIVELINK-01 froze the v3 domain/protocol but has no live v3 route yet.
LIVELINK-02 added the OBS plugin package, hash-checked standard/portable
installer, local API and Preferences controls. The installer is covered by
eight unit/API/CLI tests and Preferences by two component tests. LIVELINK-03
added a native Tools dialog, Open App, per-user authenticated hello/heartbeat
and a single-owner project lease. The development OBS 32.2.2 process loaded
the new DLL from the build folder and showed Connected/project status; Open
App brought up both local ports. Installed-package/UAC and clean-machine
acceptance remain open. LIVELINK-04
now adds local source strips, meter, forward choice, unique alias and persisted
mapping in the native dialog. Five strips matched the development OBS Mixer,
and a real Desktop Audio tone moved its meter. Live source-change/20-source
acceptance remains open. LIVELINK-05 now synchronizes the five channels,
meters and Forward selection through authenticated v3 hello/heartbeat,
long-poll commands and applied ACKs. The app shows an SSE-backed mixer;
real OBS Idle toggles ACKed in 226/230 ms, and API restart recovered a new
epoch without crashing OBS. V3 audio recording and recording-time intervals
began in LIVELINK-06. The Recorder now has a separate OBS capture controller,
manual app actions and persisted Ignore trigger selections. The native v3
bridge uploads durable per-source PCM chunks and produces project-owned
recording journals and transitional Media Pool WAV stems after Stop. Real
development OBS runs verified two independent source stems and a recording-time
`user-disabled` sample interval. Reducer tests cover the OBS trigger matrix;
physical OBS Start/Pause/Resume/Stop with Ignore combinations and two video
spans still need end-to-end acceptance. LIVELINK-07A now verifies one audio-only
MKA parent per app recording, independent FLAC or PCM source tracks, embedded
mapping/clock/gap attachment, child track references and per-track 24 kHz
analysis WAVs. A prior real two-source OBS session was rebuilt from its retained
chunks via the retry API; a five-source physical OBS run remains open. MKV
handoff is implemented in L7B; installed-package and clean-machine checks
remain L8.

LIVELINK-07B adds the Recorder's Connect to OBS recording folder switch,
machine-local exact recording locators keyed by video span, latest-file fallback,
and Import/Browse actions. OBS Stop sends the last recording path with its span;
the API blocks active spans/recording, waits for a stable file, checks video
content and SHA-256, copies it into project media, and records a relative asset
reference and provenance hash. Repeat import of a linked span returns the
existing asset. Runtime and UI tests cover two spans under one app recording
and ensure absolute source paths do not enter the project journal. The full
physical OBS import/move-reconnect acceptance remains open for LIVELINK-08.

The older verification baseline below describes the 2026-09-22 product snapshot.

This snapshot compares the written plans with repository evidence. “Complete”
means the planned contract has evidence; “implemented slice” means useful code
exists but the whole contract or end-to-end acceptance gate is still open.

## Verification Baseline

| Gate | Result | Meaning |
| --- | --- | --- |
| Backend | 364 passed | Current Python contracts are green; this is not a real-model quality measurement. |
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
| 03-03 | Real run lifecycle ending in a gated Voice Model Set | Runtime/run/process/GPU/progress/cancel/resume, portable lineage, and a fail-closed two-backend identity gate exist | In progress |
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
| Voice Model Set persistence and lineage | Project-relative set records, API, cleanup, manifest/config/engine/source-run lineage | Publication candidates are grouped reproducibly and cannot be mistaken for identity-approved sets. |
| Speaker identity gate contract | `SpeakerEmbedder` port, cached Community-1 and dedicated WeSpeaker adapters, frozen protocol, evidence, preference, API, pass/reject/fail-closed tests | A Model Set cannot become published without complete, model-revision-specific speaker evidence. |
| Voice Output and Script generation | Project output store and generation/UI tests | Generated speech returns as a managed project artifact instead of an engine-side file. |
| HQ reading front end | Reading packs, capture tier, Recorder mode, teleprompter/read-along tests | The user can begin guided capture with known text and structured coverage. |
| Voice Changer live slice | Consent, RVC training, device preflight, native stream/recording | Real microphone-to-device conversion exists behind product-owned adapters. |
| Dashboard and activity stream | Project overview, pipeline readiness, unified activity tests | Users can see what the workstation is doing and what can run next. |
| Model/security architecture seams | Phase 07 domain models and ports | Future distribution/security work has boundaries and cannot be “completed” by a fake always-success adapter. |

## Missing Capabilities And Why They Matter

| Missing part | Exact gap | Why it matters |
| --- | --- | --- |
| Per-word candidate reconciliation | Realtime/accurate/AI/user variants are not fully merged and confirmed per word | Users cannot resolve competing transcript sources at the smallest reviewable unit. |
| Calibrated speaker threshold | Gate and provisional thresholds exist, but no positive/negative Vietnamese trial set has selected an operating point | A generic score boundary cannot yet justify accepting a real speaker identity. |
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

1. Calibrate the chosen `SpeakerEmbedder` and complete one real gated publish; persistence, lineage, and gate enforcement are now complete.
2. Finish or explicitly defer the durable 03-04 capture/QC/finalization slice.
3. Complete the Voice Changer measurement gate; do not broaden engine adoption while it fails.
4. Build Phase 04 `WorkspaceSession` before expanding live processors.
5. Continue remaining Manipulator processors, LipSync, then desktop/security delivery.
