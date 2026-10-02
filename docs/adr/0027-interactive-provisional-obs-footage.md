# ADR 0027: In-progress OBS footage uses its durable PCM journal

Date: 2026-10-02
Status: Accepted at API/UI and archived owner PCM replay level; physical OBS gate open

## Decision

A recording journal is a selectable Media Pool footage while OBS is recording.
Its child rows correspond to forwarded or already saved tracks. Opening it
selects the recording's live Timeline and Script; opening a child selects its
channel lane without changing the live playhead. This selection is distinct
from an archived media asset until the verified MKA parent is published. The
archive-ready callback then selects that parent when the user is still viewing
the same provisional recording.

Listening to an unfinished track uses a bounded PCM preview API. By default it
returns the latest 30 seconds, or an explicitly requested start with at most a
30-second duration. The API verifies project, recording, channel, tombstone and
the continuous ACKed chunk prefix. It uses the same checksum-checked renderer
as detailed STT, preserving source timing, sample-index gaps and pause/disabled
silence. FFmpeg creates PCM16 mono 24 kHz in a temporary directory outside the
project. The response is uncached `audio/wav` with exact start/end headers;
the browser releases its object URL when replaced or the project changes.
Nothing is written back to the source PCM, MKA or media index for a preview.

The preview is deliberately short because an unfinished MKA may not be
seekable, and rendering an arbitrary long interval from a growing journal
would compete with live capture. Track and parent opening, detailed STT, and
the bounded listening preview are the available provisional interactions.

## Evidence and limits

Generated PCM and API tests cover preview timing, WAV format, invalid bounds,
missing channels, CORS-visible range headers and absence of a project-owned
derivative. Frontend tests cover row/track selection, preview controls, lane
focus before lanes arrive and the transition to the archived parent. The
owner's archived `Test_OBS 7` PCM rendered a read-only one-second preview with
24,000 mono frames. Physical OBS recording, playback and archive handoff in
the running app remain the acceptance gate; long-take spool latency remains a
separate `LIVELINK-INGEST-11B` issue.
