# Next Session Start Here

## Objective

Continue Phase 03 with `.planning/phases/03-voice-training/03-02-PLAN.md`.
Build the verified Dataset Manifest boundary and forced alignment before wiring
project-native OmniVoice fine-tuning.

## Read Order

1. `AGENTS.md`
2. `CONTEXT.md`
3. `docs/SESSION_HANDOFF.md`
4. `.planning/STATE.md`
5. `.planning/ROADMAP.md`
6. `.planning/phases/03-voice-training/03-02-PLAN.md`
7. `.planning/phases/03-voice-training/03-VALIDATION.md`

## Resume Checklist

```powershell
git status --short
git pull --ff-only
git submodule update --init --recursive
.\start-pro4bro.bat
```

Run the checklist from the repository root, wherever that folder has been
moved. Do not persist the current workstation drive letter in application data.
The app should open at `http://127.0.0.1:18120`. The interim customized Studio
sidecar is expected at `http://127.0.0.1:18081` when finalized STT is required.
The launcher derives all paths from the repository root.

## Current Page Composition

| Page | Left | Center | Right | Bottom |
| --- | --- | --- | --- | --- |
| Speech to Text | Media Pool | Script | Recorder, Speaker & Emotion, Speaker Isolation | Timeline |
| Voice Training | Media Pool, Voice Vault | Script | Train, Training Job | Timeline |
| Voice Manipulator | Media Pool, Voice Vault, Recent Takes | Script | Recorder, Control Rack, Voice Patch | Timeline |

The right column may scroll internally; the browser page itself remains
viewport-bound. On Media Pool, use right-click to edit footage speaker/emotion
tags. The always-visible `TRAIN` checkbox still controls the selected training
subset.

## Working End To End

- Project create/open/reconnect and project-relative portability.
- Multi-file media import with per-file Transcript or Skip STT choice.
- FFmpeg normalization and finalized two-pass STT through the legacy sidecar.
- Microphone and browser-authorized tab/window/system capture, monitoring,
  live level/peak, and live recording waveform.
- Per-asset Script, revision history, word timings, waveform scrub/zoom/gain,
  playback up to 8x, and synchronized word highlighting.
- Training-source selection, Speaker Profiles, file/word speaker/emotion tags,
  Environment Noise Profile definitions, and persisted Training Settings.
- Synchronized Light/Dark theme and manifest-composed reusable modules.

## Not Yet Connected

- Chunked realtime transcript text while recording and merged per-word candidate
  review for realtime, accurate, AI-fixed, and user-fixed text.
- Forced alignment of supplied scripts and Dataset Manifest compilation.
- Automatic diarization, isolated speaker stems, and actual environment learning.
- Project-native OmniVoice training jobs, checkpoints, cancellation, and model
  registration in Voice Vault.
- Final WAV/MP3 render with temporary filters baked in, Voice Patch processing,
  voice over/change/dub/isolation processors, and desktop packaging.

## Guardrails

- Never edit `engines/OmniVoice`; use adapters and update the submodule only with
  `update-omnivoice.bat` when its checkout is clean.
- Never commit `.runtime`, `.cache`, `.tools`, `.venv`, `node_modules`, project
  folders, source recordings, checkpoints, models, or generated exports.
- Keep all persistent project-internal paths relative to the folder containing
  `project.json`.
- Do not mark processor controls successful until a real adapter returns a
  verifiable artifact.

## Verification Gates

```powershell
Push-Location apps\web; npm test; npm run build; Pop-Location
.venv\Scripts\python.exe -m pytest services\api\tests -q
git -C engines\OmniVoice status --short
```

The last completed feature slice passed 19 frontend tests, 17 backend tests,
TypeScript/production build, and browser QA at 1280x720.
