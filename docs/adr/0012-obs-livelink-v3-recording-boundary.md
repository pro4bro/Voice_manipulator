# ADR 0012: Separate OBS LiveLink From The App Recording

## Status

Accepted

## Context

The OBS v2 bridge opens one app session per source when OBS starts recording.
The owner needs a connected mixer while the app is idle, manual app recording,
independent source tracks, selective OBS trigger following, and one app
recording that can intersect zero or several OBS video files. Treating the OBS
recording flag as the app's sole state loses those cases. The current Media
Pool stores one source file per asset; a future audio-only MKA archive needs a
parent asset and addressable child tracks without duplicating full source WAVs.

## Decision

- An OBS process has one ObsLiveLinkState connection/control state. A valid
  ObsTargetLease selects one project/workspace owner for new captures.
  Connection, target lease, OBS video state, and app recording are distinct.
  Lease expiry blocks new app recordings; an already owned recording retains
  its project until a defined Stop or link-loss boundary.
- The project owns an ObsCaptureRecording aggregate. It may reference zero
  or more ObsVideoSpan IDs. Each OBS Start creates a new video span even when
  the app keeps recording after an ignored OBS Stop. A manual app Stop never
  stops OBS. Stopping LiveLink closes the app recording, marks the observed
  span as link-stopped, and leaves actual OBS recording state unknown.
- A channel's stable identity is channel ID plus OBS source UUID. Native name,
  relay label, alias revision and slot are metadata. Missing/removed sources
  retain identity and slot history; a new source UUID requires a new channel
  or an explicit later migration. Forward disabled and source missing create
  separate intervals with applied sample/time boundaries.
- Manual and OBS automation pauses are independent causes. Ignore policy is
  machine-local and applies only to future OBS events. OBS Unpause removes
  only the OBS cause, even when the policy changed after Pause. OBS video pause
  intervals are observed regardless of app policy.
- Plugin lifecycle events use the tuple (install ID, OBS process instance,
  event sequence), with a stable event ID and monotonic nanosecond timestamp.
  Identical retries are no-ops. Conflicting IDs, missing sequence, or clock
  reversal fail closed and require a full snapshot/resync. Command ACKs must
  match command ID, connection epoch and revision before applied state moves.
- Plugin hello/heartbeat responses carry recent recording identity, timing and
  archive status without the nested source archive. Matroska TrackUID is an
  unsigned 64-bit value; OBS's JSON parser rejects values above signed 64-bit
  maximum. The app status and project journal retain the complete archive and
  exact TrackUIDs. This keeps the plugin able to observe the next recording
  after a previous MKA is finalized.
- Every v3 audio chunk identifies recording, channel, source UUID, sequence,
  sample index/count/rate, OBS audio timestamp and plugin monotonic timestamp.
  App receipt time is diagnostic, not media time. Sample counts and explicit
  pause/disabled/missing/gap intervals preserve the app timeline. Mapping to
  each OBS MKV's PTS remains measurement work for LIVELINK-08.
- Channel capture status is a projection of the app recording, applied Forward
  ACK, source presence, and durable PCM receipt. OBS Record and meter activity
  alone never assert that the app is receiving audio. Server UTC receipt time
  only determines pending/stalled display; sample indexes and OBS monotonic
  time remain the media clock. Per-channel high-water checkpoints under the
  project recording folder make API restart recovery bounded; retained PCM
  metadata after the checkpoint is replayed before status is published.
- After finalization, one project-relative source.mka parent asset owns one
  FLAC or PCM track per source. A child reference uses parent asset ID, track
  UID, stream index, channel ID and source UUID. Analysis WAVs are rebuildable
  STT derivatives. The v2 ObsLiveSession and its source WAV remain readable
  as v2; no eager rewrite or claim of an MKA archive occurs on read.

## Consequences

- The pure v3 reducer and serializable contract can be tested without OBS or
  project I/O. The native plugin, v3 API endpoints, durable v3 store, Media Pool
  track addressing and MKA finalizer remain separate later rounds.
- Machine-local connection/lease/pairing state must not be copied into
  project.json. Project recording and final media references use portable
  relative paths. OBS absolute recording locators stay machine-local until an
  explicit import creates a project asset.
- A disconnected plugin or missing event can leave unknown video coverage.
  The app records that uncertainty instead of compressing time or inventing a
  synchronized MKV offset.
- OBS video continues to be recorded by OBS independently of app, API or STT
  failures.
