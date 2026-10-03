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
| 03-03C | Calibrate the chosen backend and run one real manifest-to-checkpoint-to-gated-publish acceptance | Queued | Proves the local runtime, identity operating point, and real model artifacts rather than only orchestration tests. |
| PORT-01 | Portable path contract, engine/model localization, and fail-closed audit | Complete | Replaces portability assumptions with an executable inventory and removes sibling engine dependencies. |
| PORT-02 | Build private Python runtimes and switch every launcher | Complete | Removes the six remaining dependencies on the developer machine's Python installation. |
| PORT-03A | Assemble the bundle and validate it from a different local path | Complete | Proves the emitted deliverable launches independently of the source root. |
| PORT-03B | Copy the bundle and validate it with real OBS on another Windows machine | Deferred; acceptance carried into LIVELINK-08 | Remains open until physical-transfer and real-OBS clean-machine gates pass. |
| PORT-03 storage audit | Reconcile Explorer size with bundle and NTFS allocation | Complete | Separates logical hard-link paths, unique disk allocation, removable caches, and real duplicate binaries. |
| OBS LiveLink UX plan | Revise install, native dialog, multi-channel capture, causal trigger policy, multi-MKV handoff, and timing evidence contract | Approved | Establishes the implementation order and acceptance gates. |
| LIVELINK-01 | Freeze v3 domain, protocol, state reducer, timing and archive references | Complete at contract level | Gives the native plugin, API and UI a tested shared state contract; no v3 user flow is live yet. |
| LIVELINK-02 | Installer and Preferences integration | Implemented; real Windows UAC/OBS-load gate open | Makes plugin installation discoverable and verifiable from the app. |
| LIVELINK-03 | Native OBS Tools dialog, Open App, automatic pairing | Complete on development OBS; installed-package gate remains at LIVELINK-08 | Removes JSON/UUID setup and gives OBS a usable LiveLink surface. |
| LIVELINK-04 | Native source inventory, meter, forward selection, alias and mapping persistence | Implemented; source-change acceptance open | Lets the OBS dialog configure local channels before v3 synchronization. |
| LIVELINK-05 | V3 channel control and app LiveLink mixer | Implemented; extended source matrix and installed-package acceptance open | Lets the app inspect and toggle OBS channels with applied ACK evidence. |
| LIVELINK-06 | Recorder OBS LiveLink, PCM stems, trigger policy and intervals | Implemented; physical OBS trigger matrix remains open | Creates project-owned channel artifacts and records the boundaries needed for reconciliation. |
| LIVELINK-07A | One audio-only MKA parent with independent source tracks | Implemented; five-source physical OBS gate remains open | Makes a portable source archive while preserving source identity and rebuildable analysis audio. |
| LIVELINK-07B | OBS recording-folder connection and exact MKV handoff per video span | Implemented; physical OBS file-import and move/reconnect acceptance remain open | Preserves the correct OBS video recording beside audio spans without machine paths in the project. |
| LIVELINK-08A | Repair repeated-record PCM capture and per-recording artifacts | Complete on development OBS; broader matrix stays in LIVELINK-08 | OBS Start/Stop 3 times in one process retained PCM/MKA/MKV each time. |
| LIVELINK-08B | Per-channel recording evidence/status contract | Complete at API contract and recovery-test level; live OBS presentation follows in 08C | Distinguish OBS Record, app Record, forward ACK and actual PCM receipt. |
| LIVELINK-08C | Recorder button, compact channel rows and truthful REC indicators | Complete at UI/component and development OBS gate; wider final matrix remains in LIVELINK-08 | Make app capture observable without needing file inspection. |
| LIVELINK-08D | Live per-channel waveform envelope feed | Complete at API/feed and real-MKA artifact gate; Timeline rendering follows in 08E | Supply sample-timed data to the Timeline without streaming raw PCM to the browser. |
| LIVELINK-08E | One live Timeline waveform per OBS channel | Complete at UI and physical OBS gate; final LIVELINK-08 matrix remains open | Make simultaneous source recording visible and replayable. |
| LIVELINK-08F | Timeline column/layer layouts with per-channel gain and level | Complete at UI and reopened four-channel archive gate; physical 20-source gate remains in LIVELINK-08 | Let users inspect many simultaneous channels. |
| LIVELINK-08G | Automatic per-channel LiveLink v3 STT | Complete at API, real recognizer fixture and recovery-test level; physical simultaneous OBS speech remains in final LIVELINK-08 | Produce channel-owned transcript events during app recording. |
| LIVELINK-08H | Channel-ordered live Script rows and Timeline captions | Complete at UI, API-consumer and archived-recording fixture level; physical OBS simultaneous speech remains in final LIVELINK-08 | Show who spoke from which source while the recording is running. |
| LIVELINK-08I | Cross-channel overlap color and replay markers | Complete at derived-timing, UI and archived four-track OBS preview level; physical simultaneous OBS speech remains in final LIVELINK-08 | Make concurrent speech reviewable at its source time. |
| LIVELINK-08J | OBS-style plugin dialog and Pro4Bro brand asset | Implemented; real OBS dark/light and 1/5/20-source checks passed at 100% DPI; 125/150% physical DPI remains open in LIVELINK-08 | Make the OBS-facing control visually coherent while keeping its behavior. |
| LIVELINK-08K | Diagnose missing PCM in the owner's multi-channel recording | Complete from archived PCM metadata, API log and capture/send code; exact native drop counter unavailable | Establishes where audio disappears before changing the capture path. |
| LIVELINK-08L | Prevent short-stall PCM loss and expose native overflow | Implemented at API/native regression and plugin-package level; real OBS and prolonged-stall gates open | Removes the observed two-second eviction path and lets later tests distinguish overflow from API latency. |
| LIVELINK-08M | Measure PCM resilience in real OBS and add a durable PCM outbox | Complete on development OBS; longer outage gate remains in 08N | Two/four-channel recordings and recovery of a stalled four-channel take produced gap-free MKA archives. |
| MEDIA-MULTITRACK-01 | Preserve every audio track when importing completed MKV/MOV/MP4 | Complete at generated-media and UI list level; Timeline presentation open | One original footage retains separate stream-indexed analysis assets and group lifecycle. |
| MEDIA-MULTITRACK-02 | Show imported tracks as synchronized Timeline instances and channel Script | Complete at source and frontend test level; owner viewport acceptance open | Selection exposes every track with shared scrub/zoom/edit controls and per-track Script, gain and level. |
| MKV-FOLLOW-01 | Follow a growing local MKV into durable per-track audio chunks | Complete at generated-MKV/API test level; real OBS writer gate open | Reads complete clusters only, persists a byte/sample cursor, auto-resumes on API restart, and reconciles final audio from the closed MKV. |
| MKV-FOLLOW-02 | Make growing-MKV import discoverable from IMPORT and return footage before backlog decode | Implemented at UI, generated-media and live OBS-file read level; full-session throughput gate open | The active MKV appears promptly while a bounded watcher drains previously recorded clusters. |
| MKV-FOLLOW-03 | Measure and improve long-session multitrack backlog throughput | Queued | A recording already hours long can exceed realtime processing speed when each Cluster is decoded separately per track. |
| MKV-CHANNEL-01 | Media Pool right-click per-channel Import and Live Transcribe/STT checkboxes | Complete at generated-media/API/UI test level; owner viewport gate open | Native MKV/MOV/MP4 inspection offers per-track choices before import or MKV follow; imported footage retains available and selected tracks. |
| MKV-STT-01 | Live transcript and configurable one-minute-per-track final STT backlog | Implemented at generated-media/test level; real OBS and STT engine gate open | Fast previews use checkpointed PCM; final segments use the closed MKV, persist results before cursors, and drain the short tail after Finish. |
| MKV-ACCEPT-01 | Real OBS growing-MKV and STT engine acceptance | Queued after MKV-STT-01 | Check multi-track source timing, live backlog, Stop-tail completion, transcript quality and UI responsiveness on actual hardware. |
| MEDIA-STAGES-01 | Four persisted workflow selections on Media Pool footage and imported tracks | Implemented at API/UI test level; owner viewport gate open | Footage and materialized tracks expose Import, STT, Speaker Diarization and Train; parent checkboxes summarize and apply to children. |
| MEDIA-STAGES-02 | Materialize an omitted source track after import and align physical import state | Queued | An existing footage must be able to add a previously skipped stream without reimporting the whole source. |
| MEDIA-VIEW-01 | Withdraw/re-add imported footage and tracks from the workspace, fit full-file zoom, render detailed waveform | Implemented at UI regression level; owner viewport check open | The Import checkbox controls visible work, the left zoom edge fits any duration, and PCM detail replaces sparse bars at close zoom. |
| MEDIA-VIEW-02 | Put Timeline Channel and Track names on one scrolling line | Implemented at UI regression level; physical viewport check open | Narrow Layer labels and resizable Columns remain readable without taking height from meters or waveform. |
| MEDIA-VIEW-02B | Verify label motion at minimum Column width and owner DPI | Queued | Confirms animation, clipping and reduced-motion behavior in the running app. |
| LIVELINK-08 | Final integrated OBS matrix, time reconciliation, portability, and clean-machine acceptance | Open; final gate follows LIVELINK-08M | Accept only after channel Record state, waveform, live transcript, overlap review and real media artifacts are visible and verified together. |
| UX-01 | Remove redundant page headings, simplify Media Pool context actions, and apply the supplied Pro4Bro logo | Complete in source and packaged plugin; physical UI review open | Restores workspace height and carries the owner's mark into the app and OBS plugin. |
| UX-02 | Shared range/toggle/select-all behavior and Media Pool batch operations | Complete at UI and project API test level | Establishes predictable multi-selection and safe action targets before applying it across lists. |
| UX-03 | Extend multi-selection and bulk actions to Sound Library, Voice Output, Script rows, and other lists | Implemented in primary editable lists; specialized OBS track actions and physical UI sweep remain | Lets users edit and remove selected objects together in each module. |
| UX-04 | Diagnose and stop repeated PCM viewport waveform loading | Complete at regression-test level; physical playback check remains | Prevents the waveform from flashing and repeatedly reporting loading after media settles. |
| UX-05 | Repair Recycle Bin bulk deletion and stale rows, preserve full Script UI in OBS mode, complete remaining editable list actions | Implemented at source and test level; physical UX review remains | Makes deletion truthful and keeps Script tools available during LiveLink. |
| UX-05B | Physical UX acceptance of Recycle Bin, Script LiveLink, and remaining list actions | Queued | Checks layout, shortcuts, real deletion refresh, and PCM waveform stability in the running app. |
| UX-06 | OBS Stop boundary and per-channel Timeline layouts | Implemented at source, regression-test and plugin-build level; physical OBS gate open | Prevents PCM/STT crossing Stop and makes layer/column Timeline controls usable. |
| UX-06B | Physical OBS Stop and Timeline layout acceptance | Queued | Checks app Stop, OBS Stop with and without Ignore Stop, transcript tail, and layer/column sizes with real channels. |
| UX-08 | One OBS recording as one MKA footage with internal channels and Script | Implemented; controlled physical two-take lifecycle passes in UX-08B; broader owner matrix open | A second recording creates a second selectable footage, while each footage retains all of its channels and transcript. |
| UX-08B | Record two real OBS sessions and reopen each footage | Complete on controlled physical two-take/reopen/UI recycle-restore and API permanent-delete gate; owner hardware remains LIVELINK-08 | Repairs selection feedback so Media Pool, Timeline, audio and Script retain one recording identity; other footage survives deletion. |
| UX-09 | Match normal/OBS Timeline controls, refine Layer meters, and resize Column edges | Implemented at source and test level; browser visual acceptance open | Switching capture source retains a consistent control layout while each channel remains adjustable. |
| UX-09B | Compare both Timeline modes in the running app at owner viewport and DPI | Complete on controlled browser/DPR-1 archive gate; physical Windows DPI remains UX-10B | Repairs runaway Layer height, control overlap and keyboard resize jumps with real archive playback and browser geometry. |
| UX-10B | Inspect six or more live OBS sources, REC/PAUSE, outer scroll and physical Windows DPI | Queued; existing UX-10 follow-up | Archive geometry cannot prove active capture indicators or OS display scaling. |
| LIVELINK-UX-10 | Short Track labels, truthful PCM evidence, archive-ready Media Pool refresh, and clear highlight text | Implemented at source, frontend regression and native build level; real OBS and viewport gates open | Prevents a moving source meter from implying saved audio and makes completed MKA footage visible without F5. |
| LIVELINK-CAPTURE-10 | Repair muted-source PCM, stale source rows, and in-progress Media Pool visibility | Implemented; real muted Track 1 capture passed, browser visibility and wider source matrix remain open | A moving meter now leads to raw source PCM when Forward is on, and a stopped journal can recover its MKA without F5. |
| LIVELINK-CAPTURE-10B | Verify live Media Pool row and several independent sources in the running app | Complete on controlled five-source physical OBS/browser gate; owner device matrix remains in LIVELINK-08 | Live row/PCM preview, automatic selected MKA handoff and five independent tone streams pass; full owner hardware/load acceptance is not claimed. |
| LIVELINK-TIMELINE-11 | Keep the live waveform window current and simplify overlap review/playback | Complete at frontend regression level; real long-take viewport gate open | Prevents stale window cursors and responses from blanking the tail, distinguishes pending PCM from gaps, and restores drag/Space controls. |
| LIVELINK-INGEST-11B | Remove per-chunk take scan and amortize PCM transport controls | Implemented at replay, API test and native-build level; physical load gate open | The owner's gap-free two-track take accumulated 153 pending chunks and about 50 seconds of tail delay by Stop. |
| LIVELINK-INGEST-11C | Install and measure sustained two-track OBS capture with simultaneous live and detailed STT | Measured; PCM/archive passed, latency and realtime STT gaps open | A real OBS take shows zero PCM sample gaps and a valid two-track MKA, but p95 ingest lag is about 16 seconds and realtime STT drops queued work. |
| LIVELINK-INGEST-11D | Profile and reduce native HTTP ACK and API persistence latency under sustained two-track load | Complete on controlled two-source OBS gate; longer source matrix open | Durable PCM preparation now runs concurrently and waveform avoids a redundant flush; 304-second OBS p95 ingress lag fell to 4.20/4.14 seconds with zero sample gaps. |
| LIVELINK-STT-12B | Prevent realtime transcription queue loss under concurrent detailed STT | Complete at two-source OBS and forced-backlog test level; restart recovery open | Bounded RAM queues now replay committed PCM per track instead of discarding recognition work when full. |
| LIVELINK-STT-12C | Resume pending realtime STT from durable PCM after API restart | Complete at API startup, two-track restart and copied real-PCM replay level; physical model-load gate open | Per-track checkpoints reconstruct an unfinished utterance and replay committed PCM without repeating final transcript events. |
| LIVELINK-STT-12D | Restart the running API during physical two-track OBS capture and concurrent detailed STT | Complete at physical data/model gate; owner viewport open | Both tracks recovered complete PCM, live transcript and detailed STT; post-restart caption delay remains measurable. |
| LIVELINK-STT-12E | Reduce post-restart live caption delay under concurrent detailed STT and diagnose the first restart launcher failure | Complete at two-track physical data/model gate; owner viewport open | Warm model reuse reduced repeat-call time and post-restart median caption delay; detached-launch failure did not recur. |
| LIVELINK-STT-12F | Measure remaining caption spikes at the browser viewport under sustained OBS capture and detailed STT | Measured; sustained-duration gate open | Measured browser receipt and visible/offscreen row frame boundaries; PCM ingress and a long recognition request dominate peaks, while a harness request failure shortened the controlled take. |
| LIVELINK-STT-12G | Profile and reduce PCM ACK latency while the browser workspace polls during sustained two-track recording | Complete at sustained two-source data/latency gate; live waveform UI remains open | Batched native outbox ACK commits and changed-only folder persistence passed regressions; two warmed browser takes measured PCM p95 falling from 49.01/49.26 to 2.16/2.52 seconds without sample gaps. |
| LIVELINK-STT-12H | Repair live waveform clearing and historical missing-source lanes, then verify the recording tail in the browser | Complete at cursor/lane and OBS/browser regression gate; sustained PCM latency remains open | Empty cursor replies retain saved waveform; missing historical sources without PCM are omitted. Two real OBS takes verified retention, source removal and archive handoff; the long take again accumulated ingress delay. |
| LIVELINK-STT-12I | Reproduce and reduce renewed PCM ACK backlog under sustained browser waveform polling | Complete at measured cost/native/physical gate; natural-stall matrix remains open | Plugin 0.6.8 consumes larger existing queues without waiting. Fixed-delay p95 fell from 126 to 31 seconds; final quiet take reached 1.58/1.89 seconds. Arbitrary disk stalls can still postpone the live tail. |
| LIVELINK-STT-12J | Persist source-absence timing when a newly added source disappears during a take | Complete at reducer/native and two OBS/browser artifact gates | Plugin 0.6.9 retains queued PCM, journals callback boundaries and preserves restoration silence; Timeline distinguishes missing sources from receipt delay. |
| LIVELINK-STT-12K | Distinguish cold-start listener loss from process exit and health delay | Readiness/diagnostic/recovery slice complete; natural-loss gate open | Studio status initialized CUDA inside the old probe. Dedicated health, PID-aware waits and retained transitions are verified; five isolated cold cycles did not reproduce the historical listener loss. |
| LIVELINK-STT-12L | Replay persisted recovery backlog and foreground/detached cold startup in isolation | Isolated topology/recovery replay complete; natural-loss cause open | Six passing takes restore scheduling from 37 copied projects; startup scan logs retain evidence, but historical listener loss did not recur. |
| LIVELINK-STT-12M | Preserve selected project/footage and Script follow through API restart | Complete at lifecycle regression and isolated real-browser reconnect gate; live OBS matrix open | The same workspace, selected footage/word, scroll, zoom and transcript cursor survive restart; recovered polling clears stale transport alerts. |
| LIVELINK-STT-12 | Improve LiveLink recognition quality and reduce redundant model passes | Implemented at API test and archived two-track replay level; physical OBS gate open | Replaces the inaccurate tiny/2-second profile with medium/4-second passes and uses the project language when set. |
| VOICE-EXPORT-13 | Export Voice Manipulator output audio and word/line SRT | Implemented at generated-artifact, API and UI test level; running-browser download gate open | A selected Voice Output downloads its WAV, while SRT cues use trusted word timing or exact Script-row assembly bounds. |
| LIVELINK-MEDIA-14 | Make provisional OBS footage interactive during recording | Implemented; controlled physical viewport/PCM/MKA handoff passes in CAPTURE-10B; wider owner matrix open | A journal-only Media Pool row opens its tracks and live Timeline/Script, can preview saved PCM, and hands selection to the completed MKA. |
| LIVELINK-OVERLAP-15 | Link Script and Timeline overlap interval selection in both directions | Implemented at frontend regression level; running OBS viewport gate open | Script and Timeline share a selected interval for live and detailed STT, with source-specific highlighting and no autoplay. |
| MEDIA-SCRIPT-01C | Keep concurrent track rows intact and retain timed overlap after detailed STT | Implemented at frontend regression and owner recording fixture level; viewport acceptance open | An interjecting track no longer splits continuing speech, and detailed word timing remains inspectable in parent Script. |
| LIVELINK-STT-16 | Snapshot in-progress OBS PCM for detailed per-track STT, then process configurable blocks with 10-second padding | Implemented at API/UI, generated PCM and archived owner PCM level; physical recording gate open | A journal-backed job now follows durable PCM independently of the one-shot batch queue. |
| MEDIA-DELETE-17 | Remove a permanently deleted OBS recording from journal-backed Media Pool discovery | Complete at API, restart and owner-journal inspection level; running-app check open | Permanent deletion leaves a portable ID tombstone; stale machine state and orphan journals cannot publish a pending footage row. |
| UI-CONTRAST-01B | Inspect every highlighted state in both themes at owner viewport and DPI | Queued | Static CSS checks cannot prove inherited colors, overlays, browser selection or native OBS dialog appearance. |
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

## Round PORT-01 — 2026-09-22

Completed:

- Moved default VibeVoice, Applio/research, and Hugging Face cache paths below
  the application root, while retaining explicit environment overrides.
- Added `test-portable-runtime.ps1` with Core, Capture, STT, Training, and All
  fail-closed profiles plus JSON evidence output.
- Localized all 108 direct VibeVoice model files (75.68 GiB) and research engine
  source into ignored application-owned runtime folders; no source files or old
  environments were deleted.
- Declared and installed NumPy for the API worker that imports it directly.
- Recorded the accepted OBS follow-up scope: automatic Stop-to-MKV finalization,
  Final STT replacing live draft, source roles, and independent per-source
  diarization feeding Script/SRT speaker labels. Meeting recap is excluded.

Evidence:

- Portable audit improved from 11 pass / 9 fail to 14 pass / 6 fail.
- All 108 localized model files match source byte sizes; no missing file or size
  mismatch.
- Backend: 381 passed. Frontend: 293 passed. Production build passed.
- PowerShell parser and `git diff --check` passed; `engines/OmniVoice` stayed
  clean.

Still missing:

- Six Python virtual environments point to the developer's system Python and
  are not portable. PORT-02 must replace them with private bundled runtimes.
- PORT-03 must pass the `All` audit after a path move and on another Windows
  test machine.
- OBS-09/10 still need to implement automatic finalization, source roles, and
  per-source diarization in the product.

## Round PORT-02 — 2026-09-23

Completed:

- Added a checksum-pinned builder for six isolated CPython 3.11.9 embedded
  runtimes under `.runtime/python`.
- Vendored each workload's packages with hardlinks and relative-only `_pth`
  entries; excluded stale bytecode from the copied environment surface.
- Switched controller, API, Studio, speaker embedding, OmniVoice/VibeVoice/RVC
  training, and voice changer code to the private runtime layout.
- Preserved legacy layout lookup only for tests/build preparation; production
  defaults no longer select system-Python venvs.
- Updated setup/provision scripts to rebuild the appropriate portable runtime
  after dependency changes.

Evidence:

- Portable `All` audit: 20 passed, 0 failed.
- All six runtime import gates passed.
- API and Studio started successfully from their private interpreters and both
  health endpoints returned `ok`.
- Faster Whisper large-v3 loaded through the portable STT interpreter on CUDA
  with float16.
- Backend: 383 passed. Frontend: 293 passed. Production build, PowerShell parse,
  and `git diff --check` passed; `engines/OmniVoice` stayed clean.

Still missing:

- PORT-03 must build the actual transfer folder without build-only venvs, copy
  it to another path, and repeat the gate on another Windows machine.
- OBS-09/10 remain next after distribution acceptance: automatic finalization,
  source roles, and independent per-source diarization for Script/SRT.

## Round PORT-03A — 2026-09-23

Completed:

- Added a deterministic portable-bundle builder with hardlink staging and
  physical-copy modes, Windows long-path support, an interruption marker, and
  a manifest containing inventory and critical-file hashes.
- Excluded developer environments, source/build caches, tests, logs, Git
  metadata, and user project data while retaining all six Python runtimes,
  models, engine assets, the built web app, FFmpeg, and the OBS bridge.
- Added an OBS plugin installer using the supported machine-wide OBS layout,
  with hash verification and optional per-user configuration generation.
- Added portable verification/installation entry points and machine-facing
  quick-start documentation.

Evidence:

- Bundle inventory: 128,574 files, 117.60 GiB logical size.
- Source audit: 21 passed, 0 failed. Bundle audit: 25 passed, 0 failed.
- API and Studio returned `ok` from interpreters under the bundle path; both
  ports were released after shutdown.
- OBS installer fixture copied a matching DLL and parsed a two-source config.
- Backend: 383 passed. Frontend: 293 passed; production build passed.

Still missing:

- PORT-03B must physically copy the folder to another Windows machine, run the
  audit there, load the DLL in a real OBS 32 installation, and record separate
  mic/application sources. At this 2026-09-23 round, this workstation had no
  verified installed OBS instance; OBS 32.2.2 was observed on 2026-09-26.
- The plugin still uses manual source UUID configuration; observe that setup in
  PORT-03B before deciding whether a native source-picker panel is required.
  This recommendation was superseded by the owner-requested LiveLink UX plan.
- OBS-09/10 remain queued after distribution acceptance.

## Round PORT-03 storage audit — 2026-09-23

Completed:

- Scanned all 436,460 regular files and matched Explorer's 322,374,976,159-byte
  logical total.
- Counted unique NTFS file identities and confirmed hard-link relationships
  with `fsutil`: 300.235 GiB of paths represent about 152.958 GiB of unique
  allocated file data.
- Separated the 117.597 GiB bundle staging tree from its physical impact: all
  but about 0.002 GiB is shared with source runtime/model files.
- Measured removable smoke/build caches and SHA-256 verified 38 large duplicate
  content groups totaling 22.252 GiB of possible future deduplication.

Evidence:

- `docs/PORT-03-STORAGE-AUDIT.md`
- Ignored raw reports under `.scratch/port03-*-audit.json` and
  `.scratch/port03-content-duplicates.json`.

Still missing:

- No file was deleted or relinked. A separate footprint round must decide
  whether to retain old smoke evidence/build environments and how to dedupe
  immutable release runtimes safely.
- At this 2026-09-23 audit, PORT-03B remained the next acceptance round. The
  2026-09-26 planning revision below carries that gate into LIVELINK-08.

## Planning round: OBS LiveLink UX — 2026-09-26

Completed:

- Reconciled the requested Preferences installer, native OBS Tools dialog,
  source mixer, app channel controls, Recorder mode, trigger-ignore policy, MKV
  handoff, and synchronized timeline with the current v2 implementation.
- Defined one backend-owned multi-channel capture aggregate so the OBS LiveLink
  panel and Recorder cannot create duplicate recordings.
- Defined the protocol-v3 control plane, software time mapping, installation
  security boundary, staged migration, validation matrix, and eight bounded
  implementation rounds in `docs/OBS-LIVELINK-UX-PLAN.md`.
- Kept source roles and per-source diarization as the subsequent `OBS-10` round
  because a relay channel name is not a speaker identity.

Evidence:

- The plan is grounded in the current plugin, API, frontend, portability
  contract, OBS 32 headers, and public OBS plugin/frontend/source APIs.
- `git diff --check` passed; its output only contained existing line-ending
  conversion warnings.

Still missing:

- The owner/ChatGPT review must accept or amend the nine defaults in the plan.
- No `LIVELINK-*` code has been implemented. After approval, the exact next
  code round is `LIVELINK-01` (domain, protocol, time mapping, and state machine).
- `PORT-03B` remains unexecuted; the plan recommends folding its real-OBS clean
  machine gate into `LIVELINK-08` instead of certifying the manual v2 UX first.

## Planning revision: OBS LiveLink contract — 2026-09-26

Completed:

- Reconciled the LiveLink plan with the current OBS v2 plugin, PowerShell
  installer/build scripts, portable bundle inventory, project path contract,
  pinned OBS 32.2.2 source, and the installed OBS 32.2.2 executable.
- Replaced the incorrect staging-tree assumption with the actual current
  build-DLL source and distinct standard ProgramData and OBS-root destinations.
- Specified idle LiveLink versus owned app recording, bounded RAM pre-roll,
  0..N OBS video spans, pause causes, project-target leases, command epochs,
  causal event IDs, recovery, timing evidence, and per-user pairing secrets.
- Moved the unpassed physical-transfer/real-OBS gate from PORT-03B into
  LIVELINK-08. PORT-03B stays open; the plan stays awaiting owner review.

Evidence:

- `scripts/install-obs-plugin.ps1` installs the current DLL from
  `build/obs-plugin/RelWithDebInfo` into a ProgramData plugin-owned directory;
  `scripts/build-portable-bundle.ps1` carries that build artifact.
- OBS 32.2.2 source `libobs/obs-windows.c` and `frontend/widgets/OBSBasic.cpp`
  show OBS-root and ProgramData module paths; the installed `obs64.exe` reports
  version 32.2.2. No native dialog load has yet been proven.
- Documentation consistency review, `git diff --check`, and the read-only
  `engines/OmniVoice` cleanliness check were completed for this revision.

Still missing and why it matters:

- Owner/ChatGPT review of the revised defaults remains; the protocol must be
  agreed before native, API, and UI work share persistent IDs and timing data.
- LIVELINK-01..08 have not been implemented. Development OBS load evidence is
  required at LIVELINK-03; physical clean-machine acceptance is required at
  LIVELINK-08 before PORT-03B can be marked Complete.

Exact next code round after owner approval: `LIVELINK-01` — domain, protocol,
timing evidence, and causal state machine. This documentation round does not
start that code round.

## Planning clarification: OBS LiveLink audio archive — 2026-09-26

Completed:

- Selected audio-only Matroska (`source.mka`) as the proposed canonical output
  for one app recording, with one lossless FLAC/PCM track per OBS source.
- Kept durable per-source chunks for live capture/recovery and added a bounded
  `LIVELINK-07A` finalization round before the MKV handoff (`LIVELINK-07B`).
- Defined parent MKA/child track references, per-track STT, an embedded
  provenance attachment, and no default duplicate full source WAV archive.

Evidence:

- Matroska's official format documentation defines `.mka` as audio-only with
  multiple tracks and attachments; Xiph documents FLAC's lossless PCM encoding
  and recommends multiplexing many independent channels in a container.
- The bundled FFmpeg/FFprobe produced and read a two-track FLAC `.mka` with
  separate titles and an audio-only `.mka` carrying a JSON attachment. Test
  files were removed after inspection.
- `git diff --check` and a documentation consistency scan passed. The
  `engines/OmniVoice` checkout remained clean.

Still missing and why it matters:

- The current v2 backend still materializes one WAV source asset per OBS
  source. Multi-track Media Pool references, finalization/retry, and MKA
  artifact validation are planned for LIVELINK-01 and LIVELINK-07A; no code
  path yet creates the proposed canonical MKA.
- The plan remains awaiting owner review. Native OBS, clean-machine, and sync
  gates remain open.

Exact next code round after review: `LIVELINK-01` — domain, protocol, timing
evidence, state machine, and parent MKA/child track persistence contract.

## Planning clarification: OBS LiveLink STT audio — 2026-09-26

Completed:

- Clarified that each MKA track contains FLAC or PCM audio data, while WAV is
  a per-source analysis derivative rather than a file embedded as a track.
- Specified the existing STT derivative format, PCM16 mono 24 kHz, with
  independent extraction for every OBS source and direct PCM chunks for live STT.
- Added acceptance checks for PCM fallback tracks and per-track STT decoding.

Evidence:

- Current OBS live and MKV import adapters both create `analysis.wav` using
  FFmpeg `-ac 1 -ar 24000 -c:a pcm_s16le` for each source/track.
- Official Matroska codec mappings include FLAC and PCM audio tracks; Xiph
  documents FLAC as a lossless encoding of integer PCM.
- Documentation diff checks passed; no product runtime code was changed.

Still missing and why it matters:

- The proposed one-file MKA capture and track references are not implemented.
  The current v2 recorder still creates a source WAV per OBS source.

Exact next code round after plan review: `LIVELINK-01` — persistent track
reference and recording contract, followed by `LIVELINK-07A` for MKA archive.

## Round LIVELINK-01 — 2026-09-26

Completed:

- Added a serializable v3 domain model and pure reducer for connection,
  project-target lease, OBS video spans, app recording, independent pause
  causes, channel identity/tombstones and forwarding intervals.
- Kept capture stopped separate from archive ready; a verified MKA reference
  is required before the archive can claim readiness.
- Defined per-track MKA parent/child references and a read-only projection of
  legacy v2 WAV sessions. Existing v2 routes and project files were not changed.
- Froze lifecycle event sequence/idempotency, command epoch/ACK matching,
  sample and clock evidence, link-loss behavior, and pre-roll eviction policy.
- Recorded the domain decision in ADR 0012 and the v3 transport/persistence
  contract in OBS-LIVELINK-PROTOCOL-V3; updated the domain glossary.

Evidence:

- New reducer suite: 21 passed, including trigger policy changes, manual
  Pause with OBS Unpause, Ignore Stop across two spans, duplicate/missing
  events, stale ACK, source tombstone, v2 read projection and pre-roll limits.
- OBS-focused backend suite after the final model change: 35 passed.
- Full backend suite: 398 passed and 1 unrelated failure in TrainingProcess
  cancellation. The same test failed again in isolation. With that known
  failure deselected, the suite passed 401 tests before the final archive
  readiness and alias cases were added; the 35 OBS tests passed afterward.

Still missing and why it matters:

- No v3 HTTP route, native dialog, durable v3 writer, Media Pool child-track
  reader or MKA finalizer is connected yet. Users still experience the v2 OBS
  flow. Native pre-roll must be checked against the new oracle in a later
  plugin round.
- The pre-existing TrainingProcess cancellation test prevents a fully green
  backend suite and needs its own bounded investigation.

Exact next product round: `LIVELINK-02` — Preferences-based plugin install,
status, repair and OBS layout verification.

## Round LIVELINK-02 — 2026-09-26

Completed:

- Added a staged plugin package containing the built x64 DLL, OBS locale file,
  fixed standard/portable destination map and SHA-256 manifest. Native builds
  refresh the package and portable bundles include it.
- Added a local installer adapter and allowlisted API for status, install,
  update, repair, remove and Open OBS. It validates the OBS root, portable
  marker and package hashes before any write; installed files are rehashed.
- Added rollback for partial writes, distinct rules for fresh install versus
  update/repair/remove while OBS runs, and a UAC fallback after a normal write
  is denied. Per-user install identity/token/launcher metadata stay outside
  the machine-wide binary path; Repair preserves them. Remove only deletes
  pairing metadata when the user explicitly selects that option.
- Added the OBS LiveLink card to Preferences with folder selection, status,
  action controls, installed version/hash state and restart guidance. The
  standalone batch installer now calls the same adapter.

Evidence:

- Installer unit/API/CLI tests: 8 passed (standard, portable, tamper, rollback,
  running OBS, update and API response without token).
- Preferences component tests: 2 passed. Full frontend suite: 300 passed;
  typecheck and production build passed.
- Full backend suite: 409 passed, one pre-existing TrainingProcess cancellation
  test failed at the same `runner.is_alive()` assertion recorded in L1.
- Packager emitted `build/obs-plugin-package/manifest.json`; the development
  machine's OBS executable version probe returned `32.2.2.0`.
- Portable `Capture` audit: 5 passed, 0 failed, including package DLL/locale
  hash checks. Bundle manifest now lists those files as critical artifacts.

Still missing and why it matters:

- Windows UAC prompt, actual plugin load from the new package, and copied-bundle
  installation on another machine have not been exercised. These require an
  interactive/clean Windows acceptance run; code-level tests cannot certify
  OBS loaded the native DLL. This gate remains with LIVELINK-08.
- The generated per-user install identity is preparatory. The current v2
  native plugin still reads its old manual `config.json`; LIVELINK-03 must
  consume the new pairing state and provide the OBS Tools dialog before the
  user flow is automatic.

Exact next product round: `LIVELINK-03` — native Tools dialog, Open App and
automatic pairing with a real OBS load test.

## Round LIVELINK-03 — 2026-09-26

Completed:

- Registered Tools > Pro4Bro Voice Manipulator LiveLink independently of the
  legacy v2 `config.json`. Added an OBS-owned modeless dialog with connection,
  active-project, OBS recording state and Open App controls. The old parser
  remains a v2 fallback.
- Added authenticated v3 hello/heartbeat with per-user install identity and
  token, a process connection epoch, 15-second connection expiry and a
  single-owner 15-second project target lease. WorkspaceShell acquires and
  renews the lease while a project is open; leaving releases it. Competing
  tabs cannot overwrite the current owner.
- Open App checks both the API and frontend; it launches the installer-recorded
  local `start-pro4bro.bat` when either is unavailable, then opens the local UI.
- Built plugin version 0.2.0 and refreshed the package manifest. OBS 32.2.2
  executable and matching source checkout `ba2f32bdf791005443988a4955e963663e16b1ed`
  were used. The installed Qt6Widgets runtime reports 6.11.1.0. ADR 0013
  records the Windows dialog choice for this round.

Evidence:

- Native x64 build succeeded. Actual OBS 32.2.2 loaded the DLL from
  `build/obs-plugin/RelWithDebInfo` through `OBS_PLUGINS_PATH`. Windows UI
  Automation found the Tools entry, opened the dialog, read Connected, Idle and
  No active project, observed the leased project name after heartbeat, and
  reopened the dialog after closing it.
- With the app stopped, the dialog's Open App button brought up API port
  18120 and frontend port 18119; both returned HTTP 200. The plugin then
  reconnected. The smoke test used an existing project without changing its
  project files and released its lease.
- Backend: 415 passed, 2 existing deprecation warnings. Frontend: 301 passed;
  typecheck and production build passed. `git diff --check` passed.

Still missing and why it matters:

- The dialog uses a Windows-owned window because this checkout has OBS' Qt
  runtime but no Qt SDK. The UX plan originally specified Qt Widgets; revisit
  that choice before implementing the larger source mixer in LIVELINK-04.
- The new DLL loaded from the build folder alongside the older installed DLL.
  The installed package still reports damaged and its Repair/UAC path did not
  receive Administrator consent in this run. Do not record with both copies
  loaded: both would receive the legacy v2 OBS recording events. Installed
  package and clean-machine acceptance remain LIVELINK-08 gates.
- Source selection, meter, alias and mapping persistence are LIVELINK-04.
  The v3 connection does not yet forward audio; v2 capture still depends on
  its old config fallback. No MKA, MKV final ingest or final STT/SRT is claimed.

Exact next product round: `LIVELINK-04` — native source inventory, meter,
forward selection, alias and mapping persistence.

## Round LIVELINK-04 — 2026-09-26

Completed:

- Added a plugin-owned Win32 mixer with five reusable visible strips and a
  scrollbar for larger source lists. Inventory uses OBS' public source UUID,
  audio-active, active, pinned and hidden state so the default list matches
  the OBS Audio Mixer. It refreshes add/remove/rename and scene collection
  changes while the dialog is open.
- Added `obs_volmeter` peak callbacks with a 200 ms UI refresh. Callback work
  is atomic-only; meters detach when a source disappears, the collection
  changes or the dialog closes.
- Added per-scene-collection mapping in the plugin's local config with stable
  channel IDs, source UUIDs, slots, native names, forward flags, unique aliases
  and alias revisions. Missing selected sources remain visible; slots are
  reserved rather than recycled while recording ownership is not yet wired.
  The v3 data plane does not consume the forward selection until LIVELINK-05.
- Built and packaged plugin version 0.3.0. The legacy v2 `config.json` path
  remains a migration fallback.

Evidence:

- Native x64 build succeeded against OBS 32.2.2 headers/imports; package
  manifest reports plugin version 0.3.0.
- Actual OBS 32.2.2 loaded the build DLL. Windows UI Automation observed five
  mixer strips matching the five visible OBS Audio Mixer sources. An initial
  all-audio enumeration showed ten; the active/hidden filter corrected it.
- A quiet 48 kHz stereo PCM16 tone played through Desktop Audio moved the
  plugin meter from 0 to 6 and back to 0. A forward toggle and alias edit were
  saved; a duplicate alias was rejected without changing the stored mapping.
- A fresh mapping held five distinct source/channel IDs, and reopening OBS
  preserved all five IDs and strip labels. OBS exited normally after the test.
- Portable `Capture` audit after the final package rebuild: 5 passed, 0 failed.
  `git diff --check` passed; `engines/OmniVoice` remained clean.

Still missing and why it matters:

- Live add/remove/rename, scene collection switch and a 20-source list have
  code paths but no controlled OBS runtime acceptance evidence yet. These
  cases must be exercised before calling the full L4 source matrix complete.
- The forward flag is local configuration only. LIVELINK-05 must synchronize
  inventory/meter/selection with the API and app, then ACK applied state.
- The installed copy is still older/damaged on this workstation. Only the
  build-folder DLL was exercised; installer/clean-machine acceptance stays at
  LIVELINK-08. Do not record with both DLL copies loaded.

Exact next product round: `LIVELINK-05` — v3 channel synchronization and app
mixer, including controlled source-change acceptance carried from L4.

## Round LIVELINK-05 — 2026-09-26

Completed:

- Added v3 channel inventory to authenticated hello/heartbeat, including stable
  channel/source IDs, alias revision, slot, meter peak, OBS mix sample rate,
  observed channel count, mute and missing state. The plugin keeps its control
  worker active while the native dialog is hidden.
- Added per-channel Forward commands through an epoch/revision-scoped long
  poll, idempotent ACK, plugin monotonic applied boundary, desired/applied
  separation and a full snapshot on reconnect. Stale ACKs and invalid source
  identities are rejected. Command queues clear when an epoch is invalidated.
- Added status SSE with a polling fallback and the app LiveLink mixer with
  source strips, meters and per-channel Forward toggles. An Idle toggle does
  not create an app recording.
- Built and packaged plugin version 0.4.0. The v2 capture path remains for
  existing installations; v3 audio capture is a later round.

Evidence:

- Backend suite: 417 passed, two dependency deprecation warnings. Frontend:
  40 files/302 tests passed, typecheck and production build passed. Native x64
  build succeeded against OBS 32.2.2.
- Development OBS 32.2.2 loaded the DLL and reported five channels while the
  dialog was hidden. The API reflected alias edits and a real Desktop Audio
  meter signal. The final build reported 48 kHz and OBS mute/channel metadata.
- Real localhost Forward On and Off returned applied ACKs in 226 ms and
  230 ms, with plugin monotonic boundaries; OBS remained Idle. An earlier
  API-kill/restart exercise produced a new server/connection epoch, restored
  all five channels and accepted subsequent On/Off commands without an OBS
  crash. The final Forward state was Off.
- Capture portability audit: 5 passed, 0 failed. `git diff --check` passed;
  `engines/OmniVoice` remained clean. Test OBS and API processes exited.

Still missing and why it matters:

- The controlled live add/remove/scene-switch and 20-source matrix from L4 is
  still open. Its code paths exist, but mapping stability under those changes
  needs runtime acceptance before claiming the full source matrix.
- Applied sample index, `user-disabled` recording intervals and audio chunk
  reconnect are L6 data-plane work; the current ACK has monotonic time only.
  No v3 recording-quality or timeline claim follows from Idle toggles.
- Installed-package/UAC and clean-machine acceptance remain at L8. This
  workstation's build-folder DLL was used for the OBS runtime check.

Exact next product round: `LIVELINK-06` — OBS LiveLink recorder, trigger/ignore
matrix and recording-time channel intervals. Carry the source-change matrix
into runtime acceptance before claiming L4/L5 complete end to end.

## Round LIVELINK-06 — 2026-09-27

Completed:

- Added an OBS LiveLink source in Recorder with app Start/Pause/Resume/Stop,
  per-channel status, project recording history and persisted multi-select
  Ignore Start/Pause/Stop policy. The browser recorder remains available.
- Connected OBS lifecycle events and applied app/channel commands to the v3
  state reducer. Manual and OBS pause causes, 0..N video spans, recording-time
  `user-disabled` intervals and source sample boundaries persist in a
  project-owned journal.
- Added bounded native per-source PCM capture/upload with SHA-256 and durable
  chunk ACKs. Finalization retains original chunks, builds transitional WAV
  stems and Media Pool assets, and classifies missing sample ranges. A stem is
  reported only after its files exist. The MKA parent archive belongs to L7A.
- Fixed a heartbeat/Forward ACK race discovered during the real OBS test: the
  disabled interval is now opened at ACK even if a heartbeat already updated
  the desired flag.

Evidence:

- Backend: 422 tests passed, including the Forward ACK race regression.
  Frontend: 304 passed;
  typecheck and Vite production build passed. Native DLL build passed.
- Development OBS 32.2.2 produced a 48 kHz stereo, 6.421-second WAV with
  nonzero audio peak; one 10 ms transport gap remained in that run. A later
  two-source recording produced two separate Media Pool stems with zero gaps.
- A real Forward Off/On while recording yielded a `user-disabled` interval
  from sample 13,102,080 to 13,182,720; the matching audio gap was classified
  `user-disabled`, not transport. Manual Pause/Resume/Stop and automatic stem
  finalization also ran against OBS. Capture portability: 5 passed, 0 failed.
- `git diff --check` passed and `engines/OmniVoice` remained clean.

Still missing and why it matters:

- The physical OBS Start/Pause/Resume/Stop and Ignore matrix, including Stop
  then Start across two video spans, has reducer and runtime tests but has not
  yet been exercised as an OBS recording. It must pass before claiming the
  automatic trigger behavior end to end.
- The L4/L5 live source-change/20-source matrix and installed-package/UAC
  gate remain open; the development DLL and current five-source collection
  do not prove either environment.
- Source PCM remains as chunks plus transitional WAV stems. One verified MKA
  parent archive per app recording and MKV handoff are L7A/L7B work.

Exact next product round: `LIVELINK-07A` — build and verify the audio-only MKA
parent archive from the retained per-source PCM; carry the physical OBS trigger
matrix into L8 end-to-end acceptance.

## Round LIVELINK-07A — 2026-09-27

Completed:

- Finalization now creates one project-relative `source.mka` with one FLAC
  track per OBS source. If FLAC encoding or verification fails, it retries
  lossless PCM16 tracks. Stable per-source Matroska TrackUIDs and stream
  indexes match the embedded `pro4bro-session.json` mapping, clock, video
  span and gap evidence; attachment bytes are read back and verified.
- Every audio track is decoded and compared byte-for-byte with the captured
  PCM stem before archive publication. Its own stream is decoded to a PCM16
  mono 24 kHz analysis WAV. A Media Pool parent MKA and child assets carry
  parent asset ID, stream index and TrackUID; the child uses the analysis WAV
  for playback/STT. Full source WAVs are removed after successful archive
  publication. Original hashed chunks remain for recovery.
- Added project-scoped archive retry from retained chunks without an active
  OBS connection. A corrupt chunk fails closed; a repaired chunk can be
  retried. A ready archive has a journal SHA-256 for idempotent retry.
  Channel history survives source disappearance before Stop. V2 sessions
  continue through their existing WAV reader.

Evidence:

- Archive tests pass for 1, 2 and 5 independently addressed sources, one
  forced PCM fallback, a source added then removed during recording, corrupted
  chunk rejection/retry, and copied-project Open Existing with child analysis
  paths. Actual FFmpeg/FFprobe performs mux, attachment extraction and
  per-track audio verification in these tests.
- The local retry API rebuilt a two-track MKA from the prior development OBS
  recording `4285b022-34ac-4c59-8b35-0a6d51a02253`. FFprobe reported two
  audio streams and one attachment; the journal SHA-256 matched the file.
- Backend: 426 passed, two existing dependency deprecation warnings.
  Frontend: 305 passed; typecheck and Vite production build passed. Capture
  portability: 5 passed, 0 failed. `git diff --check` passed and
  `engines/OmniVoice` remained clean.

Still missing and why it matters:

- Five simultaneous sources, source changes and the OBS trigger/Ignore matrix
  have not been exercised together in a physical OBS recording. The automated
  archive tests use real FFmpeg but synthetic source PCM. L8 must measure
  those runtime paths and timing before an end-to-end quality claim.
- OBS MKV locator/import and association with one or more video spans are
  L7B work. The MKA is audio-only and has no imported video counterpart yet.
- A Media Pool child currently uses its 24 kHz analysis WAV for playback and
  STT while its lossless source is addressed through the parent MKA reference.
  Export of an individual original-rate source track has no dedicated UI yet.

## Round LIVELINK-07B — 2026-09-27

Completed:

- Added a machine-local recording-folder preference controlled from the
  Recorder. The OBS plugin reports its configured output folder when enabled
  and sends `obs_frontend_get_last_recording()` with the matching span after
  OBS Stop.
- Stored exact locators under machine data keyed by OBS install and span IDs;
  portable recording journals retain only the video span, imported asset ID,
  and content SHA-256. When no exact locator exists, import can use the latest
  completed MKV from the connected folder.
- Added per-span Import MKV from OBS and Browse flows. The API rejects active
  spans, missing/empty files, changed files during import, non-video MKVs, and
  attempts to replace an already linked asset. Project imports are cached under
  relative `assets/media/...` paths; re-importing the same span returns its
  existing asset.
- Added coverage for two OBS spans in one app recording, exact filename-to-span
  association, project journal path hygiene, duplicate asset linking, and the
  Recorder folder/import/Browse controls.

Evidence:

- Backend: 428 passed, two existing dependency deprecation warnings.
- Frontend: 307 tests passed; TypeScript typecheck and production build passed.
- Native OBS plugin built successfully against the pinned OBS 32.2.2 headers;
  only existing upstream anonymous-struct warnings were emitted.
- `git diff --check` passed; output contains pre-existing line-ending warnings.

Still missing and why it matters:

- A physical OBS run has not yet proven correct exact MKV handoff for closely
  named recordings, active-file rejection, or two spans attached to one app
  recording. Project move/reconnect and actual video playback also remain
  physical acceptance checks. These gates matter because fixtures cannot prove
  OBS finalization timing or a user's moved project can resolve the asset.
- Timestamp reconciliation, five-source capture, and clean-machine packaging
  remain for LIVELINK-08.

Exact next product round: `LIVELINK-08` — physical OBS matrix, time
reconciliation, portability, and clean-machine acceptance.

## Round LIVELINK-08 — 2026-09-28 (physical acceptance checkpoint)

Verified in this checkpoint:

- Repaired the installed standard OBS plugin from the repository package while
  preserving its per-user pairing data. The installer reports plugin 0.5.0,
  OBS 32.2.2.0, `pairingReady: true`, and `state: installed`.
- Closed OBS through its normal window close path, enabled the local OBS
  WebSocket for the test, and confirmed a listener on port 4455. OBS loaded the
  plugin and connected to the API with the real `Pro4Bro-OBS01` collection and
  three inventoried channels.
- Generated a 14-second lossless A/V fixture with four paired audio pulses and
  white video flashes at 1, 4, 8, and 12 seconds. The first physical OBS
  Start/Stop produced a 48 kHz stereo MKA track (721,487 frames, 87 chunks,
  zero classified gaps) and a completed OBS MKV linked to its video span.
- Imported that MKV into the temporary acceptance project. Comparing the four
  sample-clock pulse onsets with the corresponding decoded MKV flash PTS gave
  signed offsets of -35 ms for each cue; all four paired cues meet the <=200 ms
  gate for this short fixture.
- Repeated Start/Stop twice in the same OBS process. Both runs produced a
  completed MKV and video span, and the MKV audio tracks contain the fixture
  sound, but LiveLink retained no PCM chunks and produced no MKA. Archive retry
  returned 503, `OBS source stems are missing; rebuild them from retained
  chunks.` This leaves successive-record audio capture unaccepted.
- Restored the original OBS profile and WebSocket config byte-for-byte, turned
  LiveLink forwarding off, relaunched OBS, and confirmed it reconnected idle.

Not verified in this checkpoint:

- The short synthetic fixture does not prove a 30-minute spoken recording.
  Its first run also contained an extra audio region at 13.765-14.02 seconds
  with no matching video flash, so the no-unexplained-audio-drop/duplicate gate
  remains open even though the four planned cue pairs passed.
- The 1/2/5-source, pause/resume, Ignore, API-restart, source-loss/restore and
  scene-switch matrix remains open. No second Windows machine was available for
  transfer, clean install, and uninstall/repair acceptance.

The passing cue measurement applies only to the first short recording on this
development machine. Fix and verify LiveLink audio capture across successive
OBS recordings before extending the physical matrix. Keep LIVELINK-08 and
PORT-03B open until the 30-minute recording/timing matrix and a
different-Windows-machine portable install pass with retained artifacts.

Historical next-step note from the 2026-09-28 physical checkpoint: repair
LiveLink PCM capture on the second recording before extending the matrix.

## Planning revision: LIVELINK-08 automatic round sequence — 2026-09-28

The owner will inspect only after the complete observable path is implemented:
OBS/app Record state, per-channel indicators and waveform, automatic live STT,
Script rows, overlap markers, and the branded plugin dialog. Split the remaining
work into `LIVELINK-08A` through `08J` in the exact Queue order above. The
scoped objectives and objective evidence for each are in
`docs/OBS-LIVELINK-MULTICHANNEL-UX-PLAN.md`. This is a planning change; it does
not complete any product round or invalidate prior physical measurements.

One invocation completes and verifies one bounded round, logs its evidence and
exact successor, and stops. The next automated invocation continues without
intermediate owner UAT or approval. `LIVELINK-08` becomes the final integration
gate **after** `08J`; its 30-minute/1-2-5-source/time and clean-machine criteria
stay open until actual artifacts and measurements exist. If another Windows
machine is unavailable, complete all local/code rounds and local integration
checks, report that external gate once at the end, and keep `PORT-03B` open.

Exact next product round: `LIVELINK-08A` — repair repeated-record PCM capture
and prove three consecutive OBS recordings have matching chunk/MKA/MKV artifacts.

### LIVELINK-08A investigation and API repair — 2026-09-28 (physical gate open)

The three actual OBS Start/Stop fixture journals at 00:05, 00:12 and 00:17 are
`7e78c240-9a9b-5c1c-becf-539072e7b5d3`,
`2a187eac-5fcc-5b72-baf6-7d8ce274fc29`, and
`b2a4cf53-0ddc-5847-a5d1-519768cafc77`. Each has an OBS video span and
matching MKV. The first has 87 durable PCM chunks and a ready MKA; the next
two have zero chunks and no MKA. The earlier checkpoint accidentally cited
three later 09:38–09:41 sessions; those are separate runs and do not establish
this round's consecutive-OBS result.

Root cause: the first MKA has TrackUID `12738617874486415437`. Beginning at
00:05:52, OBS logs `obs_data_create_from_json` failures for exactly this number
on every plugin heartbeat. The UID is valid unsigned Matroska metadata but
exceeds the signed 64-bit integer limit of OBS's JSON parser. The plugin then
cannot read the snapshot containing the next app `recordingId`, so it sends no
PCM for the second and third OBS sessions although the API records video spans.

The API now omits nested `sourceArchive` only from OBS hello/heartbeat recent
recording summaries. It keeps recording ID, timing, status and video span IDs
there, while app status, project journal and MKA keep the exact full TrackUID.
Regression coverage uses the UID above and verifies the plugin snapshot after
archive and API runtime reload, then checks that a later OBS Start supplies a
new app recording ID. The new test failed before the fix and passed after it.
An additional HTTP integration test now checks the real `/hello` and
`/heartbeat` route responses after the large UID is persisted, confirms app
`/status` retains that UID, and verifies the next OBS Start reaches a distinct
app recording. Full backend suite: 430 passed, two existing dependency
deprecation warnings.
`node --check` for the physical harness and `git diff --check` passed (the
repository's existing line-ending warnings remain).

The local `.scratch/livelink08-acceptance/repeated-recording.mjs` harness now
renews the project lease, restores OBS input/recording directory on failure,
and requires PCM/MKA/MKV per OBS session. Its three-session physical run is
still open. OBS started with WebSocket, but the first attempt lost the temporary
API process before recording; a later unattended run was rejected by the
environment policy. OBS WebSocket configuration was restored to its original
disabled state and OBS exited. The previous forced process cleanup was also
rejected by policy; that stale process has since exited. No three-session pass
or advance to `08B` is claimed.
At the final status check the standalone API answered `/api/health` with HTTP
200, OBS was closed, and WebSocket was disabled. The local frontend port 18119
was not listening; automatic approval review also rejected the attempted
controller restart with the generic reason `blocked by policy`.

### LIVELINK-08A physical acceptance and OBS lifecycle repair — 2026-09-28

The first live retest found two fixture setup problems: OBS had its `Untitled`
scene collection selected, and the fixture channels had forwarding off. That
attempt did not establish audio capture. Switching collections in the old
installed plugin stalled OBS during scene cleanup. OBS logged retained sources;
the v3 capture and mixer retained OBS source references across collection
changes. The plugin now detaches audio callbacks and releases those references
on collection changing/cleanup, resumes on changed, and stops before OBS exit.
The native plugin built and the hash-checked package was repaired into the
standard OBS 32.2.2 installation. A later switch back to `Untitled` completed
with two callback-detach log entries, no retained-source warning, and OBS still
responding. The owner's original scene collection and forward choices were
restored; OBS remained open and idle.

The corrected physical harness explicitly turns on `OBS01 Mic` forwarding,
waits for applied ACK, and restores its previous state. In one OBS process it
then performed three consecutive Start/Stop cycles. Project journals, PCM
chunks, a one-track FLAC MKA, and the matching MKV/video span were present for
each:

| Recording ID | PCM chunks | Frames | Gap intervals | MKA bytes | MKV bytes | Journal |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `5b9a38b0-8534-57cc-8a85-cec18bf49f34` | 65 | 815040 | 0 | 491912 | 2242863 | ready |
| `51a76737-f218-516e-926c-9ae13966f0e2` | 70 | 856800 | 0 | 528945 | 2333011 | ready |
| `5764954a-271b-5070-82d4-c5be0cbe89c6` | 65 | 824640 | 0 | 488858 | 2267130 | ready |

The first MKA was independently probed as 48 kHz stereo FLAC, duration
16.284 s. The package install reported `installed`, matching OBS 32.2.2;
`node --check` passed for both local harness scripts. The API regression/full
backend suite from the earlier 08A fix remains 430 passed. Windows recorded
one earlier OBS `obs.dll` access violation at 11:42; the available event/logs
cannot prove which component caused the owner's error popups. No new crash
occurred in the three-record run or scene switch.

`LIVELINK-08A` is complete for its repeated-record acceptance. This only
proved one forwarded live source; multi-source and visible per-channel Record,
waveform, and transcript acceptance remains in the following rounds and final
`LIVELINK-08` gate.

Exact next product round: `LIVELINK-08B` — expose per-channel evidence that
distinguishes OBS Record, app recording, applied forwarding, and acknowledged
PCM, including stall/gap transitions.

### LIVELINK-08B per-channel capture evidence — 2026-09-28

The app v3 `/status` and SSE `/events` snapshots now include a `capture`
projection on every OBS channel. It carries recording/project ownership,
`idle`, `pending`, `receiving`, `stalled`, `paused`, `disabled`, `missing`,
`forward-pending` or `disconnected` state; durable chunk count, sequence and
sample-index high-water; UTC receipt time of the last persisted PCM; and
positive sample-index discontinuity count/frames. `receiving` requires a
durable chunk from the **current** app recording in the last three seconds.
OBS Record, meter activity and Forward ACK alone cannot make it `receiving`.
Silent PCM counts because it is still persisted audio. UTC is only a stall
diagnostic; sample index and OBS monotonic time remain the media clock.

Each v3 chunk metadata file now saves its server UTC receipt time. Every 16
chunks per channel, a project-relative evidence checkpoint limits API restart
work; recovery verifies its last chunk pair and replays later metadata. The
app's TypeScript contract includes the projection. OBS hello/heartbeat omit
it so the OBS JSON parser sees no new large evidence payload. Existing
recordings without `startedAtUtc` remain readable, but a pre-first-chunk
recording from that older format shows `stalled` rather than an unproven
`receiving` state after restart.

Backend tests cover OBS Start, Ignore Start, manual ACK, Forward pending/ACK,
disabled and missing sources, pause, disconnected state, silent PCM, duplicate
ACK, sample gap, stopped capture, second recording ID, and a fresh API
connection rebuilding high-water from the project checkpoint and tail chunks.
The endpoint test confirms app status includes `capture` while plugin hello
does not. Verification: backend **433 passed** (two existing deprecation
warnings); frontend **307 passed**, TypeScript typecheck and Vite build passed;
`git diff --check` reported no whitespace errors (existing line-ending notices
only). No plugin binary change or live OBS recording was required for this API
contract round. The live channel indicator and visual acceptance remain 08C;
the broader two/five-source and sync matrix remains the final LIVELINK-08 gate.

### LIVELINK-08C Recorder and truthful REC — 2026-09-28

OBS LiveLink in Recorder now retains the normal Record button, changes it to
Stop during app recording, and exposes Pause/Resume. A channel row is 28 px
high at the tested font scale, with the channel alias on the left, native OBS
source and capture status on the right, and a 4 px meter. Historical sessions
scroll within 160 px so controls remain reachable. The red pulsing dot and
visible `REC` appear only when the 08B status reports durable PCM receipt for
the current app recording/project. Idle, pending, forward-pending, paused,
stalled, disabled, missing and disconnected have static gray dots and distinct
labels. Reduced-motion preference suppresses the pulse while retaining `REC`.

Verification: frontend **318 passed**, TypeScript typecheck and Vite build
passed. Component tests cover state mapping, stale paused evidence, manual
Record/Pause/Resume and Ignore Start. In the built app at 1600 and 1100 px,
five channel rows and the Record control stayed visible in the right panel;
screenshots are `.scratch/livelink08c-view-wide.png` and
`.scratch/livelink08c-view-narrow.png`. The development OBS/API test confirmed
OBS Start switched the app button to Stop: four channels had persisted PCM and
showed red `REC`, while a fifth channel with no PCM showed gray `PCM stalled`.
OBS Stop returned all five to gray Idle. A separate OBS Start with Ignore
Start enabled left app recording empty and all channels gray; the trigger
policy was restored afterward. This does not complete live per-channel
waveforms or transcription, nor the final LIVELINK-08 source matrix.

Exact next product round: `LIVELINK-08D` — build sample-timed per-channel
waveform envelopes from acknowledged PCM for live Timeline display.

### LIVELINK-08D Per-channel waveform feed — 2026-09-28

Each durable v3 PCM chunk now writes a project-owned 50 ms min/max/peak
sidecar keyed by recording/channel/sequence before ACK. A bounded waveform
route returns at most 600 extrema points in a window of at most 120 seconds;
live delta requests process at most 32 chunk sequences. Its source sample
range and recording-relative frame range remain distinct. A null peak means
no received live PCM, while zero means received silence. The existing status
SSE reports the durable sequence after sidecar publication; a web feed helper
uses that watermark, fetches only changed channel windows, and falls back to
two-second status polling after SSE disconnect. Raw PCM never enters the web
response. After Stop, the same route can regenerate 10-second envelope blocks
from each matching MKA track, with project-relative portable cache files. ADR
0014 and the v3 protocol document fix this interface.

Verification: backend **435 passed**, frontend **320 passed**, TypeScript
typecheck and Vite build passed. Tests cover two sources with different peaks,
silence versus missing PCM, pause, disabled source, sample gap, fresh reader,
32-chunk cursor catch-up, HTTP validation, MKA rebuild, and moved-project
reopen. A prior physical four-track OBS archive was decoded independently for
the first second: each envelope peak matched its MKA PCM track exactly
(`0`, `1411`, `277`, `0`); evidence is
`.scratch/livelink08d-real-check.json`. The sidecar and response limits bound
memory/payload; a long 20-channel runtime performance run is still part of
the final LIVELINK-08 matrix. The development API was restarted on port
18120; OBS reconnected, and the live HTTP waveform route returned 20 MKA
points with peak `1411` for the selected physical channel.

The waveform is a feed, not yet a Timeline lane or live transcription.
Archive padding is decoded as zero; the existing recording journal identifies
pause, disabled and transport-gap intervals for Timeline presentation.

Exact next product round: `LIVELINK-08E` — render one live and reopened
Timeline waveform for every forwarded OBS channel using this feed and its
recorded gap/interval provenance.

### LIVELINK-08E Per-channel Timeline waveforms — 2026-09-28

The OBS LiveLink capture source now opens a dedicated multi-channel Timeline.
Every forwarded channel has its own labelled waveform lane under one ruler and
playhead. Live lanes read the durable 08D envelope feed; received silence is
drawn as a flat line, while missing PCM, capture pauses, channel intervals and
archive gaps are marked at their recording-relative positions. A 60-second
live window follows the playhead. After Stop, the Timeline reopens each MKA
child track, keeps the source label and sample clock, and lets the user choose
a channel and seek/play its WAV. Recorder history can open all channels of a
selected session in this Timeline.

Verification: backend **435 passed** (two existing deprecation warnings),
frontend **323 passed**, TypeScript typecheck and Vite build passed; diff hygiene
found no whitespace errors. The app's Record produced a 42.55-second
four-track MKA; live Channel 2 and 3 had distinct waveforms, while a fifth
source with no PCM stayed visibly pending. A separate physical OBS Start/Stop
produced a 15.41-second four-track MKA and matching MKV. Its reopened Channel
2/3 envelopes had peaks `3091`/`1708` at 48 kHz, with distinct rendered paths;
selecting Channel 2 loaded its own WAV and seeking moved playback to 00:10.
The two recording IDs and channel/track/gap evidence are preserved in
`.scratch/livelink08e-real-check.json`.

This completes the 08E waveform and replay slice. Column/layer layouts and
per-channel gain/level controls belong to 08F; automatic per-channel live
transcription follows in 08G. The owner-facing acceptance remains the final
LIVELINK-08 matrix after those rounds.

Exact next product round: `LIVELINK-08F` — add column/layer Timeline layouts
with per-channel gain and level controls.

### LIVELINK-08F Column/layer Timeline and channel controls — 2026-09-28

The OBS Timeline now has CỘT/LAYER controls immediately before a working
MARK IN button. Columns place each source waveform, ruler, playhead and its
horizontal gain/level controls side by side in a horizontally scrolling area.
Layers share one ruler/playhead and scroll vertically; each waveform is 32 px
high, about 62% of the previous 52 px lane waveform. The OBS Timeline uses a
larger bottom workspace region so a column's controls remain visible at the
tested 720 px viewport height. Zoom steps show their actual visible span and
skip ineffective steps for short recordings. Layout and zoom switches retain
the selected channel, playhead and per-channel gain.

Gain is a 0–200% preview control applied through Web Audio to the chosen WAV
playback in Pro4Bro; browsers without Web Audio can attenuate only to 100%
and show an error if amplification is requested. The level bar uses OBS source
meter data live and unmodified MKA waveform peaks at the playback position
after Stop. Tooltips state that gain
does not alter the OBS fader or original PCM/MKA. No gain value is written to
the project, archive or OBS; controls start at 100% when a project is opened.

Verification: frontend **330 passed** across 43 test files,
TypeScript typecheck and Vite build passed, diff hygiene passed. Component
tests render 1, 2, 5 and 20 live channels in both layouts and check independent
gain, source level, Web Audio boost/cleanup, Mark In order, zoom and playhead
continuity. In the built app, the physical four-track OBS archive showed four
columns with gain/level
below each waveform at 1280×720 and 900×720. At 900 px the horizontal scroll
reached the fourth column; at 1280 px the layer viewport scrolled to the last
lane. A keyboard Home action set Channel 2 preview gain to 0%, switching to
layers kept it, and it was restored to 100%. On the real archive, the silent
Channel 1 track also started and paused with preview gain at 200%, with no
browser error; gain was restored to 100%. Physical 20-source rendering and
latency measurement remain in the final LIVELINK-08 matrix.

Exact next product round: `LIVELINK-08G` — start separate live STT queues from
durable v3 PCM for each OBS channel and emit channel-owned draft events.

### LIVELINK-08G Per-channel live STT events — 2026-09-28

The v3 PCM ingest route now offers each newly durable, nonduplicate chunk to
an automatic bounded STT queue keyed by recording and channel. Studio live
sessions are independent per utterance/channel, with source-sample start/end
and OBS-clock recording-relative seconds,
partial/final revisions, lag, error and explicit segment-level timing trust.
Events persist as project-owned JSONL and are available through a recording
transcript-events API with a global revision cursor for reconnect. Alias
changes update later event labels without changing channel/source identity.
STT failure and queue overflow report an event while PCM ACK and source
archive remain authoritative. ADR 0015 records the durable event contract.

Verification: backend **438 passed**, including two-channel partial/final,
alias, restart/torn-tail recovery, slow recognizer, queue saturation and
recognizer error tests. A real Studio `tiny` recognizer run on a 14.82-second
spoken WAV generated nine events per channel, with text in partial events and
separate final text/sample bounds for both channels; no recognizer errors.
The recognizer duplicated a phrase in this draft, confirming that it is not
final subtitle text. The development API was restarted on port 18120; OpenAPI
now lists the transcript-events route and startup completed. OBS was
disconnected and no app recording was active at restart. `git diff --check`
passed (line-ending warnings only).
The physical OBS two-speech-source, in-recording UI check remains in the
final LIVELINK-08 matrix. LIVELINK-08H must render channel-owned Script rows
and Timeline captions; those views do not yet consume this feed.

Exact next product round: `LIVELINK-08H` — render live Script rows in source
start order and put each channel's draft caption on its Timeline lane.

### LIVELINK-08H Channel-owned live Script and captions — 2026-09-28

The first voiced PCM chunk now emits a `listening` event before its recognizer
window completes. The web polls revisioned transcript events for the selected
OBS recording, merges later partial/final revisions into the same utterance
row, and orders rows by source start time. Script identifies each row by OBS
channel, keeps A's row as B begins, and lets a row select its source track and
recording-relative time. Each OBS Timeline lane shows its own caption and
utterance span in both Layer and Cột layouts. The draft UI explicitly labels
segment-level timing and does not treat a channel as a verified speaker.

Verification: frontend **335 passed** across 45 files, typecheck and build
passed; backend **438 passed**. A temporary six-event A→B→A journal on an
existing four-track OBS archive was loaded into the real app. Script displayed
three rows in start order; selecting B moved to Channel 2 at 00:02, where A
and B captions were visible simultaneously. Both Layer and Cột displayed the
source captions, gain and level. The temporary journal was removed and the
managed API/Studio restarted. This verifies rendering against an archived OBS
recording; live physical OBS speech and transcription latency remain for the
final LIVELINK-08 matrix.

Exact next product round: `LIVELINK-08I` — mark cross-channel overlap at its
source time and color only the text spoken during overlap for review.

### LIVELINK-08I Cross-channel overlap review — 2026-09-28

Script and Timeline now derive half-open intersections from the recording's
OBS monotonic seconds for distinct channel IDs. A valid source sample range
and segment timing trust are required; a shared boundary, another recording,
and same-channel utterances do not create a cross-channel marker. Multiple
simultaneous peers merge into one review interval per utterance. No inferred
word times or speaker identities are stored. While the playhead is inside an
intersection, both channels' draft text is red; B returns to normal when the
playhead reaches A's end. Script buttons and visible markers on each Timeline
lane show the exact segment interval. On a ready archive, pressing either
marker selects its source WAV, starts at the intersection, and pauses at its
end. While recording, markers still locate the span but playback requires the
archive after Stop.

Verification: frontend **343 passed** across 46 files, typecheck and build
passed; backend **438 passed** (two existing dependency deprecations). Unit
tests cover partial/full overlap, A→B→A, reversed/late revisions, boundary,
same-channel, untrusted timing, merged peers, Script color/seek, and Timeline
stem selection, playback stop, Layer/Cột layout. In the built app, a temporary
three-row A→B→A journal on an existing physical four-track OBS archive showed
00:02.00–00:05.00 markers on Channel 1 and 2. The Channel 2 Script marker
played its source WAV from 2.00 and stopped at exactly 5.00 browser seconds;
the Channel 1 Timeline marker selected and played its own WAV. The temporary
journal was deleted and managed API/Studio restarted. Channel 2's analysis WAV
remained mono PCM16, 24 kHz, 369849 frames (15.410 s); no source audio was
rewritten. `git diff --check`
passed. This verifies archive review, not live simultaneous speech, word-level
color precision, or physical end-to-end latency; those remain in final
LIVELINK-08 acceptance.

Exact next product round: `LIVELINK-08J` — update the OBS plugin dialog to an
OBS-coherent visual style and include a Pro4Bro brand asset.

### LIVELINK-08J OBS dialog styling and Pro4Bro mark — 2026-09-29

The OBS-owned Win32 Tools dialog now follows the current OBS dark/light theme:
Segoe UI typography, a P4B/Pro4Bro header, native dark title bar, compact
connection panel, bordered Audio Mixer source rows, source meters and a
primary Open App button. It
reflows and recreates fonts on `WM_DPICHANGED`, and Tab/Shift+Tab/Escape work
across visible Forward controls, aliases and the button. The GDI header mark
matches the product-owned `pro4bro-livelink.svg`. Plugin package 0.6.0 includes
the vector with the DLL and locale; standard/portable installer allowlists,
hash validation and bundle checks cover all three files. An intact older
two-file install now reports `update-available` rather than `damaged`.

Physical OBS 32.2.2 loaded the installed plugin and displayed the dialog in
both Yami Default and Yami Light without restarting to update the dialog.
Screenshots under `build/obs-plugin-ui/` capture final dark five-source, dark
one-source, and dark twenty-source layouts; the twenty-source list paged to
Channels 16–20. A light five-source screenshot verifies the alternate palette
before the final heading spacing adjustment. In a disposable twenty-source
collection, Forward changed and an edited alias persisted with a new revision.
OBS was closed after QA; its original global/user config and LiveLink channel
mapping were restored byte-for-byte, and all disposable scene collections were
moved out of OBS' scene directory into the local QA artifact folder. The
installed package reports `installed`, `pairingReady=true`, OBS build 32.2.2,
and plugin version 0.6.0.

Verification: native build/package passed; Capture portable check **5/5**;
frontend **343 passed**, typecheck and Vite build passed; backend **439 passed**
(including nine installer tests);
`git diff --check` passed with only line-ending warnings. The one attached
monitor runs at 100% DPI, so real 125%/150% DPI screenshots remain unverified.
No final audio/recording/STT integration result is claimed by this visual
round. The logo is a proposed vector brand variant for the owner's final
review.

Exact next product round: `LIVELINK-08` — run the final integrated OBS
recording, waveform, transcription, overlap, timing and portable acceptance
matrix, including any available 125%/150% DPI environment.

### UX-01 Owner-requested workspace chrome and logo — 2026-09-29

Voice Training and Voice Changer now open directly onto their modules, matching
the existing compact pages. Media Pool right-click actions are ordered as
vertical menu rows, with Remove separated at the end. The supplied
`logo_v2.png` is copied byte-for-byte into the web public assets and displayed
in the hub, workspace bar, boot/runtime screens, and favicon. A 128-pixel
derivative is embedded as a bitmap resource in the native OBS dialog DLL; the
header draws it clipped to its circular mark. The packaged plugin is 0.6.1.
The logo preference was also saved in OpenViking for future Pro4Bro projects.

Verification: frontend **345 passed** across 46 files, typecheck and Vite
build passed; backend **439 passed** (two existing deprecations); native OBS
build and package passed with version 0.6.1. Tests cover the two compact pages,
logo path, and ordered context actions. This round does not claim a physical
OBS or browser screenshot for the new mark; the installed plugin still needs
its package updated before it displays the new DLL.

Still missing: Shift/Ctrl/Ctrl+A selection, batch edit/remove on all list
surfaces, and the repeatedly loading PCM waveform. These need state/action
contracts and a waveform lifecycle diagnosis; a visual-only change cannot
prove either behavior. UX-02 and UX-03 carry selection, UX-04 carries the
waveform; LIVELINK-08 physical acceptance also remains open.

Exact next owner-requested round: `UX-02` — implement shared selection
semantics and Media Pool batch actions, including range, toggle, select all,
right-click target preservation, and verified remove/edit behavior.

### UX-02 Media Pool multi-selection and batch actions — 2026-09-29

Media Pool now keeps a list selection separate from the opened footage and from
the STT/TRAIN checkboxes. Plain click selects one, Shift selects a range,
Ctrl/Cmd toggles individual rows, Ctrl/Cmd+Shift extends a range, and Ctrl/Cmd+A
selects the live rows while focus is in the Media Pool list. Recycled footage
is excluded and IDs removed by a refresh are pruned. Right-click preserves a
selection when the clicked footage belongs to it; otherwise it targets that
single footage. A selected count and distinct row highlight make the action
scope visible.

For multiple selected footage, the menu applies emotion, Speaker Profile,
Environment Profile, enabled state, STT/TRAIN flags, and Remove to the eligible
batch. Existing annotations on each file are preserved when changing one tag.
The project API is called once per asset; a partial failure reports the count
and failed IDs without claiming the whole batch succeeded. Remove moves the
selected live assets into Recycle Bin. Single-file permanent delete still
requires its prior confirmation. Single-file preview and Script/Timeline
editing continue to use the opened footage only.

Verification: selection and Media Pool interaction tests cover range/toggle,
select all, right-click scope, batch tag/disable/STT/TRAIN/remove, and
eligibility. A WorkspaceShell test exercises multi-asset recycle through the
project API. Frontend **352 passed** across 47 files, typecheck and Vite build
passed; backend **439 passed** with two existing dependency deprecations.
`git diff --check` found no whitespace errors. Physical browser interaction
was not exercised in this round.

Still missing: Sound Library, Voice Output, Script rows and other lists need
the shared selection behavior and their own safe batch actions. UX-04 still
owns the repeated PCM waveform loading issue.

Exact next owner-requested round: `UX-03` — extend selection and appropriate
bulk actions to Sound Library, Voice Output, Script rows and remaining lists.

### UX-03 + UX-04 Multi-list actions and PCM waveform stability — 2026-09-29

Selection and scoped bulk actions now cover Voice Output, Sound Library speaker
and environment profiles and nested voices, Voice Script rows, diarized Script
rows, Project Hub entries, Speaker Isolation labels, Training History runs and
adapters, authored training passages, and Media Pool Recycle Bin items. The
actions appropriate to each list include grouped delete or catalog removal,
speaker reassignment, profile color changes, and bin restore. Opened/previewed
items stay distinct from selected items. Destructive groups use one
confirmation; project operations report partial failures rather than claiming
the whole selection succeeded. The shared Shift range, Ctrl/Cmd toggle and
Ctrl/Cmd+A behavior is scoped to the relevant list.

The PCM viewport fix records the density requested from the API. Its response
can contain fewer points because the server groups samples into whole blocks;
comparing only the returned point count made a settled window look too sparse
and triggered another fetch on each render. A covered window now reuses its
envelope, while a genuinely new viewport still requests peaks. The loading
overlay appears only when that window has no envelope to show.

Verification: frontend **369 passed** across 48 files; `npm run typecheck`
and `npm run build` passed. Backend **439 passed** with two existing dependency
deprecations. `git diff --check` passed with line-ending warnings only. Tests
exercise list selection and batch targets, one confirmation for grouped
deletion, partial-failure behavior, Recycle Bin restore, a settled PCM viewport
without repeated requests, and a newly panned viewport with a fresh request.

Remaining gap: the OBS capture session track list has SRT checkboxes, but its
per-track Final STT action still lacks modifier selection and a batch command.
Modifier and waveform behavior also need a physical run in the browser with a
real audio file; component tests do not prove visual stability during playback.
The final `LIVELINK-08` OBS integration and owner acceptance remain separate
open gates.

Exact next owner-requested round: `UX-05` — complete OBS session track batch
selection/actions and run a physical browser sweep of the editable lists and
PCM waveform with real media.

### UX-05 Recycle Bin, Script LiveLink, and remaining editable lists — 2026-09-29

The Recycle Bin now offers Delete for selected footage, a symbol-only Empty
Recycle Bin control, and Restore/Delete actions scoped to the selected rows on
right-click. One confirmation covers a permanent-delete batch. Completed IDs
leave the UI, failures remain visible and are reported. In-flight Media Pool
list responses started before a successful permanent delete can no longer
reinsert its footage. A reopened project test confirms the media index also
keeps permanently removed footage absent on disk.

OBS LiveLink no longer replaces Script with the small live-only module. Its
channel transcript is embedded above the original Script editor, preserving
the text tools, actions, and existing footage text. The list audit also found
that Sound Library's bulk callbacks were implemented but not passed through
its registry entry; they are now wired. Voice Changer recordings have a
modifier-selectable management list and one grouped delete confirmation.
Imported OBS session tracks support Shift/Ctrl/Ctrl+A through their existing
selection checkboxes and can queue Final STT for all selected tracks at once.

Verification: frontend **378 passed** across 49 files, typecheck and Vite
build passed; backend **440 passed** with two existing dependency warnings.
Tests cover batch Delete/Empty/right-click scope, one confirmation, stale list
responses after deletion, persistent removal after reopening, original Script
controls alongside the LiveLink feed, grouped Sound Library callbacks, Voice
Changer recording deletion, and OBS track batch STT. `git diff --check`
passed with line-ending warnings only.

Remaining gap: physical browser interaction against real project media and an
OBS recording has not been run in this round. That matters for verifying
layout, actual modifier keys, and the reported PCM waveform behavior in the
running app. Final `LIVELINK-08` integrated OBS acceptance also remains open.

Exact next owner-requested round: `UX-05B` — run the physical UI sweep for
Recycle Bin, Script LiveLink, Voice Changer/OBS lists, and PCM waveform with
real media, then repair any observed runtime discrepancy.

### UX-06 OBS Stop boundary and per-channel Timeline — 2026-09-29

The owner's clarified Stop policy preserves separate app and OBS recording
state: OBS Stop ends app capture when Ignore Stop is off; Ignore Stop keeps app
capture active; app Stop always ends app capture. The native plugin now clips
the final PCM packet to the applied Stop timestamp and cannot combine later
packets into an earlier batch. The API rejects any chunk whose duration crosses
the stopped recording boundary. Live STT drains only accepted recorded PCM,
closes its queue once, rejects late offers, and closes even when archive creation
fails. A failed archive is left in the project journal for explicit Retry;
the plugin no longer loops indefinitely on an HTTP finalization error. The
recorder shows `Đang dừng…` while awaiting the plugin ACK and discards stale
status polls around app actions.

Each OBS layer now occupies 60% of the Timeline viewport, with its own tall
waveform, subtitle, vertical Gain and vertical Level columns. Column mode keeps
the same four parts, places Gain and Level on one equally split row below the
waveform/subtitle, and provides an independent width slider per channel.

Verification: frontend **381 passed** across 49 files, typecheck and Vite
build passed; backend **441 passed** with two existing dependency warnings;
native OBS plugin 0.6.2 built and packaged successfully. Regression tests cover
the Stop-pending UI, stale poll suppression, one-time STT tail drain and late-offer rejection, backend
PCM boundary rejection, and independent Timeline column widths. Existing
reducer tests cover OBS Stop with and without Ignore Stop.

Remaining gap: the rebuilt plugin has not been installed into a live OBS
process or exercised with simultaneous real channels in this round. CSS layout
also needs a physical browser inspection at multiple workspace sizes. These
checks matter because timing and actual viewport sizing cannot be established
by component tests or compilation alone.

Exact next owner-requested round: `UX-06B` — test the three Stop paths and
live STT tail with real OBS, inspect layer/column layouts at multiple sizes,
then repair any observed discrepancy. `UX-05B` remains queued for the earlier
Recycle Bin and list sweep.

### UX-07 One recording-wide OBS Timeline and integrated Script — 2026-09-29

The owner clarified that simultaneous OBS channels are different signals of
one recording. Live draft rows now occupy the Script module's primary content
area, with a control to switch between the draft and original editable Script;
its existing text tools remain in the same module. The OBS Timeline retains
one shared playhead, ruler and transport scrub, one zoom control, and the
original Mark In/Out → Cut → Delete, Uncut, and Reset workflow. Seeking on a
channel waveform, its ruler, or the transport updates every channel's playhead.
Cut overlays show on every waveform. An atomic batch API stores the same
removed ranges on every archived stem while preserving individual gain
keyframes and source media. An edit failure leaves the staged cut visible.

Layer layout puts the channel label above vertical Gain/Level at the left of
each 60%-height lane. Column layout puts `Channel - source` and Gain/Level
above the waveform, distributes unresized columns equally, and keeps each
user-adjusted width when switching views. There is no per-channel zoom.
ADR 0015 records the recording-wide edit axis and storage decision.

Verification: frontend **382 passed** across 49 files, typecheck and Vite
build passed; backend **443 passed** with two existing dependency warnings;
`git diff --check` passed. Tests cover Script's single content area and mode
switch, shared marks/cut/delete/uncut and synced waveform/ruler/transport
seeking, column width behavior, and all-or-nothing API persistence. The
new OBS batch API is covered through FastAPI TestClient and disk reopen.

Remaining gap: no physical OBS session or browser viewport with simultaneous
real channels was available in this round. Visual sizing and actual audio
timing still need a real run; tests establish state transitions and stored
cuts, not final perceptual quality.

Exact next owner-requested round: `UX-07B` — run a real multi-channel OBS
recording, verify Script and Timeline layouts at several widths, seek/zoom
sync and recording-wide cuts after reopen, then repair observed discrepancies.
The earlier `UX-05B` Recycle Bin/list sweep remains queued.
`UX-06B` Stop/Ignore Stop acceptance with the installed OBS plugin also
remains queued.

### UX-08 One OBS recording as one MKA footage — 2026-09-29

Each completed LiveLink session now produces one visible Media Pool footage:
the verified multitrack MKA. The per-channel analysis WAV records stay in the
project for STT and training but are hidden from the footage list. The media
index persists recording ID, parent ID, stream index, and track UID; older
indexes recover those links once from `recording.json`. Selecting a footage
opens the corresponding recording-wide Timeline and Script feed. Recycling,
restoring, and permanently deleting that footage update its channel assets
together. ADR 0016 records the aggregate boundary.

Verification: frontend **384 passed** across 49 files, typecheck and Vite
build passed; backend **445 passed** with two existing dependency warnings;
`git diff --check` passed. Tests cover two distinct recording parents, two
channels per parent, persisted and legacy relationships after reopen,
group recycle/restore/delete, and routing a selected MKA to the OBS view.
The existing FFmpeg archive test also confirms parent and child relationships
survive a copied project.

Remaining gap: no new physical OBS two-take run was available for this round.
The real Media Pool appearance, channel playback, and per-recording Script
contents need an end-to-end check after reopen.

Exact next owner-requested round: `UX-08B` — record twice with multiple OBS
channels, reopen each Media Pool footage, verify its MKA channels and Script,
then exercise Recycle/Restore/Delete on one footage while the other remains.

### UX-09 Consistent Timeline controls and column-edge resizing — 2026-09-29

OBS LiveLink Timeline now places Column/Layer immediately before Mark In in
the same header row as the edit controls. The separate layout row is removed.
Zoom uses the normal Timeline's control order and width. Transport uses its
play button, full timecode format, scrub placement, and playback-rate position;
OBS track/window actions remain at the right. Layer Gain/Level labels run
vertically at the left of full-height controls. Column width sliders are gone;
each column has a draggable edge with arrow/Home/End keyboard adjustment.
The adjusted width survives switching between Layer and Column.

Verification: frontend **384 passed** across 49 files, typecheck, Vite build,
and `git diff --check` passed. Component tests assert control order and shared
classes, column-edge pointer and keyboard resizing, width retention, zoom,
timecode, gain, and shared seek/cut behavior. Backend code was untouched.

Remaining gap: the browser DevTools test surface was unavailable and no
running OBS session was attached. Unit tests cannot establish final visual
spacing, meter height, or resize hit targets at the owner's display scale.

Exact next owner-requested round: `UX-09B` — compare normal and OBS modes in
the running app at the same viewport/DPI, test Layer and Column with real
channels, and repair any clipping or pointer-hit discrepancy. `UX-08B`
two-take footage acceptance remains queued.

### UX-10 OBS channel readability and status — 2026-09-29

Column and Layer headers now show `Channel - source` on one line at 16px
(scaled with the app font setting), truncating inside the available label
space. Column-edge resize keeps the 240px minimum. Layer rows use a measured
60% of the Timeline viewport as their height, while their common track grows
with every channel; the shared playhead therefore spans the full set of rows.
The Timeline selector is labeled `BẢN GHI` and explains that one OBS take is
one footage with its channels and Script. The app's OBS mixer and recorder
channel lists no longer create their own nested scroll area. Every recorder
row begins with a REC indicator; it turns red and blinks only while that
channel is receiving during app recording. A paused channel shows PAUSE with
a two-bar symbol.

Verification: frontend **384 passed** across 49 files, focused Timeline and
Recorder tests **34 passed**, typecheck and Vite build passed, and
`git diff --check` passed. The component tests cover inline names, 240px
minimum resize, selector wording, and persistent REC/PAUSE state evidence.
Backend and native plugin behavior were not changed in this round.

Remaining gap: browser rendering at the owner's viewport and a real OBS
multi-channel pause/record cycle still need a visual check. The tests do not
measure actual glyph truncation, scrollbar appearance, or playhead pixel
height in the running app.

Exact next owner-requested round: `UX-10B` — inspect six or more live OBS
channels at the owner's display scale, resize a Column to 240px, verify the
Layer playhead reaches the last channel, and verify REC/PAUSE and the single
outer scroll during recording and pause. `UX-08B` two-take footage acceptance
remains queued.

### UX-11 Named OBS recordings and smaller channel labels — 2026-09-29

The Timeline `BẢN GHI` selector now labels each OBS capture as
`yyyy-mm-dd_hh-mm-ss_project-name`, using the recording's start timestamp in
local time and the current project's name with spaces/punctuation converted
to hyphens. The active recording has an option even before its journal entry
appears; old records without a valid start time fall back to their short ID.
The selector is wider and exposes the complete name as a tooltip. Channel
labels in both Column and Layer views are now 11.2px, exactly 70% of the
previous 16px size, while retaining truncation at narrow widths. This changes
the displayed name; the stable recording ID and project-owned MKA path still
identify the media.

Verification: frontend **385 passed** across 49 files, focused Timeline,
Registry, and Workspace tests **29 passed**, typecheck and Vite build passed,
and `git diff --check` passed. A component test checks two distinct local
timestamps, the project-name suffix, and the selected option title.

Remaining gap: final truncation and control spacing at the owner's viewport
still need a browser check. No real OBS recording was available in this round.

Exact next owner-requested round: `UX-11B` — inspect the selector and 11.2px
channel labels with multiple recordings and channels at the owner's viewport;
adjust only observed readability or clipping issues. `UX-08B` two-take
footage acceptance remains queued.

### LIVELINK-08K Missing PCM diagnosis — 2026-09-29

The owner's `Test OBS 2` recording `e99416d0-e0ee-4a6d-9cd0-06ee5e0b096c`
has 25 transport gaps (13.55 s) in Channel 1 and 23 (10.56 s) in Channel 2.
Its archived per-channel chunk sequences are contiguous, and the recording
contains no capture pause. All 208 accepted PCM PUTs returned 200. One initial
Channel 2 sequence-0 request returned 409 and its retry returned 200 in the
same second. The silent regions are therefore missing before the plugin
assigns a chunk sequence; the MKA correctly reflects missing source PCM.

The strongest cause is sender backlog overflowing the plugin's two-second
per-source queue. The native callback advances the source sample index before
`try_lock` and the queue limit; both paths can discard PCM before `take()`
assigns a sequence. The sender performs synchronous HTTP calls for PCM,
heartbeat, and commands in one loop. A good two-channel recording
`490d9f85-8e9f-5321-86dd-2eaad9984afc` has zero gaps, about 0.55 s
median capture-to-receive lag and about 0.6 s median chunk size. The affected
recording rises from about 0.8 s lag in its first 20 s to about 1.8–1.9 s
in the heavily gapped 20–60 s interval; its median chunk size reaches the
one-second batch limit. A four-channel recording has 118 gaps. These are
consistent with backlog and queue eviction, but the current plugin logs no
drop reason or queue depth, so the exact split between overflow and callback
lock failure cannot be measured retrospectively. Synchronous disk/fsync and
waveform work in the API's async PCM route may lengthen sender waits; its
share of the delay is also unmeasured.

Verification was read-only: compare five immutable recording journals and
their PCM chunk metadata, check affected API PUT statuses, and trace native
callback, queue, sender, and API paths. A red/green journal check fails for
the affected recording (48 transport gaps) and passes for the healthy
two-channel control (zero). No product or stored media was changed.

Remaining gap: no plugin queue/drop telemetry exists for this historical
take, and no new physical OBS capture was run. Its missing source PCM cannot
be recovered from the completed MKA. `LiveLinkCapture::take()` also combines
packets without checking adjacent sample indices, so losses inside one batch
may be hidden from the journal.

Exact next round: `LIVELINK-08L` — add per-reason drop/backlog evidence,
remove real-time PCM loss under stalled HTTP, enforce sample continuity in
batched chunks, move blocking API PCM persistence off the event loop, then
verify two and four simultaneous OBS channels with an intentionally slowed
API and inspect the resulting MKA for zero source-sample gaps.

### LIVELINK-08L PCM capture resilience — 2026-09-29

The v3 native callback now waits for the short queue mutex instead of
discarding a packet on `try_lock` failure. Track detach and callback removal
run outside that mutex, with a separate lifecycle lock, so waiting callbacks
cannot deadlock OBS source removal. A recording keeps up to 120 seconds per
source and 512 MiB per connection; idle preroll keeps 10 seconds. Any overflow
past those explicit safety limits increments a per-channel lost-frame counter
and emits an OBS error log with recording/channel identity, backlog and peak
depth. Callback lock waits above 5 ms are logged separately. The sender skips
its 100 ms sleep and command long poll while PCM is pending. Batching stops
at a sample-index discontinuity, leaving the next chunk's true index visible
to the API and archive gap catalog.

The API now runs durable PCM persistence and live waveform work in a worker
thread rather than blocking the FastAPI event loop. A regression test first
failed with a 0.52 s health-response delay during a 0.5 s PCM write; after
the change it passed below 0.35 s. A compiled native stress test queues
eight seconds of four stereo channels without sending, drains all 32 exact
one-second chunks without loss, verifies a deliberate sample-index jump is
split between chunks, and verifies callback mutex contention preserves PCM.

Verification: backend suite **446 passed**, native capture stress executable
passed, OBS plugin 0.6.3 built and packaged, and `git diff --check` passed.
The installed OBS process was already running with its older DLL, so no new
live capture or MKA was produced in this round.

Remaining gap: 120 seconds and 512 MiB are finite safety limits. A sustained
API outage or more concurrent channels can still exhaust them; overflow is
now explicit, not lossless. The physical two/four-channel OBS matrix and an
intentionally slowed API remain unverified. This matters because native unit
tests cannot prove the installed plugin's throughput or archive timing.

Exact next round: `LIVELINK-08M` — install/reload plugin 0.6.3 after OBS is
idle, record two and four forwarded channels with an intentionally slowed
local API, inspect the new MKA and chunk catalog for zero transport gaps,
and decide from measured backlog whether a disk-backed spool is required for
longer outages.

### LIVELINK-08M Physical capture and durable PCM outbox — 2026-09-29

OBS was restarted with plugin 0.6.3. Physical recordings in `Test OBS 2`
produced a ready two-track MKA (`207f182f-a35d-44fc-85b3-e39cac1b56a7`,
32 PCM chunks per channel) and a ready four-track MKA
(`db3dd240-8986-49a7-bc7b-d65318782a21`, 16 chunks per channel). Both
have zero source-sample gaps. Suspending the local API for five seconds during
a two-channel capture left ten chunks on the SQLite disk outbox; after resume,
`880479af-b16a-437e-9686-8f41066882c9` archived with zero gaps and an
empty outbox. A four-channel stall likewise retained pending PCM but exposed
a Stop-tail rejection: one 0.6.4 chunk crossed the Stop boundary by 245 frames.
Plugin 0.6.6 trims pending PCM at the exact Stop boundary and reattaches a
stopped project journal after an OBS process restart. The previously stuck
four-channel recording `adb81fad-2678-4543-b891-2dc88cd016dc` then replayed
the clipped chunk, emptied the outbox and finalized as a four-FLAC-track MKA
with zero source-sample gaps. Its original rejected chunk was preserved until
that successful replay.

The v3 plugin worker now writes captured PCM to a machine-local SQLite WAL
database with `synchronous=FULL` before HTTP upload, deletes only after API
acceptance, and recovers pending stopped recordings from project journals.
The audio callback performs no database I/O. Native spool and capture tests,
16 focused backend tests, 448 backend regression tests, plugin 0.6.6
build/package and physical replay pass.
The old in-memory safety limit remains if SQLite cannot accept data, and disk
exhaustion has no automatic recovery UI. The outbox is machine-local; moving a
project to another machine while its recording has pending chunks requires
first draining this host's outbox.

OBS MKV was probed while recording: FFprobe saw an HEVC video stream and six
AAC stereo mix tracks; FFmpeg decoded three seconds of committed audio before
OBS stopped. The growing tail reported premature EOF, so readers must expect
an incomplete live file and retry as it grows. OBS mix tracks are limited and
do not prove one-to-one capture of every forwarded source. MKV can help verify
or recover configured OBS mixes, but cannot be the canonical per-source take:
Ignore Stop can continue app recording after OBS closes its MKV. See
`docs/adr/0017-obs-livelink-durable-pcm-spool.md`.

Exact next round: `LIVELINK-08N` — expose disk-outbox health and retained
invalid chunks in the app, add a safe recovery/export action for a full disk,
and run a longer high-channel-count physical outage test.

### MEDIA-MULTITRACK-01 Completed-file import foundation — 2026-09-29

The import processor previously mapped only `0:a:0`. It now probes all audio
streams in a completed MKV, MOV, or MP4 and retains one original video footage
plus one 24 kHz mono analysis WAV asset per audio stream in a single FFmpeg
read of the source file. Each child records
its absolute container stream index and parent ID; a project-relative
`audio-tracks.json` records title, codec, source sample rate/channel count,
language, and analysis path. Media Pool displays the track count, selecting
STT/TRAIN on the footage targets its children, and Recycle/Restore/permanent
Delete apply to the whole group. A machine-local original locator and Local
File Cache refresh preserve the existing portability contract. The first
track remains the parent preview until the shared multitrack Timeline exists.

Generated one-second MKV, MOV and MP4 fixtures with two different AAC audio
streams were imported through native-path and browser-upload paths. Each
produced two distinct analysis WAVs with stream indices 1 and 2; the native
path also passed cache refresh and grouped deletion. Verification: 451
backend tests, 385 frontend tests, TypeScript typecheck and Vite build passed.
This round does **not** claim a multitrack Timeline or live MKV read.
One audio stream with a multichannel layout remains one track/instance, as in
the OBS source model; tracks are not assumed to be isolated microphones.

Feasibility: Matroska clusters and FFmpeg can expose committed audio while
the writer is still running, as the LIVELINK-08M physical probe demonstrated.
The growing tail may be incomplete, and a fresh FFmpeg process reaching EOF
does not by itself guarantee continuous following. A production follower must
checkpoint source identity, complete packet/cluster position and per-track
timestamp/sample progress, retry incomplete tails, detect truncation or file
replacement, and compare the final read against the closed MKV. Browser file
upload is a fixed snapshot; live follow requires a local file locator. The
configurable per-track final STT queue must only consume durable, nonduplicate
segments and finish the post-Stop tail. ADR 0018 records these boundaries.

### MEDIA-MULTITRACK-02 Imported channel Timeline and Script — 2026-09-29

Selecting a completed MKV/MOV/MP4 parent now opens all imported audio streams
as Timeline instances. Layer and Column views share one time axis, playhead,
scrub, zoom and Mark In/Out/Cut/Delete/Uncut/Reset. A batch cut writes the same
ranges to every child asset. Playback starts the track audio elements together
and corrects drift against the first channel; each channel has its own preview
gain and source level. Script lists every channel and its transcript, opens the
selected channel in the full editor, and saves edits and word annotations to
that child. Recycle state prevents persistent edits. The completed-file import
and OBS LiveLink paths remain separate.

Frontend regression tests cover import routing, channel selection, Script save,
shared cut, layout controls and waveform loading. Typecheck, frontend test
suite and production build pass. Owner viewport review with a representative
multitrack file remains open; this round does not follow a growing MKV.

Exact next round: `MKV-FOLLOW-01` — follow a growing local MKV into durable,
nonduplicate per-track audio chunks with source identity, committed-byte
cursor, restart recovery and final-file reconciliation.

### MKV-FOLLOW-01 Growing local MKV follower — 2026-09-29

The native-path follower now parses EBML boundaries and consumes only complete
Matroska Clusters. A project-owned checkpoint records source identity, last
Cluster hash, committed byte cursor, per-track frame counts and gap evidence.
Each selected container audio stream has durable PCM chunk WAVs and a live
analysis WAV under one Media Pool footage. The API polls active followers
automatically, resumes unfinished checkpoints after API restart, and exposes
start/status/poll/finish endpoints. Polling a partial tail does not advance
the cursor; recovery truncates uncheckpointed bytes before retry. Source
truncation or replacement fails instead of silently joining another take.

Live per-Cluster decoding is provisional because AAC/other stateful codec
boundaries can differ from uninterrupted decoding. Explicit Finish after the
writer stops copies the complete MKV into the project and re-decodes each
selected track from that closed source, publishing those final WAVs. It does
not infer Stop from temporary EOF. Generated two-track AAC MKV tests cover
partial Clusters, repeated polls, reader restart/orphan WAV recovery, source
truncation, automatic API polling, one-track selection, and final footage
paths. Backend suite: 456 passed. Real OBS growing-file capture and the owner
viewport are still unverified; live/final STT and the right-click channel
selection menu are separate rounds.

Exact next round: `MKV-CHANNEL-01` — add Media Pool right-click checkboxes for
each channel's Import and Live Transcribe/STT selection, persist those choices,
and pass selected stream indices into the MKV follower. `MKV-STT-01` then
consumes the selected tracks through Stop.

### MKV-CHANNEL-01 Per-track Import and STT selection — 2026-09-29

The native file picker now inspects MKV/MOV/MP4 audio streams before creating
a multitrack footage. Media Pool shows a pending item whose right-click menu
has separate Import and STT checkboxes for each stream. The confirmed stream
indices go to completed-file import or the growing-MKV follower; only selected
streams are decoded. Parent footage and its track manifest retain all probed
streams, including omitted ones, while each imported track retains its STT
selection. The footage right-click menu shows the persisted choices and can
change STT selection. A one-track MKV keeps its STT selection on the footage.

Generated-media API tests verify selective import/follow and saved selection.
The full backend suite passes (456 tests), as do frontend tests (394 tests),
typecheck, production build and diff whitespace check. Owner viewport review
with a real OBS recording remains open. The checkboxes persist STT intent;
they do not start a live STT worker in this round. Browser upload still takes
a fixed file snapshot and does not expose the native-path track picker.

Exact next round: `MKV-STT-01` — consume durable per-track audio for live
transcription, offer a user-selected final segment length (default 60 seconds),
and drain every selected track's backlog through the final MKV after Stop.

### MKV-STT-01 Live preview and final segmented STT — 2026-09-29

A worker separate from the MKV reader now transcribes selected tracks from
checkpointed analysis WAV frames. It saves short live preview segments and
text using the tiny model while the MKV grows. The Media Pool follow dialog
lets the user set the detailed STT segment length from 10 to 600 seconds
(default 60). Explicit Finish switches detailed STT to the continuously
decoded final WAV; it processes from frame zero and drains a shorter final
segment. Per-track result files are durable before advancing STT cursors, so
API restart can reuse a saved result without sending it to the model twice.
The API resumes unfinished workers, exposes STT progress/errors with follow
status, and the workspace refreshes the selected channel's Script during
capture. User edits to Script remain visible; detailed STT is saved as a
revision for comparison.

Generated two-track AAC and twelve-second MKV tests cover live preview,
segment boundary and final tail, restart with cursor rollback, and Script
edit preservation. Backend suite: 459 passed. Frontend suite: 395 passed;
typecheck, production build and diff whitespace check pass. The real OBS
writer and STT engine were not available for an end-to-end run in this round;
an attempted request to the local Studio service timed out. Live preview
throughput with many selected tracks remains to be measured on real hardware.

Exact next round: `MKV-ACCEPT-01` — test a real growing OBS MKV with several
selected tracks and the actual Studio models; compare saved PCM duration,
segment coverage, Script timing, Stop-tail completion and UI responsiveness.

### MKV-ACCEPT-01 Segmented STT during an active MKV write — 2026-09-30

The detailed STT worker now runs on each selected track while the MKV is still
growing. Pressing STT on a followed footage opens a minutes-and-seconds dialog
(10–600 seconds, default 60); completed intervals are recognized from the
start of each track, saved by source frame range, and joined into Script with
word timestamps offset to the original timeline. The quick three-second
preview continues ahead of detailed results. Finish drains the shorter last
interval from the final decoded WAV. A saved segment result is reused after a
worker restart, and a user-edited Script remains in review with the detailed
result retained as a revision. The main STT action targets the selected
growing footage when several are present.

Generated two-track AAC tests cover detailed text and word positions before
Finish, restart idempotency, final-tail joining, user-edit preservation, and a
real FFmpeg process writing the MKV concurrently with the follower and STT
worker. This is a simulated source and recognizer: the local OBS process and
Studio model were unavailable for the physical acceptance run. The real OBS
capture, actual-model word quality, sustained multi-track throughput, and
viewport responsiveness remain the next acceptance gate.

Exact next round: `MKV-ACCEPT-02` — capture a real OBS growing MKV with several
selected tracks, run the installed Studio models, and compare source duration,
PCM/segment coverage, word timing, Stop-tail completion, and UI responsiveness.

### MEDIA-STAGES-01 Media Pool workflow selections — 2026-09-30

The Media Pool now shows Import, STT, Speaker Diarization and Train on each
footage and each materialized child track. An expander shows the tracks under
their footage. A parent checkbox is checked if all children agree, indeterminate
if only some are selected, and clicking it applies the stage to all children.
Import and Speaker Diarization choices persist through project API endpoints;
existing STT and Train choices remain persisted. An unchecked Import choice
excludes that existing asset from STT, diarization and dataset compilation
without deleting its source media. The STT action queues the selected imported
assets, the diarization action queues eligible selected assets, and the Train
dataset compiler uses selected imported assets. A compact notice before
diarization explains that single-speaker footage wastes resources. The extra
imported-channel list above the Script editor is removed; its track choice is
available in Media Pool. The pre-import native track picker remains separate.

The API persistence test, Media Pool tri-state/component tests and focused
Speaker notice/Script tests pass. The full frontend suite passed 399 tests on
rerun, frontend typecheck and production build passed, and the backend suite
passed 463 tests. One existing Timeline test failed intermittently on the first
full frontend run but passed both by itself and on the complete rerun; no
Timeline code was changed for this round. `git diff --check` passed. A real
viewport check is still open. Previously omitted source tracks have no
analysis asset to toggle; their import checkboxes in the old context menu are
still read-only. The Import checkbox added here gates processing of an already
materialized asset; it does not decode an omitted stream.

Exact next round: `MEDIA-STAGES-02` — use the saved source track manifest to
decode and register a previously omitted channel on demand, then make Import
selection correspond to actual track presence and verify it on a real MKV.

### MEDIA-VIEW-01 Import visibility and long-footage Timeline — 2026-09-30

Unchecking Import withdraws an existing footage or child track from working
modules. The Media Pool retains its row and source data so Import can be ticked
again. If the open channel is withdrawn, Script moves to another imported
channel; if no channel remains, the workspace closes the footage. Archived OBS
channel lanes also honor the saved Import selection. Training and queued STT
already gate on it at the service boundary from MEDIA-STAGES-01; the growing
MKV transcription worker now checks it on each processing pass, pausing a
withdrawn track until Import is ticked again.

The imported multitrack Timeline now uses a continuous zoom range. Its left
edge fits the entire file, however long; its right edge maps 0.01 seconds to
10 pixels of the measured waveform width. When a close view would stretch a
sparse full-file overview, it requests the API's cached PCM peaks for the
visible interval and draws a connected, filled envelope. This changes only
visualization, not source audio or timing.

Regression tests reproduce all three reported symptoms and cover withdrawal,
re-addition, shared zoom bounds and detailed peak rendering. A physical
viewport review with the owner's long footage remains open. An omitted source
stream that was never decoded still cannot be checked back in; its source
manifest is retained for MEDIA-STAGES-02.

Exact next round: `MEDIA-STAGES-02` — decode a previously omitted MKV/MOV/MP4
stream on demand from the retained original and make its Import box active in
Media Pool, then verify a real multitrack footage end to end.

### MEDIA-VIEW-02 Single-line Timeline channel labels — 2026-09-30

Imported multitrack labels now put Channel and Track on one line in both Layer
and Column views. The same label component also handles OBS LiveLink channel
and source names. It measures the available width, stays still when the text
fits, and repeats a right-to-left loop only when clipped. Hover or keyboard
focus pauses the loop; reduced-motion preference disables it while the full
name remains available as a title. This does not change channel selection,
waveform layout or gain/level controls.

Regression coverage checks one-line content, clipped scrolling, widened
static text and both imported Timeline layouts. Physical inspection at the
owner's column width and DPI remains open.

Exact next round: `MEDIA-VIEW-02B` — inspect Layer and the narrowest Column in
the running app, including text motion, hover/focus pause and reduced motion.

### MKV-FOLLOW-02 Active OBS MKV import visibility — 2026-09-30

The owner used the main IMPORT file input on a still-growing OBS MKV. That
path uploaded a browser snapshot and offered no follow action, so a large
recording did not appear as a live footage. The import dialog now offers a
prominent growing-MKV action, explains why it must reopen the same file using
the native local-file picker, and keeps completed-file import explicit. The
pending Media Pool row now says to click it to select tracks and follow.

The follower previously decoded every existing Cluster inside `start`, which
held the API response until a long backlog completed. `start` now scans only
the first committed Cluster for track discovery, registers the footage and
returns before decoding. The background watcher processes at most eight
Clusters per pass, publishing incremental PCM while preserving checkpoints.
On an OBS MKV that was growing in the owner's recording folder, registration
against a temporary project took 0.17 seconds; one real Cluster decoded two
selected audio tracks in 0.55 seconds. The source was only read and the
temporary project was discarded.

Frontend and backend regression tests cover the visible follow route, fast
registration, limited scanning and existing follow recovery. Full-session
throughput for an hours-long recording with all six tracks has not yet been
measured; per-Cluster FFmpeg process startup may leave the watcher behind the
OBS writer even though the footage now appears promptly.

Exact next round: `MKV-FOLLOW-03` — measure backlog rate on a long six-track
OBS MKV, then batch Cluster decode or otherwise reduce per-Cluster process
startup while preserving cursor, timing and final re-decode invariants.

### MEDIA-OPEN-01 Footage selection and long-recording render containment — 2026-09-30

Media Pool now clears the open footage when its blank list area is clicked.
Script, Timeline take, OBS recording feed, and word selection all clear together.
Reloading the workspace leaves footage unselected rather than opening the
first asset automatically. A newly opened standard or imported multitrack
Timeline starts zoomed to the entire duration. Imported multitrack audio
elements use `preload="none"` so opening six long analysis WAVs for visual
inspection does not eagerly load their audio into the browser. Per-module
render boundaries keep a failing Script/Timeline view from blanking the entire
workspace; they show the error and allow the footage to be closed or retried.

The owner's `test-obs-3` project contains a 9276.633-second imported MKV with
six analysis WAVs of about 424.6 MB each. Its existing cached overview has
7200 points across the full duration. This is a plausible memory-pressure
trigger, but no browser crash was reproduced without the exact failing asset
and runtime console trace. Frontend tests pass 412/412, typecheck and Vite
build pass. A live browser check of that recording remains open.

Exact next round: `MEDIA-SCRIPT-01` — selecting a parent shows imported channel
transcripts in time order, selecting a child shows only that channel, and live
OBS rows coalesce adjacent speech from one channel while diarization refines
speaker turns. Verify against the owner's failing recording and capture its
console error if the render boundary reports one.

### MEDIA-SCRIPT-01 Parent/child Script and speech turns — 2026-09-30

Selecting a multitrack parent now keeps that footage open and renders imported
channel transcript turns ordered by timestamp. A channel click shows its own
editable Script and one waveform; returning to the parent restores all lanes.
Timeline cut/mark operations still retain the full set of channel IDs. Word
speaker labels split parent rows when diarization identifies a new speaker.
OBS live transcript events from adjacent same-channel speech coalesce for
display, while intervening channels and long pauses split rows. Event storage
and per-utterance seek data remain intact. Frontend tests: 415 passing;
typecheck and build passing. The owner recording `test-obs-3` was inspected:
six imported analysis tracks, 9276.633 seconds, no completed STT text or word
timing. No local app listener was present, so browser console and visual
acceptance of that recording remain unverified.

Exact next round: `MEDIA-SCRIPT-02` — run live viewport acceptance with the
owner's failing footage and a multitrack footage whose channels have completed
STT/diarization; capture a render-boundary console error if one occurs and
repair any verified mismatch.

### MEDIA-SCRIPT-01B Continuous dialogue rows — 2026-09-30

Owner feedback clarified that silence does not end a Script row. A row of
recognized speech continues for the same channel and speaker regardless of
elapsed time. A spoken interjection by another channel, or a new diarized
speaker, starts a new row; returning to the earlier source starts another.
Imported parent Script now merges words after sorting all channels on the
shared time axis. OBS live rows ignore empty listening events as interruptions.
The previous 1.5-second gap rule caused the reported extra rows and is gone.
Regression tests cover long silence, channel interjections, speaker changes,
empty listening updates and the displayed row count. Frontend verification:
420/420 tests, typecheck and Vite build pass.

Exact next round remains `MEDIA-SCRIPT-02` for live viewport acceptance with
the owner's recording and completed multitrack STT data.

### MEDIA-PLAYBACK-01 Multitrack playback and import picker — 2026-09-30

OBS archive playback now starts every imported channel at the same playhead,
keeps channel positions aligned during playback, and offers an independent
Mute button beside Gain in both OBS and imported multitrack timelines.
Imported waveform pointer-down no longer changes the selected footage and
unmounts the dragged waveform. OBS scrub suppresses the synthetic post-drag
click that could seek back to zero. The OBS archive zoom adds the full
recording duration after the fixed short windows. Media import uses a Windows
file dialog when the portable Python runtime lacks `tkinter`.

Verification: frontend 423/423 full-suite tests plus one additional scrub
regression test in a passing targeted run, typecheck and Vite build pass;
backend 466/466 tests pass. The Windows picker fallback is covered with an unavailable
`tkinter` runtime mock; a physical dialog and live OBS capture were not run.
The owner's `test-obs-4` recording journal marks two channels forwarded for a
40-second take but has no PCM chunks or source stems and remains archive
`pending`. That evidence places this instance of the missing audio before
Timeline rendering or playback. The plugin's callback/transport behavior on
that workstation still needs a live two-channel trace.

Exact next round: `LIVELINK-CAPTURE-09` — instrument and reproduce a two-channel
OBS take, confirm each source callback, spool write and API chunk count, then
repair the first missing handoff and verify the resulting MKA contains both
channels. `MEDIA-SCRIPT-02` viewport acceptance remains queued after that.

### LIVELINK-CAPTURE-09 PCM recovery and growing-file import — 2026-09-30

Found a real transport stall: 63 SQLite PCM chunks from two channels remained
unacknowledged while an old finalize request repeatedly encoded MKA under the
global audio lock. The endpoint exceeded the plugin HTTP deadline. Reproduced
the lock contention and duplicate encoding with failing tests, then fixed
per-recording serialization, prompt asynchronous acknowledgement and idempotent
publication. Journal writes are protected against concurrent heartbeat updates;
cleanup of a locked temporary WAV no longer invalidates a verified archive.

Reloaded the managed portable API/STT without restarting or stopping OBS. Its
pending SQLite queue drained, and recording 925c6dfb published both tracks.
New real take 2cc71de9 received both channels without sample gaps and published
MKA. Take c15789f2 included two temporary speech sources alongside the existing
two sources: all four had zero observed sample gaps; speech sources had nonzero
waveforms, live text and final transcript events, and the MKA contains four
tracks. Temporary OBS sources were removed; historical channel mappings remain
for their saved recording. The user's muted mic and OBS paused recording state
were preserved.

Primary IMPORT now uses the native source picker, avoiding browser File snapshots
of a growing MKV. Track choices open automatically after inspection. Native picker
fallback supports UTF-8 paths in the portable runtime without tkinter. Inspected
the user's currently open OBS MKV and found all six tracks. An independent real
two-track MKV writer stayed active during import: registration took 0.391 seconds,
six clusters were consumed while writing continued, and finish completed both
24.056-second tracks and detailed STT. No follow or STT error was reported.

New recording/footage names follow
`yyyy-mm-dd_hh-mm-ss_project-name_MIC|SYS|LIV_id8` from the recording start time.
OBS names are persisted; MIC/SYS filenames and take labels share the same name.

Verification: 428 frontend tests, 468 backend tests, typecheck and build pass.
Real evidence and reproducible local scripts are in `.scratch/livelink-capture-09/`.
Browser inspection confirmed the named footage, four waveform lanes and two
speech rows; no render error was logged. Physical Windows file-dialog interaction
was not automated; its fallback is covered by tests and source inspection/follow
were exercised through the running API. These short capture checks do not claim
an hours-long zero-drop guarantee. ADR 0019 records the finalization contract.

Next acceptance: an extended owner recording under ordinary OBS workload;
`MEDIA-SCRIPT-02` remains the separate broader Script/diarization viewport round.

### MKV-STT-02 Snapshot, overlap and word timing — 2026-10-01

Reproduced the initial-interval bug (110 seconds of available audio was processed
as a 60-second first block), wrong absolute offsets at the 29:50 overlap seam,
and missing timestamp-positioned subtitle words with failing regression tests.
Detailed STT now snapshots committed frames before waiting for the decoder lock,
retains a durable plan, processes the complete initial backlog and continues
with configurable blocks. Each later block reads 10 preceding seconds and
replaces the previous transcript from 5 seconds before its logical start.
Midpoint seam ownership avoids appending the same overlap words twice. Results
commit before cursors and publication retries after interruption.

Import's STT checkboxes now select channels for live preview. They no longer
start detailed recognition before the explicit Speech to text request. The
dialog at that request sets future block length. Existing automatic queues
remain compatible; an explicit plan can supersede legacy segmentation. Detailed
jobs run separately from live passes; audio copying has bounded memory use.
After Finish, the queue drains its final short block and atomically updates
each channel's accurate-only `transcript.stt.srt`.

Imported Timeline now draws each subtitle word at its absolute interval.
Parent Script preserves word nodes and original indices, highlights every
channel at the shared time, and seeks all channel audio when a word is clicked.
Untimed text is not displayed as if it covered an arbitrary timeline interval.

Evidence:
- Full frontend suite: 430 tests / 53 files; full backend suite: 470 tests.
- After final start/snapshot refinements: 49 relevant frontend tests and all
  14 growing-MKV tests pass; typecheck/build and diff check pass. Two existing
  backend deprecation warnings remain (Starlette/httpx and audioop).
- Real acceptance script `.scratch/mkv-stt-02/verify_overlap.py` records a
  42-second AAC MKV with two speech tracks while import/follow and tiny/large-v3
  recognition run. Latest evidence project `mkv-stt02-overlap-acceptance-9a7877b4`,
  parent `asset-089c65a9843a`: before the button, detailed mode was false and its
  cursors zero; after Finish both tracks are complete with 91 timed words each,
  no reported STT error, correct saved context/merge offsets and SRT artifacts.
- Browser inspection verifies clicking a Script word seeks both lanes and
  highlights their independently timed words. No browser error was logged.
  Screenshots: `.scratch/mkv-stt-02/timed-words.png` and
  `.scratch/mkv-stt-02/timed-words-columns.png`.
- Managed API/STT reloaded, web build refreshed; OBS was left running unchanged.

Limits: model word timing still needs human accuracy review; this short English
fixture does not prove 30-minute Vietnamese accuracy or throughput. The 29:50
example is covered deterministically. Parent multi-channel SRT export and wider
Script/diarization viewport acceptance were not added in this round; SRT artifacts
and the existing selected-child subtitle export are per channel. ADR 0020 records
the timing contract. No commit was requested for this round.

### LIVELINK-UX-10 Track and capture feedback — 2026-10-02

OBS LiveLink now calls each independent source row a Track in the native dialog,
app mixer, Recorder, Timeline label and Script copy. New default aliases are
`Track N`; legacy `Channel N` aliases display as `Track N` without rewriting
recording metadata or user aliases. OBS' six mix tracks remain distinct from
LiveLink's independent source streams, so capture is not capped at six.

Recorder rows show durable PCM chunk counts beside the source meter and label
the meter as OBS signal, not proof of saved PCM. When a recording journal first
reports archive `ready`, Recorder asks the workspace to fetch Media Pool assets;
the verified MKA parent and any new children appear without F5. The callback
retries if the parent is not yet present. Selected Script edits stay in memory
because this refresh only inserts newly returned assets.

A static color audit found white on orange at 2.89:1 and undefined
`var(--surface)` foregrounds on several active states. Highlight text now uses
the dark foreground token on orange, lime, gold and red fills where measured;
the small gain number uses a theme-specific readable accent. The affected
token pairs measured at least 4.53:1 in their applicable theme. This was a
source-level audit, not a visual sweep of every rendered UI state.

Evidence: 432 frontend tests in 53 files, typecheck and Vite build pass. OBS
plugin RelWithDebInfo builds; native capture and spool tests pass 2/2 after
adding OBS' DLL directory to the test PATH. `git diff --check` passes. No
physical OBS recording was started for this round, and the existing installed
plugin DLL was not replaced while OBS might be running.

Remaining gap: a moving meter with PCM count zero still needs a real OBS trace
to determine whether capture callback, spool or API acknowledgement is absent.
The source-level contrast audit cannot certify every selected/hover/focus
combination in the app or the native OBS dialog. These matter because a source
can look active without a usable artifact, and inherited text colors can still
be hard to read at the owner's DPI.

Exact next round: `LIVELINK-CAPTURE-10` — record a real multi-source OBS take,
correlate source meter, callback, SQLite spool, API chunk count, journal, MKA
tracks and immediate Media Pool appearance; repair the first missing handoff.
Then `UI-CONTRAST-01B` performs the physical light/dark highlight sweep.

### LIVELINK-CAPTURE-10 Muted PCM and footage lifecycle — 2026-10-02

Completed scope:
- Inspected the owner's latest `Test_OBS 6` recording. Track 1 had 58.4 seconds
  of all-zero PCM despite a moving source meter; its Desktop Audio source was
  muted in OBS and forwarded in LiveLink. The native callback explicitly zeroed
  samples whenever OBS reported `muted`. Capture now records raw callback PCM
  when Forward is on, independently of the OBS mix mute. A native regression
  feeds nonzero source samples with `muted=true` and checks nonzero output.
- The same take had a verified MKA but archive status `error`, so the Media Pool
  had only hidden child WAVs. Project archive retry rebuilt the MKA parent and
  changed the journal to `ready`. Recorder and Media Pool now each try the
  latest failed archive once, with a visible manual retry if needed.
- Media Pool reads recording journals while mounted and displays an in-progress
  footage row during capture and finalization. It swaps to the persisted MKA
  parent when ready. The provisional row is labeled as recording/processing;
  it is not presented as a completed file. OBS rows missing from the current
  scene collection are hidden in plugin and app views but retained in the
  protocol and recording history. The owner's eight entries were six present
  sources plus two old missing sources; the current views therefore show six.
  Media Pool OBS labels now use Track, including stored default Channel aliases.
- Built and packaged the plugin, gracefully restarted idle OBS, repaired the
  installed plugin, and reopened OBS. Package and installed DLL SHA-256 both
  equal `F82EACDAB74E7693BF1CD12DFF8DEBD981651280C694B554B3ACC3AA018E28BF`.

Evidence:
- Frontend suite: 434 tests / 53 files; typecheck and Vite build pass. Native
  build passes; capture and spool tests pass 2/2 with OBS DLLs on PATH.
- After the final auto-retry and Track-label refinements, 57 focused frontend
  tests, typecheck, build, and diff check pass.
- Installed OBS 32.2.2 reconnects; current inventory has six present and two
  retained missing sources. A controlled five-second 440-Hz Desktop Audio
  playback produced moving Track 1 meter values while that source remained
  muted. The resulting ten-second take `26071d29-feaf-4a74-9faa-dca0466ae93c`
  finalized automatically to MKA `ready`; its Track 1 analysis WAV has peak
  32,284 and RMS 5,211. The MKA parent is returned by project media API.
- Recovered owner take `f25c8fd0-a786-4c74-85f0-43cb2ca75aee` is `ready`
  with parent `asset-live-587541be9c21`; its original Track 1 samples remain
  silent because the old plugin captured zeros. Source media was preserved.

Remaining gap: the provisional Media Pool row and automatic recovery are
component-tested but not visually checked in a running browser during a live
take. The physical test proved muted Track 1 with a known tone and MKA
publication, not all six sources carrying distinct simultaneous audio. The
original archive error was transient and its exact exception was not retained
in logs; a single automatic retry is now available when it recurs. These gaps
matter because layout and multi-source routing need separate real capture
evidence. No commit was requested; existing dirty work was preserved.

Exact next round: `LIVELINK-CAPTURE-10B` — observe the Media Pool row in the
running app while recording and after Stop, then record known audio on each
selected OBS source and verify per-track nonzero PCM, stream identity, and
archive publication. `UI-CONTRAST-01B` remains the separate physical theme
and highlight sweep.

### LIVELINK-TIMELINE-11 Live waveform and overlap controls — 2026-10-02

Completed scope:
- Live waveform subscriptions now treat each Timeline window as a separate
  cursor. A shifted or zoomed window fetches a full snapshot even if no new
  PCM sequence arrives; a late response for the previous window is discarded.
  The competing live full-fetch effect was removed. Tail bins beyond the last
  received PCM are shown as pending rather than red missing-PCM gaps.
- Timeline overlap markers are thin passive marks, so clicking and dragging
  the underlying waveform still seeks. Overlap selection in Script seeks only;
  it no longer starts or stops playback. Script overlap badges use compact
  time ranges. Space toggles archived track playback while the pointer is over
  the Timeline module, without overriding text entry or other controls.

Evidence:
- The owner's `Test_OBS 7` recording `1b775e3e-524a-4acb-8731-7b37057ec65f`
  has 925 Track 1 and 944 Track 4 durable PCM chunks. Sequence, sample-index,
  journal and MKA gap checks found zero missing spans; both tracks reach Stop.
  No overflow was logged for this recording.
- Chunk timestamps expose a separate throughput problem: median ingest delay
  about 1.3 seconds per track, 95th percentile about 62 seconds, last chunk
  about 50 seconds late. OBS spool pending grew from 9 around 01:16 to 153
  around 01:20 and drained after Stop. The frontend changes cannot remove this
  upstream delay; the pending label makes it explicit.
- Frontend focused tests cover window shifts, stale responses, passive overlap
  marks, Space playback, and pending versus internal missing PCM. Full suite,
  typecheck, build and diff check passed in this round.

Remaining gap: the new Timeline behavior was not observed during another long
real OBS take. The PCM sender still falls behind realtime under the owner's
long two-track recording with live STT. This matters because even a correct
frontend cannot draw PCM that has not reached the API. Existing user changes
were preserved; no commit or OBS restart was made.

Exact next round: `LIVELINK-INGEST-11B` — profile native spool send, HTTP ACK,
API durable write and concurrent STT during a sustained two-track OBS run;
remove the measured bottleneck and verify low tail latency, zero sample gaps,
and final MKA at Stop. `LIVELINK-CAPTURE-10B` and `UI-CONTRAST-01B` remain the
separate Media Pool/multi-source and physical contrast gates.

### LIVELINK-STT-12 Live transcript quality and cadence — 2026-10-02

Completed scope:
- LiveLink v3 STT uses the locally available `medium` recognizer and accumulates
  four seconds of voiced PCM per live pass. The recognizer receives the Project
  language when set; a Project with no language still uses automatic detection.
  The model and cadence are separate from imported-MKV and batch STT paths.
- STT runtime setup now preloads `medium` alongside the batch model; the
  portable-runtime check requires both models so a packaged LiveLink session
  does not silently depend on an online download.
- The two-channel transcript queue remains ordered and bounded. Durable PCM
  capture still ACKs independently of STT. No historical transcript was
  rewritten and source audio was not changed. See ADR 0022.

Evidence:
- The owner's 11-minute `Test_OBS 7` transcript has 171 Track 1 live STT
  queue-full errors, median event lag about 45 seconds and maximum 203 seconds.
  Its PCM archive had no sample gaps. Recognition and transcript backlog are
  distinct from audio capture completeness.
- On a preserved 12-second Track 1 excerpt, `medium` recognizes terms such as
  "Chopper AI" and "anh Minh" where `tiny` produces unrelated wording. This is
  qualitative inspection, not a word-error-rate measurement against verified
  text. In an offline 24-second-per-track two-stream replay, old `tiny`/2-second
  passes took 72.69 seconds across 24 calls; `medium`/4-second passes took
  12.28 seconds across 12 calls on this machine's CUDA runtime. The latter
  stayed below the 24-second elapsed audio interval in that probe.
- The full backend suite passed 471 tests before the final parameterized
  language-test refinement; all six focused LiveLink STT tests passed after it.
  These verify explicit and automatic language handling and the studio request
  model. The STT portable-runtime profile passed all six local checks, including
  the new `medium` weight check. Live OBS acceptance remains a separate gate.

Remaining gap: the replay does not include native plugin upload, HTTP and disk
write pressure, so it cannot prove a new long take will avoid queue overflow or
PCM spool delay. Projects without a chosen language still rely on detection;
there is no per-recording language picker. Real transcript accuracy has not
been scored against a manually verified reference. These gaps matter for
multilingual lessons and sustained recordings.

Exact next round: `VOICE-EXPORT-13` — add Voice Manipulator audio export and
word/line SRT from outputs with verified timing, then test generated artifacts.
`LIVELINK-INGEST-11B` remains the real OBS load gate; `LIVELINK-MEDIA-14` and
`LIVELINK-OVERLAP-15` cover the other requests from this session.

### VOICE-EXPORT-13 Voice Manipulator WAV and SRT — 2026-10-02

Completed scope:
- Each Voice Output row offers WAV, SRT by Script line, and SRT by word. The
  active output's Script export menu offers the same choices and retains the
  existing sentence SRT and Script CSV options. The browser downloads the
  original generated WAV; it does not render or resample another copy.
- A line SRT cue uses each saved Voice Output segment's text, speaker and
  start/end on the assembled audio timeline. This remains available when word
  recognition failed or word timing is estimated. Word SRT continues to use
  measured per-word intervals and omits untrusted words. Missing or invalid
  line boundaries fail closed. See ADR 0023.

Evidence:
- An API test generated a two-row WAV with a half-second gap and no trusted
  word timing. WAV download matched the saved file byte-for-byte; line SRT had
  two cues at 0.000–0.500 and 1.000–1.500 seconds, while word SRT returned 400.
- All seven Voice Outputs currently present under local project folders have
  ordered, in-range saved segment boundaries (read-only metadata check).
- The complete backend suite passed 474/474; focused subtitle/voice-script
  tests passed 19/19 again after the final atomic-write refinement. Frontend
  passed 441/441 tests, typecheck, and production build; UI tests cover choosing
  a specific output and disabling word export when timing is untrusted.

Remaining gap: the app was not running for a manual browser-download and
viewport check. Direct legacy Voice Outputs without Script-row segments can
download WAV but have no honest per-row SRT timestamps. This matters because
generating those timestamps from text alone would misrepresent the audio.

Exact next round: `LIVELINK-MEDIA-14` — make the in-progress OBS footage row
open its recorded tracks and available actions while capture continues, with
live project artifact and UI checks. `LIVELINK-OVERLAP-15` then connects Script
and Timeline overlap selection; `LIVELINK-INGEST-11B` remains the sustained OBS
load gate.

### MEDIA-SCRIPT-01C Concurrent track rows and timed overlap — 2026-10-02

Completed scope:
- Parent Script now groups recognized words per track before ordering rows by
  start time. An interjection on another track does not close speech that
  continues on the original track. Another track speaking in a genuine gap
  closes the earlier turn; a diarized speaker change still makes a new row.
  OBS realtime turns use the same track-continuation rule.
- OBS archive rows show `Track N` and a custom alias where present, rather than
  the full footage asset name. Each row shows start/end to centiseconds; each
  word exposes its saved millisecond timestamp on hover/focus and in its
  accessible name. These are source STT times, not newly inferred alignment.
- Realtime overlap requires recognized text and at least 0.4 seconds of
  shared segment time. After detailed STT, parent Script derives overlap from
  trusted word intervals on different tracks, applying the same minimum and
  showing seekable review badges. See ADR 0024.

Evidence:
- Regressions first failed for track interjection, full OBS asset labels, and
  listening-only/very short overlap; all focused tests now pass. The full
  frontend suite passes 446/446, with typecheck, Vite build, and diff check.
- Read-only replay of the owner's `Test_OBS 7` MKA `6d8e0b65` found 157 timed
  words on Track 1 and 70 on Track 4. The new grouping yields seven rows;
  Track 1 stays in one row from 0.096 to 15.740 seconds while Track 4 begins
  at 8.096 seconds. Saved word timestamps were already present; this round
  makes them visible and prevents display grouping from fragmenting them.
- The same project has a stopped, archive-ready recording journal
  `1b775e3e` with no MKA asset in its media index. The journal-only Media Pool
  path would render it as pending after permanent deletion; this round did not
  modify deletion or remove owner media.

Remaining gap: the 0.4-second floor removes short timing artifacts but cannot
prove acoustic overlap when one OBS source contains bleed from another. A
running-browser viewport check is still needed. LiveLink's explicit detailed
STT still reads each analysis WAV once and lacks continuing blocks with
10-second padding; permanent OBS deletion can leave a journal-only placeholder.
These matter because the visible Script can improve while long-running
recognition and Media Pool lifecycle remain incorrect.

Exact next round: `LIVELINK-STT-16` — add durable initial PCM snapshot and
configurable subsequent detailed STT blocks per selected LiveLink track, each
with 10 seconds of preceding audio and seam-safe word replacement. Follow with
`MEDIA-DELETE-17` for the confirmed journal-backed deleted footage.

### LIVELINK-STT-16 Detailed PCM snapshot and padded blocks — 2026-10-02

Completed:
- Added a journal-backed detailed STT plan for selected LiveLink tracks. The
  initial frame boundary is saved at the button press, independently of the
  realtime transcript queue and the one-shot media batch queue.
- Rendered immutable PCM slices from verified durable source chunks, preserving
  sample-index gaps, pause/disabled intervals, source sample rate and timing;
  FFmpeg produces deliberate 24 kHz mono analysis segments for recognition.
- Added a 10–600-second subsequent block choice in the in-progress Media Pool
  row. Each new block includes ten seconds before its boundary and replaces
  words from the five-second seam by word midpoint. Missing word timestamps
  fail without advancing the cursor.
- Persisted recognition result before the per-track cursor, resumed jobs at
  API startup, drained tails after Stop, and published track SRT plus timed
  transcript after the verified MKA archive becomes ready. Kept user text edits.
  Subsequent polls inspect only new durable chunk sequences.

Evidence:
- Backend full suite: 478 passed; the focused four tests passed again after
  incremental chunk reads. Frontend full suite: 447 passed; TypeScript
  typecheck, Vite build, and `git diff --check` passed. A parallel test run
  briefly failed an unrelated Web Audio gain assertion; the isolated Timeline
  suite and later full frontend run passed.
- New generated-PCM tests cover two tracks with different start snapshots,
  restart, 10-second padding, a short final tail, gap/pause silence, missing
  word timestamps, asset publication, and API validation.
- Read-only rendering of the owner's archived two-track `Test_OBS 7` capture
  (`6d8e0b65`) produced 120,000-frame, mono 24 kHz WAVs for both sources. The
  first four seconds of each matched the corresponding archived analysis WAV
  byte for byte. No owner media was changed.

Remaining gap: physical OBS recording while the app and STT model run together
has not been exercised. That gate matters for GPU contention, PCM spool lag,
the live Media Pool button, and final asset publication in the running app.
`LIVELINK-MEDIA-14` remains the separate full provisional-footage interaction
round; this round adds only the detailed STT action to the provisional row.

Exact next round: `MEDIA-DELETE-17` — reconcile permanent OBS footage deletion
with journal-backed Media Pool discovery, then verify a deleted MKA cannot
reappear as a pending recording row. Keep `LIVELINK-INGEST-11B` as the physical
long-take backlog gate.

## Round MEDIA-DELETE-17 — 2026-10-02

Completed scope:
- Permanent deletion of an OBS MKA parent now writes the recording ID to
  project-owned `assets/obs-livelink/deleted-recordings.json`, then removes the
  recording folder and grouped assets. The API serializes this with the
  recording's archive and LiveLink journal locks.
- LiveLink state persistence and restart discard deleted IDs. Recovery and
  archive retry reject them. Recording discovery excludes those IDs and also
  excludes older archive-ready journals whose parent asset no longer exists;
  a journal without a parent ID is hidden only when both MKA and PCM chunks
  are absent. This keeps unfinished recordings discoverable.

Evidence:
- Backend full suite: 482 passed. Frontend full suite: 447 passed. TypeScript
  typecheck, Vite build, and `git diff --check` passed.
- Tests cover the permanent-delete API, project reload, stale machine-state
  restore, journal persistence, archive retry and legacy orphan discovery.
- Read-only inspection of the owner's `Test_OBS 7` recording
  `1b775e3e-524a-4acb-8731-7b37057ec65f` found `archiveStatus=ready`,
  parent asset `asset-live-b8a59398d825` absent from the media index, no
  `source.mka`, and zero PCM chunks. It meets the orphan filter. No owner media
  was modified for this inspection.

Remaining gap: the updated app was not run against the owner's live OBS process
and Media Pool viewport. The old orphan journal remains on disk as forensic
metadata, but is no longer returned as pending footage; the code cannot infer
that every unindexed journal should be physically erased because an archive
can also be damaged or moved. A running-app check matters to confirm the row
disappears without a manual refresh and a newly deleted take stays absent.

Exact next round: `LIVELINK-MEDIA-14` — make the in-progress OBS footage row
fully interactive during capture. Keep `LIVELINK-INGEST-11B` and
`UI-CONTRAST-01B` as separate physical acceptance rounds.

## Round LIVELINK-MEDIA-14 — 2026-10-02

Completed scope:
- The provisional OBS Media Pool row can expand its forwarded/saved tracks.
  Opening a row clears the previous asset selection and shows its live Timeline
  and Script; opening a track selects its lane without interrupting live follow.
- Each track with durable PCM offers a 30-second listening preview. The API
  validates recording/project/channel ownership, reads the continuous ACKed
  prefix, verifies source PCM hashes, preserves gaps and pause/disabled silence,
  and renders a temporary mono 24 kHz WAV outside the project. It reports the
  exact preview time range and leaves source/project assets unchanged.
- The Media Pool highlights the selected provisional row. When its verified MKA
  arrives, the selected recording moves to the ordinary archived footage asset
  without a manual refresh or a selection reset.

Evidence:
- Backend full suite: 483 passed. Frontend full suite: 450 passed. TypeScript
  typecheck and Vite production build passed.
- API tests cover the generated two-second PCM preview, time bounds, project
  derivative absence, missing channel, and CORS-visible range headers. UI tests
  cover track focus, audio preview, selecting over an old asset, archive handoff,
  and a lane request that arrives before the live lanes.
- Read-only replay of the owner's archived `Test_OBS 7` source PCM produced a
  one-second, 24,000-frame mono WAV without modifying the project.

Remaining gap: a physical OBS recording and app viewport check is still needed
to confirm live row responsiveness, per-track playback, and the journal-to-MKA
transition under real capture load. Long-take PCM spool lag remains in
`LIVELINK-INGEST-11B`; the short preview does not make an unfinished MKA a
seekable full-length footage file.

Exact next round: `LIVELINK-OVERLAP-15` — link Script overlap selection with
the corresponding Timeline interval in both directions. Keep the physical
LiveLink capture/viewport gate and `LIVELINK-INGEST-11B` separate.

## Round LIVELINK-OVERLAP-15 — 2026-10-02

Completed scope:
- Added one transient OBS overlap selection with recording ID, exact time range,
  and participating source IDs. Realtime selections use LiveLink channel IDs;
  detailed STT selections use archived track asset IDs. Switching recordings or
  leaving OBS Timeline clears the selection.
- Clicking a Script overlap badge selects the same interval on both participating
  Timeline lanes and seeks the chosen source without starting playback. The
  archived word-timed Script now sends an asset-targeted seek that OBS Timeline
  actually handles; the imported multitrack Script keeps its existing seek.
- Clicking a Timeline waveform inside an overlap selects its Script badges and
  shows the clipped interval on each participating lane. The thin red markers
  remain pointer-passive so dragging the waveform still works. In single-track
  OBS view, selection returns to the parent Script so both sources are visible.
- After detailed STT exists, Timeline derives markers from the same trusted
  word overlap rows as parent Script instead of retaining stale realtime-only
  overlap indicators.

Evidence:
- Frontend full suite: 455 passed; TypeScript typecheck and Vite build passed.
  Tests cover live and archived Script badge selection, Timeline click/drag and
  no autoplay, asset-targeted seek even when stem IDs arrive late,
  detail-over-draft timing, single-track return to parent, and selection
  clearing on recording change.
- No backend or media files changed. The overlap remains a review interval, not
  evidence of acoustically separate speakers or trusted subtitle timing.

Remaining gap: the running app at the owner's viewport and a real OBS take have
not been used to verify marker hit areas, selected-range contrast in both
layouts/themes, and timing under live transcript revisions. DOM tests establish
state and event behavior but cannot prove these physical pointer/visual details.

Exact next round: `LIVELINK-INGEST-11B` — measure and reduce the long-take PCM
spool backlog under simultaneous OBS capture and STT load. Keep the physical
overlap viewport check in the final `LIVELINK-08` acceptance matrix.

## Round LIVELINK-INGEST-11B — 2026-10-02

Completed scope:
- API PCM ingress now validates the immediate predecessor metadata by sequence
  instead of enumerating and sorting every prior chunk in a long take. The
  existing duplicate/hash and sample-index/format checks remain in place.
- The OBS sender can deliver up to 20 queued chunks per control cycle instead
  of five, with a one-second burst budget so lifecycle and channel commands
  continue to be polled. Its five-second spool log now includes HTTP send
  count, average request duration and maximum request duration for diagnosis.
- Built the updated native plugin and refreshed the local plugin package and
  matching SHA-256 manifest. The running OBS process has not loaded it yet.

Evidence:
- The regression test failed on the old full-directory scan and passed after
  the predecessor lookup. It also rejects a skipped sequence. Backend full
  suite: 484 passed; frontend: 455 passed, typecheck and build passed.
- Native Release and RelWithDebInfo builds passed. Capture and spool native
  tests: 2/2 passed with the OBS DLL directory on PATH. The packaged DLL hash
  matches its manifest.
- On an isolated two-track, 360-chunk PCM replay, median API persistence time
  for sequences 150–179 fell from 26.8 to 23.9 ms/chunk. The old directory
  scan alone took about 4.7 ms at 900 metadata files and 9.3 ms at 1,800
  files on this machine. This replay excludes native HTTP and concurrent STT.

Remaining gap: no sustained OBS take with live STT has run against the newly
built plugin and API. The earlier 153-chunk peak and ~50-second tail have not
been remeasured after installation. This matters because API disk I/O, HTTP
ACKs, native control polling and model load can still compete in the actual
session; an isolated replay cannot establish gap-free, low-latency capture.

Exact next round: `LIVELINK-INGEST-11C` — load the updated package in OBS,
record a sustained two-track take with live and detailed STT, read the new
spool/HTTP metrics and project PCM timestamps, and verify low tail latency,
zero sample gaps and a final two-track MKA. Continue the final `LIVELINK-08`
acceptance matrix after that result.

## Round LIVELINK-INGEST-11C — 2026-10-02

Completed scope:
- Repaired and installed the packaged plugin 0.6.6, started OBS 32.2.2 and the
  local API/STT runtimes, then recorded two independent looping speech sources
  through native OBS for 497.288 seconds. Detailed `large-v3` STT began during
  the take on both tracks with 60-second blocks; automatic realtime STT ran
  concurrently. The test used copies of existing analysis WAVs in ignored
  `.scratch/livelink-ingest-11c`, leaving the owner's source media untouched.
- Restored the original OBS scene, recording directory and Forward selection,
  removed test sources, released the test project lease, and stopped the OBS
  and app processes started for this check.

Evidence:
- Recording `3daf7486-0c86-4bbf-9929-ff344646dca8` in the isolated project
  contains 793 and 795 native PCM chunks at 48 kHz stereo. Sequence, SHA-256,
  format and sample-index checks found zero missing or overlapping samples on
  either track. The final MKA hash matches its journal, decodes without errors,
  and holds two 48 kHz stereo FLAC tracks trimmed to 497.289 seconds.
- 89 OBS spool telemetry samples report 1,588 HTTP sends, zero capture-time
  queue overflow/reject log entries, peak pending 56 versus the prior 153,
  weighted mean HTTP duration 258.8 ms and worst request 1,986 ms. Pending
  returned to zero after Stop. The last PCM receipt was 2.268 seconds after
  the Stop request versus roughly 50 seconds in the earlier take.
- Per-track median PCM ingest lag was 5.96/6.21 seconds; p95 was 16.29/16.49
  seconds, maximum 18.39/18.65 seconds, and the final chunks lagged 1.63/1.51
  seconds. Final raw chunks extended about 0.6 seconds beyond the Stop request;
  the published MKA ends at the recorded Stop boundary.
- Detailed STT published both assets with 128 and 66 SRT cues. The realtime
  stream emitted 113 text events but also 382 `Live STT queue is full` errors,
  concentrated in the first six minutes. These errors do not indicate PCM loss.
  Repro steps, monitor samples and read-only forensic checks remain in ignored
  `.scratch/livelink-ingest-11c`.

Remaining gap: the two-track native capture and archive integrity gate passed,
but PCM did not stay near real time throughout the take, and realtime STT lost
queued recognition work under simultaneous detailed STT. This matters because
the live waveform may appear late and the provisional transcript may omit
speech even though the durable audio and final detailed STT are intact. The
sources were controlled OBS media inputs, so the owner's full physical source
matrix and app viewport still require final `LIVELINK-08` acceptance.

Exact next round: `LIVELINK-INGEST-11D` — profile the HTTP ACK and API write
critical path during sustained two-track capture, reduce p95 PCM ingest lag,
then repeat the OBS load test. Follow with `LIVELINK-STT-12B` for the separate
realtime transcription queue-loss path.

## Round LIVELINK-INGEST-11D — 2026-10-02

Completed scope:
- Profiled the durable PCM ACK path with 100 real 11C source chunks. At the
  baseline median, PCM flush cost 37.68 ms, metadata flush 50.76 ms, envelope
  flush 38.2 ms, and waveform point calculation 9.93 ms. The source PCM and
  metadata remain flushed before ACK; their temporary files now flush in
  parallel and publish PCM before metadata. The rebuildable waveform sidecar
  keeps atomic replace without a separate flush on the ACK path. See ADR 0029.
- Repeated a native OBS recording with the same two copied speech fixtures,
  automatic live STT, and detailed `large-v3` STT started during capture.
  Restored OBS scene, Forward choices and recording folder, then stopped the
  OBS and app processes started for the round. Source media was not changed.

Evidence:
- A failure-injection test went red before the pair writer existed and green
  after implementation. It verifies that failed PCM publication leaves no
  committed metadata and that retry succeeds. Full backend suite: 485 passed.
- In the 304.05-second take, 516/517 PCM chunks were contiguous at 48 kHz
  stereo with zero missing/overlapping samples. The MKA hash matches the
  journal, decodes both FLAC tracks, and ends at 304.049 seconds. Detailed STT
  published both tracks. The last PCM arrived 1.713 seconds after Stop.
- Per-track median ingest lag was 0.531/0.664 seconds, p95 4.199/4.141
  seconds, maximum 7.207/7.340 seconds. The 11C take's first 304 seconds had
  13.036/13.304-second median and 16.955/17.232-second p95 on the same
  fixtures. The measured spool peak fell from 56 to 20 chunks, median pending
  was one, and pending returned to zero. OBS telemetry logged 1,033 sends,
  weighted mean HTTP duration 188.8 ms versus 258.8 ms in the full 11C run,
  with no capture overflow or rejected chunk in the new take.
- Read-only samples, media verification and comparison scripts are retained in
  ignored `.scratch/livelink-ingest-11d`; tracked source and docs pass
  `git diff --check`.

Remaining gap: the new 304-second test is shorter than 11C's 497-second take
and starts app capture at a different point in the OBS session, so it cannot
prove the same p95 under every long-session load. More importantly, realtime
STT still emitted 47 queue-full errors while durable PCM and detailed STT were
complete. Live Script can therefore omit speech even when the waveform and
final archive remain intact. The owner's full OBS source matrix and live UI
viewport are still part of final `LIVELINK-08` acceptance.

Exact next round: `LIVELINK-STT-12B` — replace the lossy realtime STT queue
behavior with a durable per-track catch-up path, then verify two-track live
transcription during simultaneous detailed STT without losing recorded audio.

## Round LIVELINK-STT-12B — 2026-10-02

Completed scope:
- Replaced the realtime STT queue-full discard path with a bounded in-memory
  queue plus a per-track sequence cursor over PCM already committed by the API.
  When the queue fills, the worker reads the remaining chunks in order from the
  project journal, verifies sequence, source and SHA-256, and finishes the tail
  after OBS Stop. Failed verification reports an error instead of inventing
  transcript text. See ADR 0030.
- Recorded 185.71 seconds with two independent OBS speech sources, automatic
  live STT, and detailed `large-v3` STT started during capture. The isolated
  fixture and read-only analysis are in ignored `.scratch/livelink-stt-12b`;
  source media was not modified. Restored OBS scene, recording directory and
  Forward settings, released the test lease, and stopped the OBS/API/Studio
  processes started for the round.

Evidence:
- A forced one-chunk RAM queue test was red on the old discard behavior and
  green after catch-up: 24 committed chunks on each of two tracks produced 24
  partial recognitions per track and final events through all 11,520 frames.
  A corruption test rejects a deferred chunk with a bad hash. Focused backend
  tests: 8 passed. Full backend suite: 487 passed, with two existing
  deprecation warnings.
- Real OBS produced 330/329 48 kHz stereo chunks, with zero sample gaps or
  overlaps on either track. The last PCM arrived 1.503 seconds after Stop;
  p95 ingress lag was 0.972/1.133 seconds and spool peak was two chunks. The
  5,294,525-byte MKA matches the journal hash and decodes two FLAC streams
  through the 185.71-second Stop boundary.
- Live STT wrote 104 events including 52 text events, with zero queue-full or
  other event errors in this take. Both tracks have final events through their
  last voiced interval; detailed STT published both track assets. OBS telemetry
  had no native PCM overflow or rejected chunks. The physical run did not
  force the deferred cursor to activate; the forced-backlog test covers that
  code path.

Remaining gap: the deferred cursor exists only inside the running API process,
so an API restart during backlog does not resume provisional STT. Live text can
also lag under simultaneous detailed STT: the largest final-event lag was
26.828/20.578 seconds. This matters because a complete recording can still
appear to lack current captions or lose unprocessed live text after a crash.
The owner viewport and broader OBS source matrix remain for `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12C` — checkpoint per-track realtime STT
progress and resume unread committed PCM after API restart without duplicate
final events, then measure catch-up lag. Continue the final `LIVELINK-08`
source and UI gate afterward.

## Round LIVELINK-STT-12C — 2026-10-02

Completed scope:
- Added a project-owned, atomically replaced `live-stt-progress.json` per OBS
  track. It records the next PCM sequence and the start sequence of an open
  utterance. API startup discovers these checkpoints, replays the open
  utterance to rebuild the recognizer session, and drains unread committed PCM
  even when OBS sends no new upload. A version marker on newly created
  `recording.json` journals covers a crash before the first checkpoint without
  triggering transcription of every legacy completed recording. Deleted
  recordings are excluded. See ADR 0031.
- Kept the public transcript journal idempotent across replay using the track,
  utterance, event status and ending sample as the event identity. A fresh
  recognizer session ID after API restart prevents old Studio session audio
  from being appended a second time. A transient Windows file lock retries
  checkpoint replacement. A failed event-journal write stops the worker
  without advancing its checkpoint; later uploads cannot open a new queue past
  the gap, so restart can retry all committed PCM. Permanent worker failures
  are logged and reported.
- Added graceful worker cancellation on API shutdown. Copied the 12B physical
  OBS PCM into an isolated ignored project for restart measurement; original
  source PCM and MKA remain unchanged.

Evidence:
- A two-track forced-backlog test interrupts processing, recreates the STT
  adapter, drains both tracks, then rewinds one checkpoint behind an already
  committed final event. The event journal remains byte-for-byte equivalent
  after replay, with one final per utterance and monotonic event revisions.
  Another test restarts during active speech, accepts later PCM, and retains
  one utterance across the seam. FastAPI startup restores a stopped recording
  without a new upload; tests cover the Windows checkpoint lock retry and
  event-write failure before checkpoint advancement and another chunk arriving
  after that failure.
- The copied 185.71-second OBS source contains 330/329 PCM chunks. With a
  deterministic 5-ms fake recognizer, a simulated restart after 8.594 seconds
  completed all 659 chunks in 34.328 seconds total, 25.734 seconds after
  restart. Both final checkpoints reached sequence 330/329; 104 transcript
  events included 24 finals, zero duplicate finals and zero error events.
  Replay report and script are in ignored `.scratch/livelink-stt-12c`.
- Focused Live STT tests: 13 passed. Full backend suite: 492 passed with two
  existing deprecation warnings.

Remaining gap: no running OBS/API process was restarted during a physical
recording with the real `medium` live recognizer and concurrent detailed STT.
The measured 25.734-second replay tail uses a fake recognizer and cannot
predict GPU contention or the caption delay seen by the owner. This matters
because the durable cursor can be correct while the live Script still catches
up too slowly under model load. The full owner source matrix and viewport also
remain in `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12D` — restart the API during a real two-track
OBS take with simultaneous live and detailed STT, then verify the PCM, event
and checkpoint tails and measure visible caption lag. Continue the final
`LIVELINK-08` source/UI gate after that result.

## Round LIVELINK-STT-12D — 2026-10-03

Completed scope:
- Ran two isolated physical OBS 32.2.2 takes with two looping speech sources,
  automatic `medium` per-track live STT and user-started `large-v3` detailed STT.
  Restarted only the FastAPI process while OBS and Studio stayed running. Test
  projects, source media and reports are in ignored `.scratch/livelink-stt-12d`
  and `.scratch/livelink-stt-12d-retry`; no product source changed. Restored the
  original OBS scene, recording directory and six present-channel Forward
  settings after each take, then released the test lease.
- The first restart using a detached PowerShell `Start-Process` launcher briefly
  served requests, then lost its listener while Python remained alive. Its
  268.723-second recording was stopped and recovered by a foreground API launch:
  400/401 PCM chunks and live checkpoints reached the tail, a two-track MKA
  decoded, and no final transcript was duplicated. That outage made its latency
  measurement unsuitable for the intended model-contention comparison; the
  launcher failure is not yet attributed to product code.
- Repeated the take with an observed foreground API restart at 114.156 seconds
  into a 173.507-second recording. Studio kept the same PID. The API remained
  available through Stop and archive finalization.

Evidence:
- The retry retained 288 consecutive 48 kHz stereo PCM chunks per track with
  zero sample gaps or overlaps and 148/170 nonzero chunks. Its 4,866,298-byte
  MKA matched the journal SHA-256 and decoded two FLAC audio streams through
  the Stop boundary. PCM ingress p95 was 2.536/2.777 seconds, spool peak was
  20 chunks and was empty at Stop. The final PCM receipt was 2.729 seconds
  after Stop.
- Both live STT checkpoints reached sequence 288/288 roughly 15 seconds after
  Stop. There were 94 transcript events, 21 finals, zero event errors and zero
  duplicate finals. Detailed STT reached and published the full 4,164,171
  analysis frames on both tracks. The maximum live event `lagSeconds` values
  were 29.417/42.745 seconds. Estimated caption age relative to the latest
  transcribed audio after restart had medians 11.689/12.715 seconds and maxima
  19.434/29.092 seconds; these subtract utterance duration from event lag and
  do not measure browser paint time.
- Read-only sample/hash/decode checks and the restart report are in ignored
  `.scratch/livelink-stt-12d-retry`. Focused backend regression:
  `test_obs_livelink_runtime.py` 21 passed with two existing deprecation
  warnings. OBS settings and lease were checked after cleanup.

Remaining gap: the owner viewport was not observed during the take, so the
caption-age estimate does not prove perceived UI delay. Live captions still
lagged by up to about 29 seconds after the process restart under model load,
even though no PCM or transcript tail was lost. The detached API launcher lost
its listener in the first attempt and needs a controlled reproduction before
blaming the app. The full OBS source matrix and viewport remain in
`LIVELINK-08`.

Exact next round: `LIVELINK-STT-12E` — reproduce the detached-launch failure,
then reduce and remeasure post-restart live-caption lag while detailed STT runs.
Continue the final `LIVELINK-08` source/UI gate afterward.

## Round LIVELINK-STT-12E — 2026-10-03

Completed scope:
- Diagnosed Studio's single-model retention as repeated construction when
  `medium` live STT and `large-v3` detailed STT alternate. Added a two-model
  least-recently-used cache only when CUDA reports at least 20 GiB total and
  6 GiB free, with single-model fallback and observable load counts (ADR 0032).
- Reproduced the 12D detached API restart method first without OBS load, then
  during a 172.806-second physical two-track OBS recording with both STT modes
  active. The API listener stayed healthy for 18 samples over 90 seconds in
  both attempts; the first 12D listener loss did not recur. OBS scene,
  recording directory and the original six channel Forward states were
  restored, and the test lease was released.

Evidence:
- The fixed five-request Studio benchmark changed repeated `medium` calls
  from 3.195/3.213 to 0.619/0.556 seconds and repeated `large-v3` from
  10.392 to 5.875 seconds. The Studio reported both models resident and two
  successful model loads. Cold-call times varied and are not counted as a gain.
- The physical take retained 276 contiguous 48 kHz stereo PCM chunks per
  track with zero sample gaps or overlaps; the 4,838,627-byte MKA matched the
  journal hash and decoded two FLAC streams through 172.806 seconds. Its PCM
  ingress p95 was 5.711/5.914 seconds; spool peak was 26 and drained to zero.
  Both live checkpoints reached sequence 276, with 96 events, 22 finals,
  zero event errors or duplicate finals. Detailed STT published both tracks.
- Using the same event-lag estimate as 12D, post-restart caption delay medians
  fell from 11.689/12.715 to 0.923/1.764 seconds; maxima fell from
  19.434/29.092 to 16.029/10.912 seconds. An independent one-second API poll
  measured post-restart caption age medians 6.147/4.641 seconds and maxima
  17.940/12.378 seconds. Neither measures browser paint. The restart happened
  at 116.706 seconds; the detached launcher became ready in about 8.5 seconds
  and kept the same Studio PID.
- Studio cache/local-agreement tests: 14 passed. Focused LiveLink API tests:
  21 passed. Full API suite: 492 passed; Python compilation and `git diff
  --check` passed. The test OBS process and app workloads were stopped after
  the recording and report checks.
  Read-only acceptance data is in ignored `.scratch/livelink-stt-12e`,
  `.scratch/livelink-stt-12e-physical` and the prior 12D retry directory.

Remaining gap: the 12D detached-listener failure was not reproduced, so its
root cause remains unknown. Caption peaks still reached 16.0/10.9 seconds by
the event estimate, and the owner viewport was not measured. The separate
takes do not prove that the model cache alone caused every latency difference;
PCM ingress and recognition load also varied. The full source/UI matrix stays
in `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12F` — capture browser-visible caption timing
and trace the remaining peaks during sustained two-track OBS plus detailed
STT; then continue the final `LIVELINK-08` source/UI gate.

## Round LIVELINK-STT-12F — 2026-10-03

Completed scope:
- Captured PCM receipt, recognition request, event persistence, browser receipt
  and double-animation-frame row timing with temporary probes. Removed those
  probes byte-for-byte after measurement; this is a diagnostic/documentation
  round, with no claimed product performance improvement.
- Ran a 234.233-second cold two-track OBS take with detailed STT and API restart,
  recovered an interrupted 161.744-second attempt, then measured a warmed
  controlled take with Script in the viewport and detailed STT started at 36.6
  seconds. A status-request RemoteProtocolError stopped the controlled take at
  70.804 seconds; its API listener remained healthy afterward.
- Used an isolated portable OBS copy and later an isolated API project registry
  to separate the current take from recovery of older projects. Restored scene,
  recording directory and the six original visible-source Forward settings,
  released the lease and stopped all test processes.

Evidence:
- Controlled take: 104 consecutive 48 kHz stereo PCM chunks per track, zero
  sample gaps/overlaps, and a 2,036,378-byte hash-verified MKA decoding both
  FLAC streams through Stop. Live checkpoints reached 104/104, with 35 events,
  zero error-status events or duplicate finals. Detailed STT published the full
  1,699,284/1,699,285 analysis frames; the native spool drained to zero.
- All 35 events reached the browser. Measured 26 resulting row revisions:
  12 intersected the list viewport and 14 were offscreen. Browser receipt to
  frame had median 0.039 seconds, p95 0.115 and max 1.882; persistence to receipt
  had median 0.485, p95 1.171 and max 1.283. These are render-boundary proxies,
  not compositor presentation timing. Visible caption audio-age medians were
  11.151/9.850 seconds and maxima 23.123/10.321, on only 9/3 samples.
- Controlled PCM ingress p95 was 33.210/33.964 seconds. The offscreen tail
  caption peaked at 54.379 seconds: 33.999 seconds before PCM receipt, 19.369
  until event persistence, 0.976 until browser receipt and 0.035 until the frame
  callback. A live request in this tail lasted 14.234 seconds with models warm.
  Both ingress and recognition remain relevant; browser render time alone
  cannot explain the peak. Polling has not been proven to cause slower ingress.
- Cold take: 350 contiguous chunks per track and a verified 6,436,215-byte MKA;
  complete live checkpoints and detailed publication, but one opening live
  timeout produced an error event with an empty error string. PCM p95 was
  63.405/63.699 seconds and live catch-up finished about 152–155 seconds after
  Stop. The interrupted warm attempt also recovered gap-free PCM and a verified
  two-stream archive. Neither is a clean warmed latency comparison with 12E.
- Detailed method, peak decomposition and launch/harness limitations:
  `docs/gates/livelink-stt-12f-browser.md`; raw evidence stays in ignored
  `.scratch/livelink-stt-12f-physical`, `-warm` and `-controlled` directories.
- Frontend verification after probe removal: default `npm test` exited 1 with
  218 passing tests and 19 worker-start timeouts; the full rerun with
  `--maxWorkers=2` passed all 54 files / 455 tests. Typecheck and production
  build passed. Focused backend runtime tests: 21 passed with two existing
  deprecation warnings. `git diff --check` passed; product/engine source is clean.

Remaining gap: the planned sustained browser duration did not complete.
Listener loss recurred in another launch without an isolated cause; the cold
live timeout, workspace source reset on partial runtime status, and offscreen
new Script rows remain open. Data continuity does not establish complete live
text after a timeout or acceptable perceived caption latency. The wider source,
owner viewport/DPI and clean-machine gates remain in `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12G` — profile native PCM HTTP ACK stages while
the browser workspace polls during a sustained two-track take, reduce the
measured bottleneck, then repeat ingress and caption timing. Continue the
remaining startup/reconnect UX and final `LIVELINK-08` gates afterward.

## Round LIVELINK-STT-12G — 2026-10-03

Completed scope:

- Profiled PCM ACK stages with the browser workspace polling. Replayed the
  unchanged-folder heartbeat cost and measured native SQLite ACK deletion.
- Plugin 0.6.7 now commits explicit ACK IDs once per existing bounded send
  burst. FULL source/ACK durability and API PCM/metadata flushes remain. Crash
  before commit replays retained sequences; failure rolls the entire ACK batch
  back. Added native ACK commit timing and changed-only folder persistence.
- Completed two warmed physical two-source OBS takes with live `medium`,
  detailed `large-v3`, Script/Media Pool/Timeline polling and browser timing.
  Removed temporary probes, restored test OBS settings and stopped test
  processes. The package is built; owner installation remains separate.

Evidence:

- Folder regression failed on 5 durable writes for 5 identical heartbeats,
  then passed with 1, including change/restart/reconnect/corruption recovery.
  A quiet 30-chunk replay took 8.735 seconds before and 4.145 after; a replay
  during model loading was slower and excluded from that comparison.
- Native 40-row ACK benchmark: 1.488 seconds individually, 0.773 seconds in
  batches of four. Native tests verify retained PCM on reopen before ACK,
  atomic rollback, successful batch deletion and rejected-row preservation.
- Before/after take duration: 174.830/171.477 seconds. PCM receipt p95:
  49.012/49.263 versus 2.157/2.520 seconds; pending peak 99 versus 7, then 0.
  Last receipt after Stop request: 52.344 versus 2.670 seconds. API durable
  PCM-pair preparation remains its largest stage; lock acquisition and
  waveform projection did not explain the backlog. Separate takes/cache/disk
  scheduling prevent attributing every latency difference to one change.
- Both tracks in each take are sample-contiguous 48 kHz stereo PCM with valid
  hashes; both MKA archives decode two FLAC streams and match their journal
  hash. Live checkpoints reach 255/256 and 257/258, with 91/93 events, no
  error-status events or duplicate finals. Detailed STT published the entire
  4,195,894/4,195,908 and 4,115,449/4,115,442 analysis frames. Studio kept the
  same process; its model-load count was 2 before the second take and 5 at
  cleanup. The additional loads are not timed by the logs; continuous model
  residency is not established.
- All 91/93 events reached the browser. Text-event receipt audio-age medians
  changed from 26.977/24.151 to 4.210/3.864 seconds. Receipt-to-first-frame
  median was 33 ms in both, p95 51/67 ms. Only 8/10 measured first frames
  intersected the Script viewport; offscreen rows are not visible-caption
  evidence. This is a render-boundary proxy, not compositor presentation.
- Backend 493 passed (two existing warnings); frontend 54 files / 455 tests
  passed with `--maxWorkers=2`; typecheck/build passed after probe removal.
  Native build/package 0.6.7 and CTest 2/2 passed. `git diff --check` passed.
  Detailed evidence: `docs/gates/livelink-stt-12g-ingress.md`, ADR 0033 and
  ignored `.scratch/livelink-stt-12g` artifacts.

Remaining gap: the live Timeline sometimes looked empty despite low PCM
latency and nonzero waveform API data. Removed historical sources also
appeared as extra live lanes; the completed MKA rendered the two real tracks.
The owner's waveform complaint is not resolved by this ingress improvement.
Preferences Install/Repair and OBS restart are needed for the owner's installed
plugin to use 0.6.7. Cold startup, runtime reconnect/Script follow and the
wider source/UI/portability gates remain under `LIVELINK-08`.

Exact next round: `LIVELINK-STT-12H` — reproduce and repair live waveform
clearing and historical missing-source lanes, then verify the recording tail
in the browser on the improved ingress path.

## Round LIVELINK-STT-12H — 2026-10-03

Completed scope:

- Reproduced two failures before changing behavior: an empty cursor delta
  cleared a saved SVG waveform, and a missing historical source with no PCM
  in this recording appeared as an extra lane.
- Preserve waveform bins/rate on matching empty cursor deltas; full/new-window
  snapshots still replace them. Omit missing sources without current-take PCM,
  retaining sources removed after capturing audio. Clarify the live empty-window
  label when PCM is already saved elsewhere on that track.
- Verified a 202.977-second OBS/browser take with concurrent live and detailed
  STT, rewind to Script, returning to live, window/layout/zoom changes and
  automatic MKA handoff. A 46.509-second take on the final build verified
  source removal during recording and the saved-PCM label.

Evidence:

- Both initially failing regressions passed. The backend contract test confirms
  that out-of-window cursor pagination can have null rate and no points.
- The long take showed exactly two lanes despite four forwarded historical
  missing sources. Rewind retained 600 bins per track after empty replies,
  including 280/233 nonzero bins. The removed source in the short take kept
  its lane; the continuing source retained a visible live waveform.
- Long take: 292/292 contiguous chunks, zero sample gaps/overlaps, two FLAC
  archive streams with matching hash and successful decode. Live checkpoints
  reached both tails; 109 events, no errors/duplicate finals or open utterances.
  Detailed STT published all 4,871,444/4,871,453 analysis frames.
- Short take: 24/79 contiguous chunks, complete live checkpoints, 17 events
  without errors/duplicate finals, and a verified two-track MKA retaining the
  removed source's captured prefix. No detailed STT was requested there.
- Studio model-load count remained 8 from preflight to cleanup, with medium
  and large-v3 resident. Tests ran before recording, followed by model warmup.
- Final frontend suite: 54 files / 457 tests passed. Backend suite: 493 passed
  with two existing warnings; the extended waveform test passed separately.
  Typecheck/build and diff check passed. Restored OBS test settings, released
  the lease, emptied the outbox and stopped the isolated test processes.
- Evidence: `docs/gates/livelink-stt-12h-waveform.md` and ignored
  `.scratch/livelink-stt-12h` artifacts. Native plugin remains 0.6.7.

Remaining gap: the sustained take rebuilt a PCM backlog (sampled peak 118,
receipt p95 41.434/41.801 seconds, last receipt 36.058 seconds after Stop).
The browser then correctly lacked PCM in a future zoomed window. The cached
waveform fix does not resolve this transport delay, which can still postpone
the visible live tail. The new source's mid-take missing interval was also
absent from its journal; timing provenance is queued separately in 12J.
Native idle/Start overflow counter attribution and the
wider startup/reconnect/source/DPI/portability gates remain in LIVELINK-08.

Exact next round: `LIVELINK-STT-12I` — reproduce/profile the renewed PCM ACK
backlog during sustained browser waveform polling with model residency checked,
reduce the measured bottleneck and recheck the live tail and Stop drain.

## Round LIVELINK-STT-12I — 2026-10-03

Completed scope:

- Profiled durable PCM receipt during a sustained OBS/browser take. The
  natural 12H severe stall did not recur in the first quiet take; concurrent
  PCM/metadata preparation consumed 85.5% of handler time.
- Reproduced fixed-cost receipt overload with a scratch-only 400 ms delay
  per PCM pair. Plugin/package 0.6.8 consumes up to two seconds of already
  queued audio, capped at 96,000 frames, without waiting to fill a chunk.
  Drain frequency, sample boundaries, API flushes and native FULL commits
  remain. No API, project schema, UI or engine changes; ADR 0034.
- Completed four two-source physical OBS takes with browser polling, live
  medium and detailed large-v3 STT; verified PCM, archives and transcript
  checkpoints. Restored isolated OBS settings and released its lease/outbox.

Evidence:

- Native backlog regression failed before the fix at `frames == 96000`, then
  passed. Tests cover ordering, immediate partial delivery, Stop clipping,
  discontinuity, capture recovery and atomic durable ACKs; CTest 2/2 passed.
- Quiet 0.6.7 take: 202.777 seconds, PCM receipt p95 2.968/3.308 seconds,
  pending peak 10 and last receipt 3.215 seconds after Stop.
- Delayed before/after takes: 123.372/204.330 seconds, receipt p95
  125.713/126.278 versus 30.985/31.477 seconds, pending peak 182 versus 43,
  final 0. Last receipt after Stop: 134.400 versus 32.570 seconds. For the
  first 120 seconds of audio, p95 was 122.526/123.098 versus 20.798/21.664.
  Request costs stayed similar; audio per request rose from 0.685 to 1.277 s.
  The before harness exceeded its archive wait; preserved PCM drained and
  the verified archive became ready afterward. This was a controlled delay,
  not an isolation of the owner's natural disk-stall trigger.
- Final quiet 0.6.8 take: 201.191 seconds, p95 1.577/1.885 seconds, pending
  peak 5 then 0; last receipt 3.307 seconds after Stop. Live zoom retained
  waveform in the final minute; the saved final window appeared automatically.
- All four takes retained contiguous, hash-valid 48 kHz stereo PCM with no
  sample gaps/overlaps. All four two-track FLAC MKAs matched their journal
  hash and decoded. Complete live checkpoints, no error events/duplicate
  finals/open utterances, and detailed STT published every available tail.
  Studio model-load count stayed 2 through recording cleanup with both models
  resident; regression suites ran afterward.
- Backend 493 passed (two existing warnings); frontend 54 files / 457 tests
  passed; typecheck/build and diff check passed. Native package 0.6.8 matches
  the tested isolated DLL. See `docs/gates/livelink-stt-12i-ingress.md` and
  ignored `.scratch/livelink-stt-12i` evidence.

Remaining gap: fixed-delay pressure still postponed the live tail and the
precise natural 12H stall trigger is not established. Fewer durable uploads
reduce the cost but cannot guarantee throughput through arbitrary storage
stalls. Owner installation requires Preferences Install/Repair and OBS restart.
Source-absence provenance, cold startup, reconnect/Script follow, native
idle/Start overflow attribution and wider source/DPI/portability gates remain.

Exact next round: `LIVELINK-STT-12J` — persist source-absence timing when a
newly added source disappears mid-take, verifying its retained PCM/lane and
the journal interval together.

## Round LIVELINK-STT-12J — 2026-10-03

Completed scope:

- Reproduced journal omission when heartbeat preceded a missing event, and
  native queued-prefix loss on source detachment. Plugin/package 0.6.9 emits
  native missing/restored events for newly discovered sources, retains queued
  PCM/counters while the take drains, and pads observed restoration gaps.
- Reducer retains native event timing despite newer inventory. Stable UUID,
  tombstone, event fingerprint/ordering and durable ACK contracts remain.
  Native observation boundaries follow detach and precede attach, with about
  one-second inventory polling; no exact scene-edit time is invented. ADR 0035.
- First physical take exposed a related UI error: an absent source looked
  like delayed PCM. Timeline now labels source absence, keeps the lane/PCM and
  distinguishes known absence from unknown holes. Second take verifies build.

Evidence:

- Red regressions before fixes, then backend 494 passed (two existing warnings),
  frontend 54 files / 458 tests, native 2/2, typecheck/build and diff check passed.
- Two physical two-source OBS/browser takes, 77.561 and 66.258 seconds. Every
  native absence time/sample counter matches the journal; restoration closes
  the first interval, Stop closes the second. A's final captured sample equals
  the removal boundary: its queued tail remains. B has no sample gap/overlap.
- A's only sample gap is deliberate observed absence, 780,307 / 634,252 frames,
  classified `source-missing`. PCM format/sequence/bytes/hashes verified; both
  two-track FLAC MKAs hash-match and decode. Outbox sampled peak 4 then 0.
- Live checkpoints consume all 39/132 and 28/91 durable chunks; no errors,
  duplicate finals or open utterances. Detailed large-v3 STT publishes all
  available tails within one resampling frame. Medium and large-v3 remain
  resident in one Studio process, model-load count 2 through cleanup.
- Built browser UI keeps source A's lane/waveform and shows `Nguồn đang vắng
  · PCM đã lưu`. Saved wide view has 312/600 bars and A's source-missing gap,
  without reload. Isolated settings restored, lease/outbox cleared and test
  services/tab closed. Gate: `docs/gates/livelink-stt-12j-source-absence.md`;
  ignored `.scratch/livelink-stt-12j` retains projects and diagnostics.

Remaining gap: owner installation requires Preferences Install/Repair and OBS
restart. Native observation lags the actual edit by inventory polling; exact
video synchronization and control recovery through scene changes/process
crashes remain in LIVELINK-08. The natural disk-stall cause, cold startup,
reconnect/Script follow and wider source/DPI/portability gates remain open.

Exact next round: `LIVELINK-STT-12K` — reproduce cold-start local listener loss,
distinguish API/Studio/controller failure from health-readiness delay, and
retain recovery evidence. Warm recording success cannot prove cold startup.

## Round LIVELINK-STT-12K — 2026-10-03

Completed scope: isolate a reproduced Studio health delay, repair readiness,
retain process/listener/HTTP transition evidence, and verify controlled runtime
recovery. The historical natural-listener-loss gate remains open.

Evidence:

- A 0.6-second Studio status probe timed out while the three processes/listeners,
  API, controller and proxy remained healthy. Native TCP inventory and netstat
  agreed. Five cycles with a five-second probe budget passed; first status in
  cycles 1–4 took 2.672–3.594 seconds because it imports Torch/probes CUDA.
- Studio now has async health without device/model work. All three launcher
  waits check expected-process exit before/after HTTP, require `status=ok`, use
  elapsed deadlines and retain expected PID, process life, exit code, listener
  and probe outcome. Session PIDs register before readiness; atomic replacement
  prevents partial reads. Failed launch rolls back processes/session.
- The controller logs changed snapshots approximately every two seconds outside
  actions, distinguishing live PID/no listener, dead PID, health timeout and
  foreign ownership. Existing UI runtime state remains a port-ownership contract.
- Controlled launcher replay: while old device status took 3.062 seconds, new
  health remained responsive (max 0.110 seconds). Deliberately exiting API and
  Studio recovered through `/api/runtime/actions` in 26.068 / 22.167 seconds
  from loss to ready snapshots, including the deliberate diagnostic hold.
  Controller PID stayed unchanged across 37 snapshots; each recovery had ten
  stable samples. Sixteen retained transitions distinguish startup, injected
  failure and recovery. Cleanup leaves all three ports free, no test session.
- Red health regressions before repair. Backend **500 passed**, 195.91 seconds,
  two existing warnings. Studio **16 passed**, 1.11 seconds, two deprecation
  warnings. Frontend **54 files / 458 tests**, 59.59 seconds; typecheck/build and
  diff check passed. Portable Core **6/6**, readiness helper packaged/hashed;
  full emitted bundle/physical-transfer acceptance is not claimed.
- ADR 0036; `docs/gates/livelink-stt-12k-runtime-readiness.md`; ignored
  `.scratch/livelink-stt-12k/acceptance.json` and isolated logs retain diagnostics.
  Harness endpoint/output-pipe/failure-injection mistakes are recorded separately
  and not counted as natural product losses. Owner projects/media/OBS unchanged.

Remaining gap: no natural listener loss was reproduced in five empty-data cold
cycles. Readiness delay explains the observed timeout, not the historical 12F
failure. Owner-registry recovery backlog and foreground/detached topology remain
untested with the new evidence. Natural disk-stall cause, owner plugin install,
reconnect/workspace selection/Script follow and wider LIVELINK-08 gates remain.

Exact next round: `LIVELINK-STT-12L` — replay cold startup against an isolated
copy of the persisted recovery backlog and compare foreground/detached launch
topology. This is needed before claiming the original cold-start failure fixed.

## Round LIVELINK-STT-12L — 2026-10-03

Completed scope: replay foreground/detached startup against an independent copy
of the current persisted registry/backlog and retain startup recovery scan
diagnostics. The historical natural-listener-loss cause remains open.

Evidence:

- Copied 37 projects, 58 recording journals, ten live checkpoints, seven detailed
  checkpoints and four MKV follow checkpoints: 43,763 files / 10,475,132,414 bytes,
  no hard links. Registry/media locators point inside the isolated corpus;
  preferences are empty and models use existing local offline runtimes.
- Existing recovery eligibility skips 42 legacy-ready journals and ten completed
  tracks. Final product logs report nine live tracks, one MKV watcher, four MKV
  STT workers and seven OBS detailed workers queued. These are scheduling counts,
  not successful recognizer artifacts or finished transcript tails.
- Six full takes passed: initial foreground/detached ready in 61.922/11.312
  seconds, then corrected-harness controls in 5.547/6.156 seconds and final
  product takes in 5.500/6.093 seconds. Initial takes stayed healthy 90 seconds,
  others 60 seconds. Detached launchers exit zero while API listeners survive.
  No post-readiness listener/health loss occurred in passing takes.
- Initial audit guard resolved every read path unnecessarily; controls remove
  that cost. OS filesystem warmth is uncontrolled, so the slow first take cannot
  prove a product regression. One additional final detached take timed out on
  `/api/projects` with a two-second harness budget after healthy readiness. It is
  retained as incomplete, not declared a listener loss. Fresh retry measured
  project-list latency 0.110 seconds using a 15-second diagnostic budget.
- Product startup logs scan PID, elapsed time and queued counts through existing
  activity stdout. Final scans took 0.277/0.343 seconds. No scheduling, checkpoint,
  public API or deadline changes. No private project/transcript fields added.
- Write audit found no escaped writes; all ports free after every take. Original
  metadata for 43,763 files and hashes for 27,885 JSON inputs remain unchanged.
  No owner OBS/plugin changes. Gate: `docs/gates/livelink-stt-12l-persisted-startup.md`;
  ADR 0036 addendum; ignored `.scratch/livelink-stt-12l/acceptance.json` retains
  each take's samples, failure and cleanup.
- Backend **500 passed**, 182.90 seconds, two existing deprecation warnings.
  Frontend **54 files / 458 tests**, 50.96 seconds; typecheck/build and diff check
  passed. No new audio/model quality or physical viewport acceptance claimed.

Remaining gap: this current snapshot does not reproduce the historical natural
listener loss; neither its original byte state nor a truly cold OS cache is
available. The isolated corpus does not prove sustained inference load. The
single project-list timeout is also unattributed. Future matching failure logs
are needed; repeating successful copies cannot establish those causes. Natural
12H disk stalls, owner plugin installation, exact video timing and wider
LIVELINK-08 source/UI/portability gates remain open.

Exact next round: `LIVELINK-STT-12M` — retain and verify selected project/footage
and Script follow through API restart in the running browser. Runtime health
alone does not prove the owner can continue reviewing the same recording.

## Round LIVELINK-STT-12M — 2026-10-03

Completed scope: preserve the selected project's workspace through unavailable,
busy and post-restart loading states; clear recovered Timeline polling alerts;
verify the same-document archived review in the real browser.

Evidence:

- Two App regressions reproduced workspace unmounting before repair. A stable
  project-keyed workspace now remains mounted beneath an inert recovery dialog
  with bounded keyboard focus. No persistent format or audio algorithm changes.
- Initial browser recovery exposed a stale stopped Timeline alert. Two further
  red regressions reproduce status/journal polling errors; each now clears on
  its own successful response without suppressing real waveform failures.
- Independent real 12D two-track copy: 2,434 files / 138,097,106 bytes, no hard
  links. Two deliberate API exits recover through UI Restart all. Final API
  69092→33876, Studio 37516; controller 68748 stays unchanged. Track 18, recording
  ID, selected Script word, scroll 122px and zoom 2 remain; final transport alert
  disappears. Transcript polling resumes afterRevision144, no initial revision
  request in the restarted log. Browser console has no warn/error entries.
- Muted post-reconnect playback decodes both tracks and reaches about 25 seconds;
  first/last word selection scrolls the Script 0/122px. Automatic word highlight
  during playback is not claimed. Offline media probes find one two-stream FLAC
  MKA and two mono PCM16 analysis WAVs; all are inside the copied project.
- Source metadata for 2,434 inputs unchanged. Owner service listener PIDs remain
  unchanged; all isolated test ports clear, test session removed, tab closed.
  ADR 0037; `docs/gates/livelink-stt-12m-workspace-reconnect.md`; ignored
  `.scratch/livelink-stt-12m/acceptance.json`, browser snapshots and `final.png`.
- Frontend **55 files / 464 tests**, 20.90 seconds; typecheck/build and diff check
  pass. Backend 500 is the carried 12L baseline, not rerun this frontend round.
  Backend/Studio/native/engine source unchanged. No new inference quality claim.

Remaining gap: archived paused review does not prove provisional footage
interaction during actual OBS recording or the full independent-source matrix.
Same-document retention does not add F5 persistence. Historical natural listener
loss, 12H disk stalls, owner plugin install, exact video timing and wider
LIVELINK-08 gates remain open; successful injected recovery cannot close them.

Exact next round: **LIVELINK-CAPTURE-10B**, the existing queued live Media Pool
and independent-source running-app gate. Ongoing capture behavior requires
physical evidence beyond this archived reconnect. No extra 12N round introduced.

## Round LIVELINK-CAPTURE-10B — 2026-10-03

Completed scope: physical provisional-footage interaction, automatic Stop handoff
and five independent-source routing in the running app.

`LIVELINK-CAPTURE-10B` passes the controlled five-source physical OBS/browser
and media gate. During a native 77.86-second recording, Media Pool opens the
provisional footage and all five track controls; Track 9 saved-PCM preview plays
while OBS remains recording. Stop automatically publishes one selected MKA
footage with five tracks, preserving selection without F5 or project reopen.
All 342 PCM chunks pass identity/hash/frame checks with zero interchunk gaps;
five full FLAC streams decode and retain their distinct 330–770 Hz tone mapping.
First callback lag is 28–78 ms; this is not a zero-start-latency claim.
The live screenshot still reports PCM about 13 seconds behind; final chunk
continuity does not close the live latency gap.

No product repair is needed. Raw recording-labelled overflow warnings remain in
the evidence: cumulative idle counters cannot establish per-recording loss.
Owner runtime PIDs stay unchanged; the scratch test project/media are retained,
portable test OBS and isolated services are stopped, lease/spool cleared.
Frontend 55 files / 464 tests (18.03 seconds), typecheck/build pass. Backend 500
is the carried 12L baseline, not rerun. Gate:
`docs/gates/livelink-capture-10b-live-media.md`.

This controlled scene does not close the owner's physical-device/load matrix,
STT quality, natural listener loss, disk stalls, installation or video timing.
Exact next existing round: **UX-08B**, record two actual OBS sessions and reopen
each footage to verify separate media/Script identity and delete/restore. A
single take cannot prove that lifecycle. Voice Training status is unchanged.

Evidence detail: browser `live.json`/`after.json`, screenshots and final media
assertions are retained under ignored `.scratch/livelink-capture-10b/`. Only one
live track is auditioned; all five final streams decode and all five browser
audio elements reach readyState 4. No backend/native/engine source changed.

## Round UX-08B — 2026-10-03

Completed scope: two physical OBS recordings, per-footage reopen/playback/Script,
group recycle/restore, permanent-delete rediscovery and selection-race repair.

`UX-08B` passes the controlled two-recording footage lifecycle gate after a
frontend selection repair. When Media Pool requested another recording,
Timeline briefly echoed its previous local ID back into the workspace, causing
selection oscillation, mismatched Script/audio and alternating requests.
Workspace-requested identity now wins during render; active capture still takes
precedence. A red/green regression covers both selection directions and the
explicit Timeline selector. ADR 0038; `docs/gates/ux-08b-two-recording-lifecycle.md`.

Two actual native OBS sessions in one process produce separate 29.93/43.77-second
MKA footage, each with two tracks and different channel-owned final Script text.
After rebuilding, footage switching/reopen retains matching Script, Timeline and
audio URLs; both tracks decode and play for each take. UI Recycle/Restore groups
parent/children and preserves all IDs/audio hashes. API permanent deletion of
one scratch footage leaves the other intact; browser reload/open shows no ghost.
The UI permanent Delete confirmation flow remains UX-05B. A complete project
backup is retained. All 126 PCM chunks are gap-free and both full MKAs decode.

Final frontend **55 files / 465 tests**, 111.50 seconds with one worker,
typecheck/build and diff check pass. Initial fork timeouts and a two-worker fit
assertion failure are recorded in the gate; they are not passing runs. Backend
500 is the carried 12L baseline, not rerun. Scratch runtime's initial model-cache
error and live STT error events remain documented; this is not STT accuracy or
complete-prefix acceptance. Owned test services/OBS stop, lease/spool clear,
initially free ports return to free; no owner registry or engine source changes.

Remaining: owner hardware, sustained live latency, inference quality, natural
listener/disk failures, installation, video timing and wider UI/DPI/list gates.
Exact next existing round: **UX-09B**, compare Layer/Column controls, clipping and
pointer hit areas at owner viewport/DPI; correct media identity does not prove
visual interaction. No new alphabet round or completed product phase.

Ignored `.scratch/ux-08b/` retains media assertions, before/after browser states,
playback captures, `restored.png`, `final.png`, cleanup and project backup.

## Round UX-09B — 2026-10-03

Completed scope: normal/OBS archive Timeline comparison, header clipping and
pointer/keyboard resizing, stable stacked Layer geometry and media integrity.

`UX-09B` passes the controlled normal/OBS Layer/Column browser comparison
after repairing unbounded stacked Layer height, overlapping header controls and
column keyboard resize jumps. Final screenshot review also catches normal
transport clipping; its desktop board row now reserves enough height. A definite
responsive module height breaks the
viewport/60%-row feedback; headers wrap complete control groups, the selector
shrinks within its label and UNCUT remains visible. Explicit OBS column bases
keep actual width, separator value and 24px keyboard steps consistent.

Copied real two-track UX-08B archives and one imported analysis WAV exercise
12 browser cases at 750×884, 1280×720, 1024×576 and 853×480, all DPR 1. Header
geometry/hit centers pass; Layer playhead reaches both rows; pointer resize,
240px minimum and layout width retention pass. Normal and synchronized OBS
audio play, zoom/gain work, final console is empty and six original media hashes
remain unchanged. The smaller CSS viewports are not physical Windows DPI proof.
Evidence: `docs/gates/ux-09b-timeline-layout.md`, ignored `.scratch/ux-09b/`.

Frontend **55 files / 465 passed**, 119.38s with one worker; strengthened resize
regression goes red/green, focused suite 31 passes, typecheck/build/diff pass.
Backend 500 remains the carried 12L baseline, not rerun. Scratch services stop,
test ports return to free, browser override resets and test tab closes. Owner
registry/media, native plugin and engine source remain intact.

Exact next existing round: **UX-10B**, inspect six or more live OBS sources,
REC/PAUSE, Recorder/mixer outer scroll and physical Windows DPI. Browser archive
geometry does not prove those active-capture and OS-scale behaviors. Sustained
live latency, STT accuracy and the broader LIVELINK-08 matrix remain open.
No new alphabet round or completed product phase; Voice Training is unchanged.
