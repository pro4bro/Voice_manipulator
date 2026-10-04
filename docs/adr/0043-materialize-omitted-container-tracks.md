# 0043 — Materialize omitted container tracks under the existing footage

Date: 2026-10-04. Status: accepted at completed-container scope.

## Decision

`POST /api/projects/{project_id}/media/{asset_id}/audio-tracks/{stream_index}/import`
returns the materialized child `ProjectMediaAsset` (200), using the existing
parent's available stream inventory. Repeated calls return/reactivate that same
child rather than create another parent or analysis. New children start Import
selected, STT skipped; STT, diarization and training remain explicit workflow
choices. Invalid/missing source or stream returns 400, missing project/asset 404,
missing decoder 503. Deleted/disabled objects must be restored/enabled first.

Decode only the chosen audio stream to a unique project-owned mono PCM16/24k
analysis WAV. Publish child lineage and parent available-track selection in one
media-index transaction under the library project lock. Concurrent requests in
one importer serialize per parent; the library also deduplicates stream identity
at publication. Source and existing analyses are never overwritten.

The Media Pool index is authoritative for current tracks. `audio-tracks.json`
remains the original import snapshot, preserving the original stream choice;
new analysis lineage lives in the same existing child fields in the index.
No persistent schema migration or machine-local path enters the manifest.
Project-local sources work after move/Open Existing. An uncached external
source still requires its machine-local registry and original file; newly
materialized analysis remains portable even when that locator is unavailable.

## Failure and boundaries

Do not mark Import complete before a valid WAV exists. Failed decode/publication
keeps the parent selection omitted and allows retry. An unpublished derivative
folder may remain after failure; it is not a footage and is not used for STT.
Crash-atomic multi-file transactions across processes are not introduced.

A still-growing MKV must Finish before adding a previously omitted stream.
Extending an active follower's stream/cursor set is a different contract. UI
keeps that omitted checkbox disabled until Finish; existing tracks can still be
withdrawn/restored through their Import selection. The workspace refreshes media
without resetting the selected child's edited Script.
