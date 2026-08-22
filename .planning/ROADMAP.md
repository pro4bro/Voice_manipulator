# Roadmap

| Phase | Goal | Status |
| --- | --- | --- |
| 01 Foundation | Runnable project shell, project persistence, reusable modules, upstream engine adapter | Complete |
| 02 Speech to Text | Real recording/import, two-pass STT, merged Script review, timeline sync | In progress |
| 03 Voice Training | Dataset preparation, segmentation review, train jobs, checkpoints, validation | Planned |
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
- Complete: Speech to Text contains Media Pool, Script, Recorder, and Timeline without Voice Vault or Control Rack and remains viewport-bound.
- Remaining: chunked live transcript while recording, per-word realtime/accurate/AI review choices in Script, and wiring selected Media Pool assets into training jobs.
