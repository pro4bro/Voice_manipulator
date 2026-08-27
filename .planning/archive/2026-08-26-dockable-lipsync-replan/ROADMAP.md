# Roadmap

| Phase | Goal | Status |
| --- | --- | --- |
| 01 Foundation | Runnable project shell, project persistence, reusable modules, upstream engine adapter | Complete |
| 02 Speech to Text | Real recording/import, two-pass STT, merged Script review, timeline sync | In progress |
| 03 Voice Training | Dataset preparation, segmentation review, train jobs, checkpoints, validation | In progress |
| 04 Manipulator Pipeline | Voice over, isolation, changing, dubbing, patching, asset lineage | Planned |
| 05 Desktop Release | Native shell, isolated runtimes, model manager, updater, installer | Planned |

## Phase 01 Success Criteria

- Project Hub creates and reopens persisted projects.
- Three pages share the same module implementations.
- Workspace columns resize without page overflow.
- Speech to Text obeys its reduced module set.
- OmniVoice status is read through an adapter and upstream source remains clean.
- Frontend tests, backend tests, TypeScript checks, and production build pass.

## Phase 02 Current Slice

- Complete: microphone/output selection, optional live monitor, browser-authorized tab/window/system capture, real recorder meter/peak, and finalized-record upload.
- Complete: shared project Media Pool, common audio/video ingest through local FFmpeg, per-asset Script/timings/revisions, two-pass Whisper transcription, real waveform, scrub, zoom, source gain, and playback to 8x.
- Complete: portable project manifests/media paths, moved-project reconnection, project-owned playback URL, and project-contained activity/handoff notes.
- Complete: Speech to Text contains Media Pool on the left, Script in the center, Recorder plus Speaker & Emotion plus Speaker Isolation in the internally scrollable right column, and Timeline below. Voice Vault and Control Rack remain absent and the page stays viewport-bound.
- Complete: per-file `Transcript`/`Skip STT` import decisions, persisted footage selection for Voice Training, live recording waveform, continuous PCM waveform, decoded-duration subtitle sync, and Timeline/Script current-word highlighting.
- Remaining: forced alignment/validation for supplied scripts, chunked live transcript while recording, per-word realtime/accurate/AI review choices in Script, and project-native training execution from the selected subset.

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
