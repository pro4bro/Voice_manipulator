# ADR 0019: Isolate archive finalization from PCM receipt

Date: 2026-09-30
Status: Accepted

## Evidence

The installed OBS plugin had 63 durable SQLite chunks waiting for delivery.
The API repeatedly encoded an already published older recording while holding
the audio adapter's global lock. Its synchronous finalize response exceeded the
plugin's 1.5-second HTTP receive deadline, causing more retries and Windows
file-sharing errors. This blocked unrelated recordings, including live waveform
and provisional transcription. Regression tests reproduced both lock blocking
and repeated encoding before the fix.

## Decision

- Serialize chunks/finalization per recording. Keep the shared runtime lock only
  around state and journal changes; never hold it while FFmpeg encodes an archive.
- Authenticate finalize requests, schedule one task per recording and acknowledge
  promptly with `artifactReady: false`. This is acceptance of work, not success.
- Mark ready only after verified MKA and its analysis tracks exist. Duplicate
  finalization reuses the verified archive hash instead of encoding again.
- Await finalizers during graceful shutdown. Durable PCM and the journal remain
  the recovery source for explicit Archive Retry after an abrupt process exit.
- Failure to remove a temporary WAV after successful verification is logged;
  it does not turn a published archive into a failed recording.
- Persist a display name from local start time, project name, source code and
  the first eight recording-ID characters. MIC, SYS and LIV distinguish sources.
  Project-owned internal asset paths remain portable and stable.

## Verification

The real pending SQLite queue drained to zero after restarting the managed API.
The affected recording published two tracks. A new two-channel take and another
take with two additional speech fixtures received PCM with zero observed sample
gaps. The speech take produced waveform points, live and final transcript events,
and a verified four-track MKA. Fixtures were removed from OBS after the check.
