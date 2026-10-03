# LIVELINK-CAPTURE-10B — physical live Media Pool gate

Date: 2026-10-03. Product baseline: `2aec37b`.

Verdict: **passed for a controlled five-source physical OBS recording**.
Existing provisional-footage interaction, independent source capture and
automatic MKA handoff work in the running browser. No product repair was needed.
This is not acceptance of the owner's complete microphone/device matrix.

## Setup and retained evidence

A separate portable OBS copy uses an independent configuration, a new scene and
five looping four-second mono PCM16 48 kHz WAV sources, peak 8,000. All five
inputs are muted in the OBS mixer and explicitly forwarded through LiveLink.
Other sources are not forwarded. This exercises raw source capture independently
of OBS mixer output. Slots 7–11 are persisted source identifiers, not five of
OBS's six output-mix tracks. Existing mappings were not renumbered.

The unchanged packaged bridge 0.6.9 DLL has SHA-256
`ADB1609F1E6589BAEFDD84D365B00D4367AD4F6A9E918B10F3E294C582F7F1D7`.
Its pairing dialog permits only the product API port 18120. Initial isolated
18220 setup therefore cannot exercise this native package. The physical gate
uses the initially idle API at 18120 and app at 18119, with a new scratch project;
owner services are never restarted. The test project is registered and retained
under `.scratch/livelink-capture-10b/owner-api-projects/`. Original OBS
configuration and pairing files are not edited. A copied stale `.sentinel`
directory initially blocks portable OBS startup; it is retained under the scratch
root and a fresh launch succeeds. These setup failures are not product passes.

OBS WebSocket StartRecord/StopRecord drive an actual native recording; no HTTP
PCM replay is substituted. Recording ID:
`f825123f-20a6-544f-8079-241e3d1a12cb`; duration **77.8599864 seconds**.

Ignored local evidence under `.scratch/livelink-capture-10b/`:

- `physical-state.json`: source UUID/channel matrix, project and recording state.
- `live.json`, `live.png`: interactive provisional footage and PCM playback.
- `after.json`, `after.png`, `final.png`: automatic completed-footage transition.
- `check-media.py`, `media-acceptance.json`: chunk, archive and decode assertions.
- `console.json`, `physical-cleanup.json`, `cleanup.json`: browser and cleanup.

## Running browser

1. Open the scratch project and select OBS LiveLink as the capture source.
2. Start native OBS recording. Media Pool creates a selected provisional row.
3. Open that row: all five live track controls appear. Open Track 9; Timeline
   selects it, displays five lanes and advancing saved-PCM/waveform information.
4. Request Track 9 saved-PCM preview. The returned 30-second WAV reaches audio
   readyState 4; actual browser playback advances to 16.772 seconds while OBS
   remains recording. Pause this preview before Stop.
5. Stop native OBS. The row briefly reports MKA creation, then automatically
   becomes one selected footage containing five tracks. No F5, project reopen or
   browser reload occurs. Recording identity and selected Timeline Track 9 remain.
   All five audio elements reach readyState 4 with approximately 77.86-second
   durations. Final browser has no alert; warn/error console entries are empty.
6. Switch Timeline to columns for the retained final screenshot.

The API publishes one MKA parent plus five analysis children. Six asset records
do not mean six independent footage rows: Media Pool shows one grouped footage.
Only Track 9 is actually auditioned live; all five final streams are decoded
offline and all five browser audio elements reach readyState 4. Publication
latency was not separately measured.

## Independent source and media integrity

| Source slot | Expected/measured Hz | PCM chunks | First callback lag ms | MKA stream index |
| --- | --- | --- | --- | --- |
| 7 | 330 / 330 | 68 | 28.501 | 4 |
| 8 | 440 / 440 | 68 | 66.713 | 3 |
| 9 | 550 / 550 | 70 | 29.094 | 0 |
| 10 | 660 / 660 | 68 | 77.985 | 2 |
| 11 | 770 / 770 | 68 | 40.052 | 1 |

All **342 chunks** pass contiguous sequence, channel/source identity, declared
frame size and SHA-256 checks. Each track has **zero interchunk sample gaps**;
journal gap arrays are empty. Raw capture begins at the first callback, 28–78 ms
after the recording boundary; this is not a zero-start-latency claim. Tail
differences are below 20 microseconds. Analysis outputs include boundary padding
and span the recording, mono PCM16 at 24 kHz, approximately 77.86 seconds each.

The **5,277,635-byte MKA** matches its journal hash and contains five FLAC
streams. FFmpeg decodes every full stream. A one-second window at ten seconds
in each stream has the expected distinct tone, RMS approximately 5,656.8 and
peak 8,000, with no clipped samples in that window. Stream index is checked
against the journal mapping; source order is not assumed to equal container
stream order. This proves routing for these fixtures, not speech recognition.

The live screenshot still reports **PCM approximately 13 seconds behind** the
recording cursor. Final chunk continuity does not imply low live tail latency.
This take has no latency distribution/profile, so it cannot close the earlier
ingest/STT latency gap. Keep this visible observation in the final load gate.

## Overflow diagnostic limit

The first checker incorrectly required no overflow log carrying this recording
ID. Five such warnings occur shortly after Start; they are retained verbatim in
`media-acceptance.json`, rather than discarded. Native capture already reports
overflow while idle: forwarded callbacks use a ten-second idle buffer, and
overflow counters are cumulative. `set_recording` does not reset them; the
dialog reports counters by channel with the currently active recording ID.
That log label cannot establish a per-recording lost-frame count.

The final checker removes only that invalid log assertion. Chunk continuity,
hashes, boundaries, archive mapping and full decodes still pass. This does not
prove that all cumulative loss occurred before Start, nor that future takes
cannot drop data. The warning counters need separate interpretation in the
final LIVELINK-08 load/device gate. No native diagnostic change is made here.

## Validation and cleanup

- `npm test`: **55 files / 464 passed**, 18.03 seconds.
- `npm run typecheck` and `npm run build`: passed.
- Core Python `check-media.py`: final media assertions passed, raw warnings retained.
- Backend 500 tests remain the historical 12L baseline; not rerun because this
  acceptance round changes no backend, frontend, engine or native source.
- No new native build or inference-quality acceptance is claimed.
- Before stopping test OBS: native recording idle, app recording absent, project
  lease released, native spool empty; five test sources requested Forward off.
- Only portable test OBS and unused isolated test services are stopped. Ports
  18219/18220/18091 are free and the isolated session is removed. Owner listeners
  remain 18119 PID 41576, 18120 PID 29892, 18081 PID 55688.
- Successful gate browser tab is closed. Test media/project remain for review.

Remaining: owner physical devices, wider source counts, sustained inference/load,
natural listener loss/disk stalls, owner installation and exact video timing.
Tones cannot establish live or detailed STT accuracy. F5 persistence and a
two-recording delete/restore lifecycle are not exercised by this single take.

Exact next existing round: **UX-08B**, two real OBS sessions, reopen each footage,
then verify independent media/Script identity and delete/restore. A single live
take cannot prove that the next footage remains separate and reopens correctly.
