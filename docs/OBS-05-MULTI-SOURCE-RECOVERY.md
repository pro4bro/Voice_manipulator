# OBS-05 — Multiple live sources and recovery

Date: 2026-09-22
Host: Windows, OBS Studio 32.2.2, Pro4Bro local API

## Delivered behavior

- Protocol v2 groups several source sessions under one `captureId`. Each OBS
  source UUID retains its own session ID, source label, sequence journal, bounded
  plugin queue, gaps, PCM stem, reconnect loop, and provisional STT state.
- Opening the same active `(captureId, sourceId)` after an uncertain response is
  idempotent. The receiver returns the persisted session and rejects an audio
  format change instead of creating or relabeling another stream.
- A chunk is offered to live STT only after its source stem and manifest have
  been durably written. STT uses a bounded queue and can lag, pause, or fail
  without blocking the OBS audio callback or capture upload.
- Recording pause, unpause, and stop events fan out to every configured source.
  Finalized stems become ordinary project-relative Media Pool assets.
- Speech to Text shows every recent live source separately with capture ID,
  source UUID, bytes, gaps, live draft state, STT lag, and a link to its stem.

## Real OBS verification

### API restart and same-session reconnect

OBS recorded while the local API was deliberately stopped and restarted.
The application source resumed the same session and continued through sequence
49. It produced 2,211,840 frames / 8,847,360 bytes with zero gaps and finalized
as `asset-4ba7eef115d2`. No replacement session or source relabel was created.
The OBS MKV remained playable (H.264 plus four AAC streams, 46.133 seconds).

Plugin metrics for that source were 50 uploaded chunks, 227 ms average ACK,
539 ms maximum ACK, 540 audio callbacks, 1,227 microseconds maximum callback
time, and zero dropped frames. The microphone fixture emitted no callbacks in
this particular restart run; its persisted identity remained unchanged.

### Two simultaneous audio sources

Two looping OBS FFmpeg media sources with distinct UUIDs were configured in the
plugin and recorded under `capture-18664624865400`:

| Source | Live session | Final sequence | PCM frames / bytes | Gap | Live STT lag | Asset |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| OBS01 Late B (`f99a…`) | `live-516d36fb83bd` | 26 | 1,200,128 / 4,800,512 | 0 | 0.812 s | `asset-516d36fb83bd` |
| OBS01 Late (`059…`) | `live-9278b504b313` | 26 | 1,200,128 / 4,800,512 | 0 | 1.328 s | `asset-9278b504b313` |

Both stems are PCM S16LE, 48 kHz, stereo, 25.002667 seconds. The OBS MKV is
25.000000 seconds, a 2.667 ms difference. Both sources uploaded 27 chunks and
dropped zero frames. Their maximum OBS callback times were 2,291 and 1,649
microseconds. Their average HTTP ACK times were 444 and 439 ms.

The fixtures contain tones, so an empty transcript is expected. Independent
`stopped` STT states and measured per-source lag confirm that both durable
streams were dispatched through the live transcription path.

## Automated and UI verification

- Backend suite: 372 passed, one warning.
- Frontend suite: 38 files and 291 tests passed.
- Frontend production build: 78 modules transformed.
- Native plugin: built with MSVC against OBS 32.2.2; only OBS header C4201
  warnings were reported.
- Browser verification on the real Speech to Text page displayed the two source
  cards under the same capture ID, each with its own UUID, 4.6 MB stem, zero
  gaps, STT lag, and **Mở stem** action. Browser console: no warnings or errors.

## Recovery boundary

Acknowledged audio is durable in the project and survives an app/API restart.
Unacknowledged replay is bounded in plugin memory, so an API outage can recover
while the OBS plugin process stays alive. If OBS or the plugin process exits,
unsent in-memory audio cannot be replayed; any observed sequence discontinuity
is recorded as a source-specific gap.

The page now exposes pairing metadata and live status. A packaged installer and
an in-app OBS source picker remain later distribution work; they are not needed
for the proven multi-source transport and recovery contract.
