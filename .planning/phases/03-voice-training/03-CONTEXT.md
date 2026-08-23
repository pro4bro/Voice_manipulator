# Phase 03 Voice Training Context

## User Direction

- Voice Training removes Recorder and replaces it with a Train module.
- One Training Run may target several named people.
- Every Speaker Profile records name, language, region, age, and gender.
- Media Pool footage and Script words can be attributed to a Speaker Profile.
- Checkpoint backups default to every 1,000 steps and remain configurable.
- Denoising is optional and independent from learning reusable Environment Noise Profiles.
- One Environment Noise Profile may learn from multiple selected audio files.

## Domain Decisions

- Speaker Diarization assigns speakers to timed words/spans; Voice Isolation creates audio stems. They have separate processor interfaces.
- File-level Emotion Label is the default. Word-level labels override it, and any asset with differing word labels becomes `mix`.
- Training Catalog is project-owned and portable. Assets reference catalog IDs rather than duplicating identity metadata.
- Configuration/readiness may ship before automatic processors, but unavailable execution must remain visibly disabled.

## Module Seams

- `TrainingCatalog`: persistence for Speaker Profiles, Environment Noise Profiles, and Training Settings.
- `SpeakerIsolation`: attribution and processor availability for the selected media Asset.
- `Script`: direct text editing plus optional per-word speaker/emotion tagging.
- `Train`: multi-speaker targets, hyperparameters, checkpoints, denoise, and environment profile configuration.
- `VoiceVault`: Speaker Profile creation/selection and trained Voice Model discovery.
