# Plan Changes

## 2026-08-23 - Media Pool And Portable Projects

User direction expanded Phase 02 from finalized STT into a shared production
asset library and portable project contract. Added Media Pool, common audio/video
ingest, system/browser recording, per-asset Script/history, and project-owned
activity notes. Project portability was promoted into foundation requirements
because every later training/manipulation job depends on stable source lineage.

Chunked live STT and per-word transcript candidate review remain in Phase 02.
Actual training consumption of selected assets remains Phase 03 rather than
being represented as complete.

## 2026-08-23 - Speaker-Aware Training Catalog And Themes

User direction expanded Phase 03 to cover multiple people in one run, human
identity metadata, file/word emotion, configurable checkpoint backups, optional
denoise, and reusable Environment Noise Profiles. These concepts now persist in
a project-owned catalog using project-local IDs. Light and dark modes were also
unified through shared semantic surfaces so Recorder and Timeline no longer
break the selected theme.

Automatic diarization, stem isolation, environment learning, and fine-tuning
remain processor work. Their UI contracts are present but do not claim a
successful result.

## 2026-08-23 - Compact Footage Tagging And Right-Column Review

Speaker & Emotion and Speaker Isolation moved into the Speech to Text right
column below Recorder. Media Pool returned to a compact footage list: summary
properties remain small text under each name, while right-click opens speaker
and emotion assignment. This preserves a dense professional workstation layout
without losing project-owned annotations.

The next Phase 03 slice was narrowed to Dataset Manifest compilation and forced
alignment. Actual OmniVoice execution follows only after that dataset boundary
is deterministic and verifiable.


## 2026-08-24 - Background STT And Sound Library

User direction made transcript processing asynchronous and made audio metadata a
first-class reusable library. The product now imports/normalizes footage quickly,
then serializes detailed STT in add order without an overlay. Browser live
speech transcript writes directly in Script during recording; an optional
OpenAI-compatible review pass follows detailed STT only when configured in
Windows → Preferences. Credentials live in machine-local runtime data and never
in a portable project.

Voice Vault is presented as Sound Library, with separate Speaker and Environment
profile types. The OmniVoice adapter supplies all 646 supported languages and
voice-design facets; the profile model keeps arbitrary attributes for future
engines. Both profile types are assignable to footage and timed words.
