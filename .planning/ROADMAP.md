# Roadmap

| Phase | Goal | Status |
| --- | --- | --- |
| 01 Foundation | Runnable project shell, project persistence, reusable modules, upstream engine adapter | Complete |
| 02 Speech to Text | Real recording/import, source-provenanced word timing, merged Script review, timeline sync | In progress |
| 03 Voice Training | Dataset preparation, segmentation review, train jobs, checkpoints, validation | In progress |
| 04 Dockable Workspace | Six-zone docking, location-independent modules, session seam, fourth-page shell | Planned |
| 05 Manipulator Pipeline | Voice over, isolation, changing, dubbing, patching, asset lineage | Planned |
| 06 LipSync | Video/audio selection, face-shot review, adapter render, QC and lineage | Planned |
| 07 Desktop Release | Tauri shell, isolated runtimes, model manager, updater, installer | Planned |

## Phase 01 Success Criteria

- Project Hub creates and reopens persisted projects.
- Three pages share the same module implementations.
- Workspace columns resize without page overflow.
- Speech to Text obeys its reduced module set.
- OmniVoice status is read through an adapter and upstream source remains clean.
- Frontend tests, backend tests, TypeScript checks, and production build pass.

## Phase 02 Current Slice

- Complete: microphone/output selection, optional live monitor, browser-authorized tab/window/system capture, real recorder meter/peak, and finalized-record upload.
- Complete: shared project Media Pool, common audio/video ingest through local FFmpeg, per-asset Script/timings/revisions, non-batched Faster-Whisper DTW word timing with unpadded acoustic phrase-edge refinement, real waveform, scrub, zoom, source gain, and playback to 8x.
- Complete: portable project manifests/media paths, moved-project reconnection, project-owned playback URL, and project-contained activity/handoff notes.
- Complete: Speech to Text contains Media Pool on the left, Script in the center, Recorder plus Speaker & Emotion plus Speaker Isolation in the internally scrollable right column, and Timeline below. Voice Vault and Control Rack remain absent and the page stays viewport-bound.
- Complete: per-file `Transcript`/`Skip STT` import decisions, persisted footage selection for Voice Training, live recording waveform, continuous PCM waveform, decoded-duration subtitle sync, and Timeline/Script current-word highlighting.
- Remaining: forced alignment/validation for supplied scripts, chunked live transcript while recording, per-word realtime/accurate/AI review choices in Script, and project-native training execution from the selected subset.
- Complete: persistent local runtime controller with Windows-menu Turn on,
  Restart, and Turn off controls for API, Studio, model workers, and background
  processing workloads.
- Complete: terminal STT polling waits for the full persisted media asset before
  leaving the background state, so delayed final responses cannot make a
  completed transcript intermittently disappear from Script.

## Phase 03 Current Slice

- Complete: project-owned `assets/training/catalog.json` with Speaker Profiles, Environment Noise Profiles, and Training Settings.
- Complete: asset-level multi-speaker/emotion annotation and word-level speaker/emotion tagging in Script; mixed word emotions roll up to `mix`.
- Complete: Voice Training no longer contains Recorder or Control Rack; Train owns multi-speaker targets, max steps, batch size, learning rate, checkpoint interval, denoise, and environment-learning settings.
- Complete: checkpoint backup interval defaults to 1,000 steps; noise profiles accept multiple project media asset IDs and are reusable from Voice Manipulator Control Rack.
- Complete: synchronized Light/Dark theme surfaces across Project Hub, workspace modules, Recorder, and Timeline.
- Complete: compact Media Pool footage rows show summary metadata while file-level speaker/emotion assignment lives in a right-click menu.
- Remaining: automatic speaker diarization, audio stem isolation, forced alignment, actual environment-profile learning, and project-native fine-tune execution.

## Next Executable Plan

- `03-02`: compile the user-selected subset into a portable, deterministic Dataset Manifest and validate supplied scripts with forced alignment before training.
- `03-03`: connect validated manifests to project-native OmniVoice jobs, checkpoint lineage, progress, cancellation, and recovery.

## Planned Phase Sequence

- **04 Dockable Workspace**: establish bounded six-zone docking, a stable module contract, and `WorkspaceSession`; its compatibility migration protects current pages while the fourth page is introduced.
- **05 Manipulator Pipeline**: turn voice over, isolation, changing, dubbing, and patching into real adapter-backed jobs with complete asset lineage.
- **06 LipSync**: make the fourth page render approved dubbed/replaced takes to project-owned video through an interchangeable adapter and human QC.
- **07 Desktop Release**: package the proven React/FastAPI core as a Windows-first Tauri application; browser development mode stays supported.

## Governing Rules For These Phases

- Complete active Phase 03 execution before starting the Phase 04 implementation slice.
- Every module stays reusable and location-independent; dock position never changes its service or data contract.
- Engines and models stay behind backend adapters and a machine-local model registry; `engines/OmniVoice` remains read-only.
- Project and Media Pool indexes retain only project-relative paths, including rendered LipSync derivatives.
