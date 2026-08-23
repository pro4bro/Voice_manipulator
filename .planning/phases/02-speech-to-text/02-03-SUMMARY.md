# Phase 02 Selective Dataset And Timeline Sync Summary

## Outcome

Media ingestion no longer forces transcription. The batch review stores an STT
decision per footage, and every project media asset persists whether it is part
of the Voice Training source set. The Speech to Text handoff switches to Voice
Training with only that selected subset represented in dataset readiness.

## Timeline And Script

Recorder peak samples render immediately in the shared Timeline during capture.
Final audio is decoded into a continuous min/max PCM envelope. The decoded
duration drives ruler, scrub, playhead, subtitle positions, and word widths.
Playback reports one active word to Script, where the same text is highlighted
in light blue without removing direct textarea editing.

## Known Script Decision

ASR can be skipped when a speaker follows an existing script. Fine-tuning still
requires the script and audio to match, so forced alignment/validation remains a
Phase 03 processor before segmentation and training.

## Verification

- Frontend Vitest: 6 files, 15 tests passed.
- Backend Pytest: 14 tests passed.
- TypeScript/Vite production build passed.
- Browser QA at 1280x720 confirmed waveform, gain, peak, playhead, scrub, and
  matching active-word highlight in Timeline and Script.
