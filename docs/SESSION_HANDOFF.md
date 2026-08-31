# Session Handoff

## Read First

Pro4Bro Voice Manipulator is a local-first React/FastAPI audio workstation. The
current milestone delivers a professional Project Hub, three manifest-composed
workspaces, real finalized recording/import STT, reusable audio modules, Media
Pool, portable project folders, and project-owned training metadata. Read
`AGENTS.md`, `CONTEXT.md`, this file, `docs/NEXT_SESSION.md`, `.planning/STATE.md`,
and `.planning/ROADMAP.md` before changing behavior.

## Repository Topology

- `apps/web`: React, TypeScript, Vite, Vitest UI.
- `services/api`: FastAPI, project persistence, media ingestion, adapters.
- `engines/OmniVoice`: untouched upstream Git submodule at revision `38e992b`.
- `.runtime/omnivoice-studio`: preferred ignored location for the customized
  Studio sidecar, environment, checkpoint, outputs, and large model files.
- `../OmniVoice`: relative migration fallback currently used on the original
  workstation when `.runtime/omnivoice-studio` is absent.
- `.tools/ffmpeg`: ignored project-local FFmpeg and FFprobe binaries.
- `.planning`: durable GSD requirements, roadmap, state, phase plans, and QA.

The canonical Git remote is `https://github.com/pro4bro/Voice_manipulator.git`
on branch `main`. Feature history includes source baseline `2bf627f`, portable
project handoff `7ff0e5e`, speaker-aware catalog/themes `9926080`, and compact
footage tagging `002c55a`. Git HTTPS authentication succeeded through Windows
Git Credential Manager; GitHub CLI OAuth is not required for normal pull/push.

The browser opens the persistent runtime controller on `127.0.0.1:18119`. It
serves the built React app and proxies business API traffic to the Pro4Bro API
on `127.0.0.1:18120`; the Studio sidecar runs on `127.0.0.1:18081`. Launchers
derive paths from their own repository root and do not require a fixed drive
letter.

## Delivered

- Installed and validated OmniVoice in an isolated Python environment; checked
  upstream revision/model/checkpoint state and preserved the engine code.
- Added Windows setup, training, inference, and Studio launch flows in the
  original migration runtime; fixed the PowerShell `Stage` splatting failure and
  rewrote transcript CSV output as Unicode.
- Built the original standalone OmniVoice Studio with Voice Vault, Script,
  Control Rack, Recorder, Timeline, Voice Patch, generated-take playback, source
  gain preview, waveform, scrub, zoom, dB/time rulers, peak meter, playback up
  to 8x, word timestamps, and transcript review concepts.
- Created this separate Pro4Bro repository so OmniVoice is one replaceable
  engine instead of the application itself.
- Added Project Hub creation with name/location and optional language, accent,
  sample rate, and purpose metadata.
- Split the UI into reusable modules composed through
  `apps/web/src/pages/workspaceManifest.ts` and
  `apps/web/src/modules/registry/ModuleRegistry.tsx`.
- Speech to Text contains Media Pool left, Script center, Recorder plus Speaker
  & Emotion plus Speaker Isolation right, and Timeline below; Voice Vault and
  Control Rack remain absent there.
- Recorder supports microphone selection, monitor output, optional live
  monitoring, level/peak metering, and browser-authorized tab/window/system
  audio through `getDisplayMedia`.
- Media Pool imports common audio/video production formats through local
  FFmpeg/FFprobe, preserves original footage, creates project analysis WAV, runs
  finalized Faster-Whisper STT with native DTW word timing, and exposes every
  asset on all three pages.
- Batch import now opens a per-file review. Every footage can independently run
  STT or use `Skip STT` when the user already owns a verified reading script.
- Each asset persists `transcriptionStatus` and `trainingSelected`; Speech to
  Text sends only checked footage to Voice Training, whose readiness module is
  computed from the selected subset.
- Every asset owns its Script, word timings, Timeline, and append-only transcript
  revisions. A pending Script edit is flushed before asset switching.
- Recorder streams live peak samples into Timeline while capture is active.
  Timeline uses a continuous PCM min/max envelope, a full-height playhead,
  source gain/peak preview, and decoded audio duration instead of stale metadata.
- Word boxes use their exact timestamps. Playback highlights the current word in
  light blue in both the Timeline subtitle row and editable Script overlay.
- Workspace and Project Hub typography was raised from the former 5-8 px micro
  labels to readable production-workstation sizing while preserving 1280x720.
- Project folders are portable: canonical metadata and media indexes store
  project-relative paths; an Open Existing action reconnects moved folders.
- Every project owns `notes/PROJECT_HANDOFF.md`, `notes/ACTIVITY.md`, and
  `activity/events.jsonl` in addition to assets, jobs, exports, and cache.
- Light/Dark theme selection persists locally and every module now uses shared
  semantic surfaces. Recorder and Timeline no longer force a dark background in
  Light mode.
- Every project owns `assets/training/catalog.json` with Speaker Profiles,
  Environment Noise Profiles, and Training Settings. It contains project-local
  IDs rather than absolute paths and survives moving the whole project folder.
- Media Pool can assign multiple speakers and one emotion to each footage.
  Footage rows show compact metadata only; right-click opens the tag menu without
  persistent tag checkboxes. `Speaker & Emotion` and `Speaker Isolation` live in
  the Speech to Text right column below Recorder. Script `TAG WORDS` assigns
  exact timed words to a speaker and emotion; multiple word emotions roll up to
  the asset-level `mix` label.
- Voice Training replaces Recorder and Control Rack with Train. It supports
  multi-speaker targets, max steps, batch size, learning rate, a default 1,000
  step checkpoint interval, pre-training denoise, and multi-file Environment
  Noise Profile definitions.
- Voice Vault creates project-owned Speaker Profiles with name, language,
  region, age, and gender. Environment profiles are selectable from Voice
  Manipulator Control Rack for future Voice Dub/Change/Fix processors.

## Module Composition

| Page | Left | Center | Right | Bottom |
| --- | --- | --- | --- | --- |
| Speech to Text | Media Pool | Script | Recorder, Speaker & Emotion, Speaker Isolation | Timeline |
| Voice Training | Media Pool, Voice Vault | Script | Train, Training Job | Timeline |
| Voice Manipulator | Media Pool, Voice Vault, Recent Takes | Script | Recorder, Control Rack, Voice Patch | Timeline |

`workspaceManifest.ts` is the composition source of truth and
`ModuleRegistry.tsx` maps module IDs to implementations. Reuse those modules;
do not copy page-specific versions.

## Project Storage Contract

- `project.json`: canonical metadata; persistent `projectPath` and `location`
  are `.` and runtime API responses resolve the current display path.
- `assets/media/index.json`: Media Pool records, project-relative source and
  analysis paths, Script text, timed words, revisions, training selection, and
  file-level annotations.
- `assets/media/<asset-id>/`: immutable imported/recorded source plus normalized
  `analysis.wav` used for playback and processing.
- `assets/training/catalog.json`: created on first catalog save; Speaker
  Profiles, Environment Noise Profiles, and Training Settings use IDs only.
- `activity/events.jsonl` and `notes/ACTIVITY.md`: machine and human activity
  history. `notes/PROJECT_HANDOFF.md` travels with a moved project.
- `jobs`, `exports`, and `cache`: project-owned future job state, deliverables,
  and disposable cache. Large runtime/model state remains outside Git.

## API Surface At Handoff

- Projects: list/create/open/get/update last page.
- Media: list, stream analysis audio, import/record upload, update Script/words,
  training selection, and speaker/emotion annotations.
- Training catalog: get and replace the project-owned catalog.
- System/engine: health, folder picker, system paths, OmniVoice status.
- Compatibility: `/api/studio/*` proxies the interim Studio sidecar for working
  finalized transcription until project-native processor ports replace it.

## Important Current Behavior

- Browser security prevents a web app from silently enumerating playing tabs or
  capturing an output device. Chrome/Edge's secure picker performs tab/window/
  screen selection and the user must enable Share audio.
- Timeline playback now uses the project-owned `analysis.wav` route rather than
  a filesystem link to the Studio output folder.
- A supplied reading script can bypass ASR, but training still requires a clean
  audio-text pair. Forced alignment/validation remains necessary to catch read
  deviations and to create trustworthy segments.
- Finalized recognized speech uses non-batched Faster-Whisper cross-attention/
  DTW word timing. Only words carrying processor provenance may drive Timeline
  subtitle boxes or timed SRT; legacy/provisional timing is hidden until rerun.
- Project manifests persist `projectPath: "."` and `location: "."`; API responses
  resolve the current project location for display only.
- Media paths persist as `assets/media/<asset-id>/...`. Absolute legacy paths
  inside a project are migrated during load.
- The app-level `.registry` is a disposable recent-project index. Move a project
  independently, then use Open Existing to repair its locator.

## Explicitly Not Complete

- Chunked realtime STT while recording and the final merged per-word candidate
  popup/confirmation UX.
- Forced alignment/validation for known scripts and project-native Voice
  Training jobs consuming the now-persisted selected Media Pool subset.
- Automatic Speaker Diarization, actual Voice Isolation stems, and learned
  Environment Noise Profile processors. Their controls expose `processor
  required` or remain disabled instead of claiming success.
- Source-aware final WAV/MP3 render, voice patch processor, isolation, voice
  conversion, dubbing, and production desktop packaging.
- Moving the multi-gigabyte trained model/checkpoint into Git. Runtime/model
  folders are intentionally ignored and must be copied separately or rebuilt.

## Original Migration Runtime

The adjacent `../OmniVoice` folder is the customized migration runtime used as
the current compatibility sidecar. It contains the one-click prepare, tokenize,
Southern Vietnamese training, trained-voice TTS, and Studio launch scripts. Its
PowerShell Stage splatting bug was fixed and `segments_review.csv` was rewritten
as Unicode-safe output. That folder also contains local modifications, outputs,
checkpoints, and Studio code, so it is not the clean update boundary.

The clean update boundary is only `engines/OmniVoice`, which remains an
unmodified submodule at `38e992bc60f85548faeb77e8fa70158ba71deb30`. Migrate
needed compatibility behavior behind Pro4Bro adapters instead of copying edits
into this submodule.

## Current Local Sample Project

`data/projects/south-voice-session-5df71a07` is intentionally ignored because
it contains private user audio and transcript data. At handoff it contains one
170.211-second, 24 kHz WAV asset with 684 timed words and one transcript
revision. Source and analysis paths are project-relative. No Speaker Profile or
saved Training Catalog exists yet, and the footage is not selected for training
until the user explicitly enables `TRAIN`.

## Verification At Handoff

- Frontend: 7 files, 19 tests passed; TypeScript and production Vite build passed.
- Backend: 17 tests passed; only the known Starlette/httpx deprecation warning.
- Browser QA at 1280x720: natural waveform/gain/playhead visible; center scrub
  reached `01:25.106` on a `02:50.211` asset; playback highlighted `niềm` in
  both Timeline and Script.
- Browser QA for this slice: all major module backgrounds matched in Light mode
  at `rgb(243, 240, 231)` and Dark mode at `rgb(34, 37, 32)`; Voice Training
  contained Train with checkpoint `1000` and no Recorder.
- Engine: upstream submodule remained clean at `38e992bc60f8`.
- Git: source baseline pushed to `origin/main`; runtime/model/project data excluded.
- Planning: Plan 03-01 complete; Plan 03-02 is the next executable plan and has
  its own validation matrix.

Run the final gates from the repository root:

```powershell
Push-Location apps\web; npm test; npm run build; Pop-Location
.venv\Scripts\python.exe -m pytest services\api\tests -q
```


## 2026-08-24 Integration Slice: Background STT And Sound Library

This supersedes older references to Voice Vault in the module composition:
the shared left panel now has **Media Pool** and **Sound Library** tabs on all
three pages. Sound Library stores Speaker Profiles (person icon) and Environment
Profiles (landscape icon); double/right click opens properties. Profiles can be
attached to a whole footage from Media Pool or to exact words from Script.

The API now exposes project-media deletion, STT selection/enqueue routes, the
OmniVoice profile schema, and app-local AI review preferences. The single-worker
queue processes asset IDs in chronological add order. It updates each asset
through queued → processing → reviewing → complete while UI polling keeps the
rest of the workstation available. AI review is optional and calls an
OpenAI-compatible chat/completions endpoint only when enabled, base URL, model,
and API key are configured in Windows → Preferences. The key is held only in
ignored runtime preferences, not in project manifests.

Recorder captures detailed min/max waveform points at high cadence and uses
browser SpeechRecognition when available for a live Script transcript. It is a
live convenience stream, not the final transcript; on record stop the
background detailed-STT + optional-AI path owns the saved revision.

Verification for this slice:
- Backend: 21 tests passed.
- Frontend: TypeScript project check passed.
- Vite/Vitest executable discovery/build could not be completed in this session
  because the mapped network drive drops the V drive prefix for Node/Vite entry
  resolution. This is an execution-path limitation; re-run from a local checkout
  or a normal mapped path before release.

## 2026-08-29 Timing And Runtime-Control Slice

- Finalized Faster-Whisper still uses `large-v3`, beam size 5, native
  cross-attention/DTW word timestamps, and its existing VAD recognition path.
  A second unpadded Silero pass now refines only plausible phrase edges. This
  fixes the repeated 0.3–0.4 second lead caused by VAD padding without changing
  recognized text or replacing DTW's internal word order.
- The production browser origin is now `http://127.0.0.1:18119`. The small
  controller remains available when API/STT workloads are off so the recovery
  screen can still execute `Turn on all`.
- Windows → Preferences is followed by `Turn on all`, `Restart all`, and
  `Turn off all`. Restart synchronizes the product-owned Studio adapter into
  the ignored runtime before relaunching both API and Studio, so code-fix rounds
  do not reuse stale Studio source.
- `start-pro4bro.bat` remains the machine-reboot bootstrap. UI Turn off stops
  API, Studio, model workers, and API-owned background tasks; the controller is
  intentionally the sole survivor. `start-pro4bro.bat stop` also terminates the
  controller when a literal zero-process shutdown is required.
- Verified on the real PDCA sample: the phrase beginning `Thì` moved from
  13.240 s to 13.568 s against an acoustic onset near 13.55 s, and `Đầu tiên`
  moved from 16.060 s to 16.352 s. A live stop → recovery UI → start and a full
  restart both returned API/Studio health to running.
- Verification: 57 backend tests and 41 frontend tests passed; TypeScript and
  the production Vite build passed; `engines/OmniVoice` remained clean.

## 2026-08-30 Reliable STT-To-Script Handoff

- Root cause of the intermittent empty Script was a frontend polling race, not
  lost STT output. The lightweight status response reached `complete`, changed
  the local asset to a terminal state, and cleaned up the polling effect while
  its full-media request was still in flight. Depending on response timing, the
  cleanup then discarded the transcript-bearing response.
- Terminal status snapshots are now treated only as a signal to fetch the full
  persisted asset. The local asset stays in its background state until that
  authoritative response supplies text, words, revisions, and `updatedAt`.
  Failed or slow full refreshes therefore remain eligible for another poll.
- `WorkspaceShell.test.tsx` reproduces the old race with a deliberately delayed
  full-media response and asserts that completed STT always reaches Script.
- Existing project indexes were audited: current completed samples contain
  transcript text, timed words, and revisions. Live verification after a full
  runtime restart returned the controller, API, and Studio to `running`; the
  production UI served the new bundle and the `test-4` sample returned 2,844
  transcript characters and rendered all 665 words in both Script and Timeline
  with no browser console warning/error.
- Verification: 42 frontend tests and 57 backend tests passed; TypeScript and
  the production Vite build passed.


## 2026-08-31 Workspace Moved To A Local Disk

The workspace now lives at
`E:\AI_RND\PRO4BRO\VOICE_MANIPULATOR\PRO4BRO_VOICE_MANIPULATOR`, including both
virtual environments, the 5.2 GB model folder, and the Hugging Face and torch
caches. The mapped network share (`V:` → `\192.168.100.102\hub\...`) is no
longer the working tree.

Copying a venv leaves it pointing at wherever it was built: every console-script
`.exe` embeds a shebang, and the activate scripts and `pyvenv.cfg` record absolute
paths. 59 launchers still referenced the old locations - 46 of them the network
share - and were repointed; the activation scripts were regenerated from the
stdlib templates. `python.exe` itself was always correct, because CPython derives
`sys.prefix` from the executable's own location, which is why the application ran
before any of this was fixed.

The environment limitation recorded on 2026-08-24 is resolved. `npm test` runs
normally again: 43 tests in about 3 seconds, where the share could not start a
fork worker at all and the `--pool=threads` workaround took nine minutes.

Measured after the move: full stack up in 8 s (was 28-60 s), backend suite 6.3 s,
`vite build` 197 ms, `media.list()` 0.005 s warm.

Two copies of the project still exist and are **not** the working tree: the V:
share, and an older `E:\AI_RND\PRO4BRO_VOICE_MANIPULATOR`. Confirm the path
before editing.

`engines/OmniVoice` has an empty `.git` and the repository has no `.git/modules`,
so `update-omnivoice.bat` and `git -C engines/OmniVoice status` do not work. The
engine source is complete and this predates the move; re-running
`git submodule update --init --recursive` restores it when needed.
