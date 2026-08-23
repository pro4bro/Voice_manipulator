# Pro4Bro Voice Manipulator

Local-first audio production workspace built around independent processing
engines. OmniVoice is the first engine and remains an unmodified upstream Git
checkout under `engines/OmniVoice`.

Start a fresh clone with submodules:

```powershell
git clone --recurse-submodules https://github.com/pro4bro/Voice_manipulator.git
cd Voice_manipulator
.\setup-pro4bro.bat
```

## Run

1. Double-click `start-pro4bro.bat`.
2. The local server opens `http://127.0.0.1:18120` in the default browser.
3. Create a project, choose its storage location, then move between Speech to
   Text, Voice Training, and Voice Manipulator.
4. Keep the launcher window open while using the app. `Ctrl+C` stops the local
   server.

Run `setup-pro4bro.bat` only when installing or reinstalling dependencies. Python packages are
isolated in `.venv`, npm packages stay in `apps/web/node_modules`, projects stay
in `data` by default, and model caches stay in `.cache`/`.runtime`. None of these
machine-local folders are committed.

## Current Delivery

Phase 02 is in progress. The current app has a persisted Project Hub, reusable
manifest-driven modules, a project-scoped Media Pool, editable Script, real
microphone/system/import capture, finalized two-pass Whisper transcription,
word timestamps, continuous PCM waveform scrub/zoom, source gain/peak preview,
playback up to 8x, live recording waveform, selective training sources,
speaker/emotion annotations, a portable Training Catalog, synchronized Light/Dark
themes, resizable columns, tests, and one-click startup.

Chunked live transcription while recording, per-word transcript review,
project-native training jobs, source-aware export, isolation, changing, and
dubbing remain explicit later work. Their UI does not report fake successful
processing. See `.planning/ROADMAP.md`.

## Speech To Text

1. Open a project; Speech to Text contains Media Pool, Speaker Isolation,
   Script, Recorder, and Timeline. It intentionally has no Voice Vault or
   Control Rack.
2. Use `IMPORT` in Media Pool for one or many audio/video files. The import
   review lists every footage separately; leave `TRANSCRIPT` enabled for ASR or
   turn it off when a verified reading script already exists. Common MOV, MP4, MKV, AVI,
   WebM, H.264/H.265/AV1/ProRes, MP3, WAV, AAC, WMA, FLAC, M4A, and OGG inputs
   are normalized by the project-local FFmpeg tools.
3. In Recorder, choose microphone capture or `Tab trình duyệt / cửa sổ / âm
   thanh hệ thống`. For microphone capture, select `MIC INPUT` and `MONITOR
   OUTPUT`; use headphones before enabling live monitoring.
4. Browser/system capture opens Chrome or Edge's secure share picker. Select the
   tab, window, or screen and enable `Share audio`. The browser groups its own
   tabs; web apps cannot enumerate or silently capture playing tabs.
5. Every import or recording becomes a separate Media Pool asset with its own
   Script, word timings, and revision history. Selecting another asset restores
   that asset's transcript and Timeline.
6. Edit the result directly in Script. `Nhận diện kỹ` runs another contextual
   pass for the selected asset. Scrub, zoom from 1x to 16x, adjust source gain,
   and play at up to 8x in Timeline. The active timestamp highlights the same
   word in both subtitle and Script.
7. Tick `TRAIN` only on footage intended for the dataset, then use `Gửi ... sang
   Voice Training`. Selection persists inside the project and the Voice
   Training readiness module reads only that subset.
8. Right-click a footage to assign one or more Speaker Profiles and its
   file-level emotion. Media Pool keeps these properties as compact metadata
   below the footage name; the selected asset is summarized in the right-column
   `Speaker & Emotion` module. Use `TAG WORDS` in Script when the speaker or
   emotion changes inside one file; multiple word emotions automatically make
   the footage `Mix`.

## Voice Training

1. Add each person as a Speaker Profile in Voice Vault with name, language,
   region, age, and gender. One run can target multiple profiles.
2. Review only the Media Pool footage ticked `TRAIN`, then map footage and timed
   words to the correct people.
3. Configure max steps, batch size, learning rate, and checkpoint backup. The
   default backup interval is every 1,000 steps.
4. Enable or disable denoise before training independently from learning an
   `Environment Noise Profile`. A profile may reference multiple project media
   files and can be selected later in Voice Manipulator Control Rack.
5. `Bắt đầu training` remains disabled until the project-native OmniVoice
   training adapter is connected. The app does not report a fake training run.

If the speaker follows an existing script exactly, ASR is optional, not the
audio-text pairing. Paste/review that script on the asset. A later forced
alignment/validation pass must still detect omitted, repeated, or changed words
before segmentation and fine-tuning; this processor is tracked in Phase 03.

## Move A Project

Each project is a self-contained folder. Move that whole folder, open Project
Hub, choose `Open existing`, and select the moved folder. Its `project.json`,
Media Pool sources, analysis audio, transcript revisions, activity history,
jobs, exports, cache, and notes move together. Persistent file references inside
the project are relative to the folder containing `project.json`.

See [Portability](docs/PORTABILITY.md) for the exact contract and migration
behavior.

## Architecture

- `apps/web`: React/TypeScript UI and reusable studio modules.
- `services/api`: FastAPI application, project repository, and engine adapters.
- `engines/OmniVoice`: read-only upstream Git submodule.
- `.runtime/omnivoice-studio`: preferred local Studio sidecar location for the
  trained checkpoint and model cache; ignored by Git.
- `../OmniVoice`: relative migration fallback for the original Studio sidecar.
- `<project path>/assets/media`: original footage, normalized analysis WAV,
  per-asset transcript, timings, and revision history.
- `<project path>/assets/training/catalog.json`: relative-ID Speaker Profiles,
  Environment Noise Profiles, and persisted training parameters.
- `.tools/ffmpeg`: project-local FFmpeg/FFprobe binaries; no system PATH change.
- `data/projects`: lightweight project registry metadata.
- `.planning`: GSD requirements, UI contract, phase plans, and validation.
- `docs/SESSION_HANDOFF.md`: canonical recap for the next development session.

Add a processor behind an application port first, then register its UI module in
`apps/web/src/pages/workspaceManifest.ts`. Product code must never import private engine classes
directly from a page or UI module.

## Update OmniVoice

Double-click `update-omnivoice.bat`. The updater refuses to continue if the
engine checkout is dirty and only uses `git pull --ff-only`, so it cannot silently
rewrite local engine history.

Current implementation status and intentionally deferred processors are tracked
in [Session Handoff](docs/SESSION_HANDOFF.md) and [Roadmap](.planning/ROADMAP.md).

## Development Verification

```powershell
apps\web\node_modules\.bin\vitest.cmd run
.venv\Scripts\python.exe -m pytest services\api\tests -q
cd apps\web
npm run build
```
