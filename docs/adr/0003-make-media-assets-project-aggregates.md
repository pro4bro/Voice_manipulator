# ADR 0003: Make Media Assets Project Aggregates

## Status

Accepted

## Context

Imports and recordings must move through Speech to Text, Voice Training, and
Voice Manipulator without losing their source, transcript, timing, or edit
history. A global Script or temporary browser blob cannot provide that lineage.

## Decision

Each imported or recorded file is a project-scoped media aggregate. It owns the
original source path, normalized analysis audio, codec metadata, Studio adapter
reference, transcript, word timings, and append-only text revisions. Media Pool
is the reusable UI module that selects these aggregates on every workflow page.

The Pro4Bro API accesses them through `MediaLibrary`; FFmpeg ingestion and the
legacy Studio bridge remain adapters. Upstream OmniVoice code is not changed.

## Consequences

- Selecting footage restores its own Script and Timeline state.
- Text edits can be audited and later consumed by training jobs.
- Video without an audio stream stays visible but cannot enter STT or training.
- Browser/system recording must use the browser's secure share picker; the app
  cannot enumerate or silently capture playing tabs.
