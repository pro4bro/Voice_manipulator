# OBS LiveLink v3 contract — LIVELINK-01

This freezes the data and state semantics for the next implementation rounds.
The serializable domain models and pure reducer live in
services/api/app/domain/obs_livelink_state.py. LIVELINK-05 implements the v3
inventory, command/ACK and status SSE control plane. LIVELINK-06 adds durable
per-source PCM chunks, transitional WAV stems, recording triggers and Ignore
policy. LIVELINK-07A adds a verified audio-only MKA parent with per-source
FLAC/PCM tracks and child analysis references. OBS v2 routes and assets remain
operational.

## Ownership and version negotiation

- One OBS process is identified by installId and processInstanceId. It has a
  machine-local connectionId and connectionEpoch. A new process or hello after
  API restart receives a new command epoch and a full snapshot.
- Hello advertises minimum/maximum supported protocol. V3 is selected only
  when the intersection contains 3. Otherwise return a version error; do not
  silently send a v3 command to a v2 plugin.
- All plugin requests use a per-Windows-user pairing token in an Authorization
  header, plus install identity. Bind to loopback. The token is absent from
  query strings, logs, project files, MKV/MKA attachments and UI text. V2's
  existing per-project pairing remains a separate compatibility path.
- ProjectTargetLease contains projectId, workspaceId, ownerId, revision and
  expiresAt. Only its owner can renew/release. Expiry blocks new recordings;
  it does not reassign an already active recording to another project.
- Connection, lease, trigger policy and absolute OBS recording locator are
  machine-local. Recording metadata, chunks and final assets are project-owned
  with paths relative to the folder containing project.json.

## Hello, commands and ACK

- Proposed hello: POST /api/obs-livelink/v3/hello. Request carries installId,
  processInstanceId, pluginVersion, obsVersion, protocolMin/Max and OBS record
  snapshot. Response carries connectionId, serverEpoch, connectionEpoch,
  negotiatedVersion=3, lease summary, active recording ID, channel desired/
  applied snapshot, command revision and audio ACK high-water marks.
- Commands are long-polled using connectionEpoch and afterRevision, with a
  maximum 20-second wait. One OBS connection has one logical consumer.
  Repeated polls can return the same command without repeating its effect.
- Every command has commandId, idempotencyKey, connectionId,
  connectionEpoch, revision, kind, target IDs and desiredState. Plugin caches
  applied command IDs for its process lifetime. ACK returns matching ID,
  epoch and revision, applied state or structured error, plugin monotonic
  nanoseconds, and sample index for an audio boundary.
- Backend accepts an ACK only while that exact command is pending. A stale
  epoch/revision or reused ID cannot change applied state. A successful ACK
  without an applied clock boundary is invalid. Desired and applied channel
  states remain separate while pending.
- Epoch change, event gap, command revision loss or uncertain ACK triggers a
  full resync. Snapshot reconciliation exposes unknown intervals/gaps; it
  does not infer that a command took effect.

## Connection, recording and trigger state

- LiveLink Active can coexist with app Recording Idle. Full PCM upload starts
  only with an owned app recording ID and a forward-applied active channel.
- One app recording can intersect 0..N OBS video spans. OBS Start always opens
  a new span; OBS Pause/Resume/Stop always updates its video intervals even if
  the corresponding app trigger is ignored.
- If LiveLink joins while OBS is already recording, hello creates an observed
  span with startReason=link-joined and an unknown earlier video head. The app
  may start inside it; it must not invent the true OBS Start timestamp.
- Ignore Start suppresses automatic app creation while Idle. If app capture
  already runs, the new OBS span still attaches. Ignore Pause suppresses a new
  OBS pause cause. OBS Resume removes an existing OBS cause even if Ignore
  Pause changed since the Pause. Ignore Stop closes the video span while the
  app capture continues. The next OBS Start attaches a second span.
- Manual Pause and OBS automation Pause are independent set members. App
  capture resumes only when both have cleared. Manual Stop closes app capture
  without sending Stop to OBS. Link Stop closes app capture, ends observation
  of any open span with reason link-stopped, and marks actual OBS state unknown.
- A source is identified by channelId plus sourceUuid. Native name, alias,
  slot and mute state are metadata. A removed source leaves a tombstone; its
  slot is not reassigned during an active related recording. A new UUID is a
  new source even if its display name matches.
- An applied Forward Off or missing source during capture opens an explicit
  channel interval at its sample/time boundary. Re-enable/restore closes that
  interval. Restore with forwarding still desired opens a forward-pending
  interval until the callback/command ACK confirms applied forwarding. These
  are not transport loss. A channel already disabled or missing at capture
  Start has an interval from the app start boundary.

## Event order and audio evidence

- Plugin lifecycle events carry stable eventId, installId,
  processInstanceId, sequence and plugin monotonic nanoseconds. Sequence
  starts at zero per process and increases by one. Exact retransmission is a
  no-op; changed payload for a sequence or event ID is a conflict. A missing
  or old unseen sequence, process identity change or backwards applied clock
  requires resync. Server/connection epoch is not part of event identity.
- All plugin monotonic values are nanoseconds from one clock in that OBS
  process. Audio evidence also carries connectionId, connectionEpoch,
  channelId, sourceUuid, recordingId,
  per-source chunk sequence, firstSampleIndex, frameCount, sampleRate,
  channel count, OBS audio timestamp nanoseconds and PCM SHA-256. The plugin
  reports format discontinuity explicitly; it never resets a source sample
  index silently. A sample index is monotonic only within its source/process
  incarnation, not across unrelated OBS sources.
- Audio payload v3 is interleaved pcm_s16le. Server receive time diagnoses
  queue/network delay and must not replace source media timestamps. Durable
  per-source chunk ACK precedes provisional live STT. Callback thread only
  copies samples into a bounded queue.
- App `/status` and `/events` attach `capture` to each channel. It identifies
  the owning app recording/project, `idle`/`pending`/`receiving`/`paused`/
  `disabled`/`missing`/`forward-pending`/`disconnected`/`stalled`, the durable
  chunk count and sequence high-water, sample-index end, server UTC time of
  the last durable chunk, and positive sample discontinuity count/frames.
  `receiving` requires a persisted PCM chunk in the current recording within
  three seconds; an applied Forward ACK or moving OBS meter alone is not
  enough. Silence still counts when its PCM chunk is durably stored. Sample
  discontinuities can include intentional pause/disable spans, so they are
  evidence for review, not automatically classified transport loss. The
  server UTC receipt time diagnoses stalls only; audio timing continues to use
  the source sample/OBS monotonic clocks. OBS hello/heartbeat responses omit
  this app-only `capture` detail. Every 16 durable chunks per channel, a
  project-owned evidence checkpoint limits restart work; the API verifies its
  last PCM/metadata pair and replays the remaining chunks after reconnect.
- Pre-roll is RAM-only: at most 2 seconds per source and 64 MiB for the whole
  connection. Start attaches only samples at/after the acknowledged start
  boundary. Before an owner exists, evicted pre-roll is discarded. After an
  owner exists, dropped owned samples become an explicit transport gap.
  plan_pre_roll_retention is the Python conformance oracle; the C++ buffer
  must match its edge-case fixtures when implemented.
- OBS pause, app pause, user-disabled, source-missing, forward-pending and transport-gap are
  distinct intervals. App audio outside an OBS video span retains its absolute
  app timeline and has no video counterpart. No timeline segment is silently
  compressed. Per-track analysis WAV can insert silence for missing intervals
  so STT word offsets remain in the app timeline.
- MKV PTS/time base and spoken cue measurements will determine the correction
  map in LIVELINK-08. This contract does not claim hardware genlock or a
  verified sub-200 ms sync result.

## Project persistence and v2 read path

- Proposed v3 project record is an ObsCaptureRecording JSON aggregate under
  assets/obs-livelink/<recordingId>/recording.json, plus durable per-source
  chunks and an event/interval journal. The final parent media asset points
  to one project-relative source.mka. Its child references use parentAssetId,
  streamIndex, trackUid, channelId, sourceUuid and alias revision. A source
  stereo pair remains one track, never two OBS sources mixed into one track.
- The plugin hello/heartbeat snapshot returns recent recording IDs, status,
  timing and video span IDs without nested `sourceArchive`. Matroska TrackUID
  may exceed the signed 64-bit range accepted by OBS's JSON parser. The app
  status and project journal keep the full archive metadata and exact UID.
- Final STT extracts one child track into a rebuildable analysis.wav PCM16
  mono 24 kHz derivative. Live STT consumes owned PCM chunks before the MKA
  exists. Capture status stopped means only that intake ended. Archive status
  stays pending until the MKA artifact and track manifest have been verified.
  Failed MKA finalization retains chunks and does not mark the source archive
  ready.
- Existing v2 data at assets/obs-live/<sessionId>/session.json continues to
  load through FileObsLiveSessions. legacy_track_view projects each v2 session
  as a read-only WAV stem with protocolVersion=2, original source/analysis
  paths and asset ID. It never invents an MKA parent or rewrites v2 files.
  A future unified Media Pool reader may show both formats side by side.

## Waveform snapshot feed (LIVELINK-08D)

- `GET /api/projects/{projectId}/obs-livelink/recordings/{recordingId}/waveform`
  requires `channelId` and accepts `startSeconds`, `endSeconds`, `maxPoints`,
  and optional `afterSequence`. The window is at most 120 seconds, the response
  at most 600 PCM16 extrema points. A channel with no PCM has `sampleRate:null`
  and no points rather than an invented sample clock.
- Each point has `startFrame`/`endFrame` on the recording timeline, source
  `firstSampleIndex`/`lastSampleIndexExclusive` when read from live PCM, and
  signed `min`, `max`, unsigned `peak`. Null extrema distinguish a missing PCM
  bucket from received silence (`0`). `source` is `pcm` or `mka`; MKA points
  use `sampleAxis:recording` and null source sample indices.
- `afterSequence` limits a live delta to 32 chunks. `lastIncludedSequence` and
  `hasMore` allow catch-up without a large response. Deltas contain only bins
  touched by those chunks; the client merges them by `startFrame`. The existing `/events`
  status SSE carries `capture.lastDurableSequence` after each successful
  envelope write; the browser polls `/status` at two-second intervals if SSE
  disconnects, then requests the waveform snapshot. SSE carries no raw PCM.
- Live sidecars are saved under each channel's `envelopes/` directory. After
  Stop, the matching MKA track supplies a rebuildable 10-second block cache
  under `archive-envelope-v1/`. The project journal's pause/channel intervals
  and stem gaps distinguish deliberately padded archive silence from speech
  recorded as true silence. See ADR 0014.
