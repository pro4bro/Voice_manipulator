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
| LIVELINK-08 | Final integrated OBS matrix, time reconciliation, portability, and clean-machine acceptance | Open; final gate follows LIVELINK-08J | Accept only after channel Record state, waveform, live transcript, overlap review and real media artifacts are visible and verified together. |
| UX-01 | Remove redundant page headings, simplify Media Pool context actions, and apply the supplied Pro4Bro logo | Complete in source and packaged plugin; physical UI review open | Restores workspace height and carries the owner's mark into the app and OBS plugin. |
| UX-02 | Shared range/toggle/select-all behavior and Media Pool batch operations | Complete at UI and project API test level | Establishes predictable multi-selection and safe action targets before applying it across lists. |
| UX-03 | Extend multi-selection and bulk actions to Sound Library, Voice Output, Script rows, and other lists | Implemented in primary editable lists; specialized OBS track actions and physical UI sweep remain | Lets users edit and remove selected objects together in each module. |
| UX-04 | Diagnose and stop repeated PCM viewport waveform loading | Complete at regression-test level; physical playback check remains | Prevents the waveform from flashing and repeatedly reporting loading after media settles. |
| UX-05 | Finish specialized list selection and physical UX acceptance | Queued | Closes the remaining OBS track action gap and checks modifier behavior and waveform stability in the running app. |
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
