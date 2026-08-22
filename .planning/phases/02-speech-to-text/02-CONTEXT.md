# Phase 02 Context

## User Direction

- Speech to Text must render Media Pool but not Voice Vault or Control Rack.
- Recorder belongs in the right column and must select microphone, monitor output, and optional live monitoring.
- Recorder must also support browser-authorized tab/window/system capture without pretending a web app can enumerate playing tabs.
- Script is the single transcript surface and remains directly editable after accurate STT or AI correction.
- Timeline must use real audio data and word timestamps rather than decorative placeholders.
- Every imported/recorded footage item must restore its own Script, edit history, and Timeline when selected.

## Current Reality

- Recorder and import produce real `File` objects and pass through the workspace interface.
- The Pro4Bro API proxies Studio jobs without importing or modifying upstream OmniVoice code.
- Finalized audio receives two-pass Whisper transcription and contextual correction from the existing Studio runtime.
- Project media stores original sources plus a normalized analysis WAV; video without audio remains a valid footage asset but cannot be transcribed.
- Media Pool is one shared module composed into all three workflow pages.
- Live chunked transcription and per-word variant confirmation remain open.

## Module Seams

- `Recorder`: device discovery, capture, monitor, metering, and captured-audio result.
- `MediaPool`: import, asset selection, codec/status summary, and transcript history discovery.
- `Script`: editable transcript and transcript actions.
- `Timeline`: waveform, timestamp track, scrub, gain, zoom, and transport.
- `MediaLibrary`: project-scoped asset/revision persistence behind a narrow port.
- `MediaImportProcessor`: FFprobe inspection, FFmpeg normalization, and Studio transcription orchestration.
- `LegacyStudioGateway`: temporary processing adapter behind `/api/studio/*`.
