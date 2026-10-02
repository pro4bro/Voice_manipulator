# ADR 0025: Detailed LiveLink STT follows durable source PCM

Date: 2026-10-02
Status: Accepted at API, generated PCM, and archived owner PCM level; physical OBS gate open

## Decision

An explicit detailed STT request on an in-progress LiveLink recording creates
`assets/obs-livelink/<recording-id>/detailed-stt-state.json`. The user selects
only channels with durable PCM and a 10–600-second block size. The plan saves a
separate initial frame boundary for each selected channel at request time. The
recognizer reads project-owned, SHA-256-checked PCM chunks rather than an MKA
or analysis WAV that does not yet exist during recording.

The first recognition covers the entire committed interval of that channel.
Each subsequent full block and the short tail after Stop include ten seconds
before the block boundary. Result JSON is durable before the cursor advances.
Combining uses word midpoint ownership and replaces text from five seconds
before the boundary. A later result with text but no word timestamps fails
without moving the cursor, because repeating words cannot be resolved safely.

PCM rendering keeps the source channel count and sample rate until the
analysis-only FFmpeg conversion to PCM16 mono 24 kHz. It reproduces sample-index
gaps and mutes pause or disabled intervals. Source chunks and archived media
are never modified. A worker resumes unfinished plans after API restart.

Once the verified MKA archive and its child assets are ready, the worker
publishes a project-owned SRT and each track's detailed timed transcript.
User-edited Script text remains authoritative. The realtime medium-model
LiveLink queue remains a separate provisional path; detailed recognition uses
the large-v3 import path and may process a long initial snapshot in internal
chunks. The worker caches the immutable ACK prefix in memory and reads only
new sequence metadata on later polls, avoiding a full chunk-catalog scan every
0.75 seconds in long recordings.

## Evidence and limits

Generated two-track PCM tests cover unequal initial snapshots, restart,
padding, final tails, gaps, pauses, missing word timestamps and publication.
The archived owner `Test_OBS 7` source PCM rendered a five-second WAV per
track; each first four seconds matched its corresponding final analysis WAV
byte for byte. The physical OBS while-recording flow and sustained concurrent
GPU/PCM load remain to be measured. The provisional Media Pool row gains the
detailed STT action here; full interactions with in-progress footage belong to
`LIVELINK-MEDIA-14`.
