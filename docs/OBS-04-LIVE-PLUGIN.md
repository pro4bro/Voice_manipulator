# OBS-04 live receiver and one-source plugin

Date: 2026-09-22
OBS: 32.2.2, Windows 11 22621
Source: `OBS01 Mic`, UUID `37f6e1be-c4be-4790-97b5-34dc80acb8f3`, 48 kHz stereo
Protocol: version 1, loopback HTTP with a project pairing token

## Delivered slice

- `services/api/app/adapters/obs_live_sessions.py` durably stores bounded PCM16 chunks and their metadata under `assets/obs-live/<session>/chunks`. It flushes the bytes and atomically publishes both chunk metadata and the session manifest before returning the ACK.
- Exact sequence retransmission is idempotent. Conflicting retransmission, invalid hashes, oversize data, invalid frame counts, and non-contiguous events are rejected.
- Finalization writes a project-relative PCM WAV stem plus a 24 kHz mono analysis WAV, then registers the stem in Media Pool. Known missing frame counts become silence; unknown gaps leave `timingComplete=false`.
- `plugins/obs-pro4bro-bridge` is a native Windows OBS module. It follows recording start, stopping, stopped, paused, and unpaused events and captures one configured source UUID. The audio callback converts OBS float planar frames to PCM16 and only attempts a bounded in-memory enqueue. HTTP, hashing, retries, and finalization run on a worker.
- The plugin detects a late first callback and later timestamp discontinuities. It sends a gap event in the same sequence space before the next chunk, allowing the app stem to retain the OBS recording clock.
- `scripts/build-obs-plugin.ps1` builds against matching OBS source headers and creates local MSVC import libraries from the installed OBS DLL exports. It does not modify the OBS installation.

## Connected OBS smoke

OBS loaded the plugin from `OBS_PLUGINS_PATH`; the API used project `test-record-1-5a016b08`. The test started and stopped recording through OBS frontend events. The temporary smoke timer used to operate OBS was removed from the delivered source after the run.

| Measurement | Result |
| --- | --- |
| OBS MKV | H.264 plus four AAC tracks, playable by FFprobe |
| MKV duration | 8.033 s |
| App stem | PCM signed 16-bit, 48 kHz, stereo |
| App stem duration | 7.996604 s |
| Duration difference | 36.396 ms |
| Durable audio | 204,480 received frames plus 179,188 initial missing frames and a measured 169-frame discontinuity |
| Transport | 6 acknowledged chunks, 150 ms average HTTP ACK, 194 ms maximum |
| OBS callback | 426 callbacks, 617 microseconds maximum, 0 dropped frames |
| Session | `live-645b293cc380`, source UUID preserved, `timingComplete=true` |

The first smoke exposed a 2.75 s duration loss because the microphone source began callbacks late and capture continued until `RECORDING_STOPPED`. The corrected plugin anchors the session at `RECORDING_STARTED`, records the initial interval as a known gap, and stops accepting frames at `RECORDING_STOPPING`. The repeated smoke reduced the MKV/stem duration difference to 36.396 ms.

## Pause and disconnect checks

- A real OBS pause/unpause run persisted `paused`, `unpaused`, and `stopped` as event sequences 0, 1, and 2 in `live-9d6d6d27b0ce`. The worker resets timestamp continuity after unpause so the paused wall-clock interval is not inserted into the compacted OBS media timeline.
- With the API endpoint deliberately unavailable for the full recording, OBS still produced a playable 6.033 s MKV with H.264 video and four AAC audio streams. The plugin's 1.5 s HTTP timeout and bounded queue did not block or abort OBS recording.
- The disconnected run does not promise replay after the process ends. Same-session reconnect and bounded local replay are OBS-05 scope.

## Automated verification

`services/api/tests/test_obs_live_sessions.py` covers durable ACK state, exact retransmission, conflict rejection, restart recovery, gap/silence finalization, project-relative paths after a project move, pairing enforcement, payload limits, and HTTP events.

The receiver currently uses a process-local lock. A future multi-worker API deployment needs a filesystem lock or a single-writer live-session service before multiple API workers may write the same session.
