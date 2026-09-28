# OBS-02 — Portable recording and per-track ingest

Status: implemented and checked on 2026-09-22. This is the recorded-file foundation for the planned OBS plugin. The native plugin and live PCM transport belong to OBS-05/06.

## Contract

`POST /api/projects/{projectId}/obs-sessions` accepts an OBS MKV path on the same machine and optional `sources` entries with `streamIndex`, `sourceLabel`, and `sourceId`. It returns HTTP 202 and a queued session. `GET /api/projects/{projectId}/obs-sessions/{sessionId}` reports `queued`, `processing`, `ready`, or `error`; the list endpoint returns all sessions. `GET .../{sessionId}/recording` serves the copied MKV after ingest.

OBS-03 adds `POST /api/projects/{projectId}/obs-sessions/inspect` with `sourcePath`. It returns duration plus each audio stream's index, OBS track order, codec and sample rate so the Speech to Text panel can ask for source names before ingest.

`streamIndex` is FFprobe's zero-based stream index; `obsTrack` in each returned track is the one-based order among the file's audio streams. The mapping is optional because a recording file may not identify its OBS source. Unmapped tracks receive an explicit unknown-source label. A later plugin can supply stable OBS source IDs and labels through this same session mapping, while the recorded MKV remains the source of truth for final timing.

Each track becomes a separate Media Pool audio asset with its own FLAC source and 24 kHz mono analysis WAV. The video becomes one Media Pool asset with its copied MKV and a preview analysis WAV. All persisted session and Media Pool paths are project-relative. The request's local source path is never written to the session record. An interrupted session is marked `error` on restart and partial assets are removed. The original OBS file is untouched.

The current STT path can address each track by its asset ID. Speech to Text now lists sessions and opens each video/audio asset in the existing Script and Timeline. Queueing selected final STT jobs and merging source-tagged cues belong to OBS-06. The file-based path is intentionally shown separately from live plugin capture.

## Checks

- Synthetic MKV with video plus 44.1 kHz and 48 kHz distinct audio streams: both tracks preserved their sample rates; the generated audio assets differed; both analysis WAV files played through the existing Media Pool audio endpoint.
- A project moved to a new folder and reopened through Open Existing still resolved its recording and both audio assets.
- Invalid source mapping resulted in `error` with no partial Media Pool assets. A queued session on app restart became `error`.
- Real OBS 32.2.2 fixture from OBS-01 (`22.033` seconds, four AAC streams): ingest finished `ready` with four separate track assets and one video asset. Fixture media remains ignored under `.scratch/`.
- Focused tests: 4 passed. Web tests: 288 passed. Web build: passed. Full API suite: 362 passed, 1 skipped, 1 unrelated failure because this checkout's `.venv` lacks `numpy` required by `test_speaker_embedder_worker.py`.

## Next round

OBS-04: use the native OBS plugin to send one source while OBS records, and durably record that source inside Pro4Bro. See `docs/OBS-LIVE-CAPTURE-CONTRACT.md`.
