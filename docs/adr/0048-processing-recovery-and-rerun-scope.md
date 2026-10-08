# 0048 — Processing recovery and rerun scope

Date: 2026-10-08. Status: accepted for USER-FEEDBACK-01.

## Recovery

Sequential STT and diarization queues own their work in memory. At API startup
and Open Existing, persisted active flags without an owner become `cancelled`
with an interruption explanation and zero progress. Existing transcript, word
annotations, revisions and media remain. Opening a project while its queue is
alive preserves scheduled owners; polling never performs recovery.

Detailed OBS and growing-MKV STT retain their checkpoint resume behavior. A
recording ID or checkpoint filename alone does not prove ownership. Discovery
must validate the checkpoint and map it to eligible assets that the dedicated
worker can resume. Removed or disabled media cannot keep a processing owner.
Diarization has no dedicated checkpoint resumer.

Checkpoint discovery and recovery persistence run off the API event loop.
Open Existing waits for reconciliation before returning the project. Startup
still finishes discovery before Uvicorn binds; these changes do not claim
health availability during blocked startup discovery.

Recycle and permanent removal fence the affected asset and child-track work
before updating the Media Pool. Failed cancellation acknowledgement prevents
removal, following ADR 0047. Recovery does not fabricate successful results.

## Choosing work

STT, diarization, Training and Generate use one in-app dialog when any selected
eligible target has a result. Cancel dispatches nothing; users choose all targets
or only targets without results. With no results, the existing start path runs
directly. An all-complete selection offers rerun-all and cancel.

STT and diarization use their completed artifact-backed states. Training targets
are speaker profiles, not independent footage jobs: a completed run must have
a published voice for the selected model and settings. Newer training inputs
make that target need training again. Generating targets Script rows; an existing
published output must match row ID, text, resolved voice and requested generator
effective parameters, including descriptor defaults after removed overrides.
The output listing adds `audioAvailable`, computed from its WAV without rewriting
the metadata; missing or empty audio cannot satisfy a completed row. Running only
missing rows creates a new output for those rows;
previous outputs stay in Voice Output.

`POST /api/projects/{id}/voice-script/read` adds optional `forceRegenerate`
(default false). Rerun-all sets it true and creates fresh clip revision keys,
preserving prior clips and outputs through success, failure and cancellation.
Default callers retain cache reuse. Published successful/stopped-prefix jobs
remain publicly running until the worker has released its GPU lease.

## Responsive selection and subtitles

Media Pool loading is independent of catalog/Preferences loading. Selecting a
footage commits selection feedback first, then React defers construction of
Script/Timeline for that selection. During the gap, old text and playback controls
are replaced by an explicit loading state. This changes scheduling, not source
time or data; waveform loading remains asynchronous. Browser latency under real
STT load still requires measurement.

Timeline subtitle hit targets retain exact timestamp rectangles. Below 22px of
visible width, word labels and per-word boxes are suppressed, while accessibility
labels, hover timestamps, active/selected/promoted markers and editing handlers
remain. Zooming in makes labels visible again across normal, imported and OBS
timelines. Waveform rendering is unchanged.
