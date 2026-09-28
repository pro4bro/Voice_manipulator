# OBS live capture contract (implemented by OBS-04/05)

The user requires two simultaneous recordings: OBS records the original video, and Pro4Bro records each selected audio source streamed directly by the OBS plugin while OBS is recording. Importing the finished MKV is a recovery/reconciliation path, not a substitute for live capture.

## Ownership and lifecycle

1. The native Windows plugin observes recording started, paused, unpaused, and stopped. It subscribes to audio capture callbacks on explicitly selected OBS sources. OBS documents both the [per-source raw audio callback](https://docs.obsproject.com/reference-sources) and [recording lifecycle events](https://docs.obsproject.com/reference-frontend-api). Build from the [official plugin template](https://github.com/obsproject/obs-plugintemplate).
2. On recording start, the plugin opens a paired local session. Pro4Bro allocates a project-owned live session ID and source stem IDs. A source's stable OBS UUID is the routing key; names are display metadata and may change.
3. The OBS audio callback copies frames and metadata into a bounded memory queue. A worker thread converts to interleaved signed 16-bit PCM, groups roughly one second of audio, and sends it to the local API. The callback never waits for the API, disk, or STT.
4. The API validates the local pairing token, protocol version, source allowlist, frame count, rate, channels, payload length, and per-source sequence number. It writes a chunk in the project folder, flushes and atomically publishes it, then acknowledges that sequence. An exact retransmission is idempotent; a conflicting retransmission is an error. The project manifest stores only relative paths.
5. On overload or disconnect, the plugin drops from its bounded queue and reports the missing sequence/time span as a gap. The app shows that gap and keeps earlier audio playable. OBS video recording continues independently. After reconnect, the plugin resumes the same source identity and sequence space.
6. The app can dispatch acknowledged chunks to provisional live STT without delaying recording. It keeps provisional words separate from final transcript revisions. The final pass can use the app-owned stems even when the finished MKV has mixed or fewer audio tracks.
7. After OBS stops, the plugin reports the finished recording path, and the app links/copies the MKV through the OBS-02 ingest path. The OBS media timeline is authoritative for reviewed subtitle timecode. Source callback timestamps, recording start/stop and pause anchors, sample counts, and observed gaps remain in the live manifest for reconciliation; API arrival time is diagnostic only.

## Protocol v2 shape

- Capture start: the plugin generates one `captureId`, then opens one session per
  selected source UUID with the shared capture ID, project ID, protocol version,
  OBS version, source name, recording anchor, and audio format. Reopening an
  active `(captureId, sourceId)` returns the existing source session. A source
  name is display metadata and never changes the routing identity.
- Audio chunk: session ID, source ID, increasing `sequence`, first OBS timestamp in nanoseconds, sample rate, channel count, frame count, `pcm_s16le` interleaved bytes, and payload hash. Bound each request to at most one second of PCM and at most two channels in OBS-04; validate before writing. Expand channels only after measured need.
- Event: `recording-started`, `paused`, `unpaused`, `gap`, `source-muted`, `source-removed`, `recording-stopped`, with OBS timestamp and a monotonic event sequence. Events are durable and idempotent.
- Status: per-source last durable sequence, bytes, duration, missing spans, app recording state, live STT lag, and linked MKV state. UI must distinguish OBS video recording, app audio recording, and STT health.

## Acceptance evidence

OBS-04 proved one-source live capture. OBS-05 proved two simultaneous source
sessions and same-session delivery after an API restart. The measured results,
including callback cost, ACK latency, source identity, sequence continuity,
stem/video duration, and the process-restart replay boundary, are recorded in
`docs/OBS-04-LIVE-PLUGIN.md` and `docs/OBS-05-MULTI-SOURCE-RECOVERY.md`.
