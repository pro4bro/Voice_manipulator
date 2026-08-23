# Session Handoff

## Read First

Pro4Bro Voice Manipulator is a local-first React/FastAPI audio workstation. The
current milestone delivers a professional Project Hub, three manifest-composed
workspaces, real finalized recording/import STT, reusable audio modules, Media
Pool, and portable project folders. Read `AGENTS.md`, `CONTEXT.md`,
`.planning/STATE.md`, and `.planning/ROADMAP.md` before changing behavior.

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
on branch `main`. Initial source baseline commit `2bf627f` was pushed on
2026-08-23. Git HTTPS authentication succeeded through Windows Git Credential
Manager; GitHub CLI OAuth is not required for normal pull/push.

The Pro4Bro API runs on `127.0.0.1:18120`; the interim Studio sidecar runs on
`127.0.0.1:18081`. Launchers derive paths from their own repository root and do
not require a fixed drive letter.

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
- Speech to Text contains Media Pool, Speaker Isolation, Script, Recorder, and
  Timeline; Voice Vault and Control Rack remain absent there.
- Recorder supports microphone selection, monitor output, optional live
  monitoring, level/peak metering, and browser-authorized tab/window/system
  audio through `getDisplayMedia`.
- Media Pool imports common audio/video production formats through local
  FFmpeg/FFprobe, preserves original footage, creates project analysis WAV, runs
  finalized two-pass Whisper STT, and exposes every asset on all three pages.
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
  Script `TAG WORDS` assigns exact timed words to a speaker and emotion; multiple
  word emotions roll up to the asset-level `mix` label.
- Voice Training replaces Recorder and Control Rack with Train. It supports
  multi-speaker targets, max steps, batch size, learning rate, a default 1,000
  step checkpoint interval, pre-training denoise, and multi-file Environment
  Noise Profile definitions.
- Voice Vault creates project-owned Speaker Profiles with name, language,
  region, age, and gender. Environment profiles are selectable from Voice
  Manipulator Control Rack for future Voice Dub/Change/Fix processors.

## Important Current Behavior

- Browser security prevents a web app from silently enumerating playing tabs or
  capturing an output device. Chrome/Edge's secure picker performs tab/window/
  screen selection and the user must enable Share audio.
- Timeline playback now uses the project-owned `analysis.wav` route rather than
  a filesystem link to the Studio output folder.
- A supplied reading script can bypass ASR, but training still requires a clean
  audio-text pair. Forced alignment/validation remains necessary to catch read
  deviations and to create trustworthy segments.
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

Run the final gates from the repository root:

```powershell
apps\web\node_modules\.bin\vitest.cmd run
.venv\Scripts\python.exe -m pytest services\api\tests -q
Push-Location apps\web; npm run build; Pop-Location
```
