# ADR 0014 — Project-owned OBS LiveLink waveform envelopes

Status: Accepted for LIVELINK-08D, 2026-09-28.

## Context

The browser needs simultaneous source waveforms while the app records, but raw
PCM is too large for status/SSE and OBS meter movement is not capture evidence.
After Stop, the verified MKA track is the playback source and may contain
intentional silence inserted for capture gaps.

## Decision

- Summarize each durably written v3 PCM chunk into 50 ms PCM16 min/max/peak
  points, keyed by recording ID, channel ID, chunk sequence, source sample range,
  and recording-relative frame. Write the project-owned envelope sidecar before
  returning the chunk's durable ACK. Exact retries rebuild the same sidecar.
- Keep the existing status SSE as the change signal: its per-channel durable
  sequence watermark advances after the envelope write. A client fetches a
  bounded waveform snapshot; after SSE failure it polls status every two
  seconds. Cursor requests read at most 32 new chunks per call and return
  sparse changed bins for merging by recording-relative `startFrame`.
- A waveform response contains at most 600 points in at most 120 seconds.
  Null extrema mean no received PCM in a live window; zero extrema mean received
  silence. Source sample indices are never mixed across channels.
- After a ready archive exists, read only its matching MKA audio stream and
  store a rebuildable 10-second block cache under the same project folder.
  Archive points use recording-relative frames; source-specific sample indices
  are unavailable from decoded MKA and therefore null. The archived journal's
  gap/interval records remain the source for why silence was inserted.

## Consequences

The web never receives PCM from this feed. Sidecars and MKA caches move with the
project and can be regenerated from retained PCM or MKA. A 50 ms summary is
intended for Timeline display, not sample-accurate editing. LIVELINK-08E will
render the points and combine them with recorded interval/gap provenance.
