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
- Speech to Text contains Media Pool, Script, Recorder, and Timeline only; Voice
  Vault and Control Rack remain absent there.
- Recorder supports microphone selection, monitor output, optional live
  monitoring, level/peak metering, and browser-authorized tab/window/system
  audio through `getDisplayMedia`.
- Media Pool imports common audio/video production formats through local
  FFmpeg/FFprobe, preserves original footage, creates project analysis WAV, runs
  finalized two-pass Whisper STT, and exposes every asset on all three pages.
- Every asset owns its Script, word timings, Timeline, and append-only transcript
  revisions. A pending Script edit is flushed before asset switching.
- Project folders are portable: canonical metadata and media indexes store
  project-relative paths; an Open Existing action reconnects moved folders.
- Every project owns `notes/PROJECT_HANDOFF.md`, `notes/ACTIVITY.md`, and
  `activity/events.jsonl` in addition to assets, jobs, exports, and cache.

## Important Current Behavior

- Browser security prevents a web app from silently enumerating playing tabs or
  capturing an output device. Chrome/Edge's secure picker performs tab/window/
  screen selection and the user must enable Share audio.
- Timeline playback now uses the project-owned `analysis.wav` route rather than
  a filesystem link to the Studio output folder.
- Project manifests persist `projectPath: "."` and `location: "."`; API responses
  resolve the current project location for display only.
- Media paths persist as `assets/media/<asset-id>/...`. Absolute legacy paths
  inside a project are migrated during load.
- The app-level `.registry` is a disposable recent-project index. Move a project
  independently, then use Open Existing to repair its locator.

## Explicitly Not Complete

- Chunked realtime STT while recording and the final merged per-word candidate
  popup/confirmation UX.
- Project-native Voice Training jobs consuming selected Media Pool assets.
- Source-aware final WAV/MP3 render, voice patch processor, isolation, voice
  conversion, dubbing, and production desktop packaging.
- Moving the multi-gigabyte trained model/checkpoint into Git. Runtime/model
  folders are intentionally ignored and must be copied separately or rebuilt.

## Verification At Handoff

- Frontend: 6 files, 11 tests passed.
- Backend: 12 tests passed; only the known Starlette/httpx deprecation warning.
- Browser QA: 1440x900 and 1280x720, no page-level overflow, no console errors.
- Engine: upstream checkout remained clean at `38e992b` before Git integration.

Run the final gates from the repository root:

```powershell
apps\web\node_modules\.bin\vitest.cmd run
.venv\Scripts\python.exe -m pytest services\api\tests -q
Push-Location apps\web; npm run build; Pop-Location
```
