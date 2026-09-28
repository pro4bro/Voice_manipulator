# OBS-01 — Real recording and timecode contract

Date: 2026-09-22. Scope: OBS feasibility fixture only; no product code or OBS
plugin was changed. This is the evidence for round OBS-01 in `tasks/plan.md`.

## Machine and recording setup

| Item | Measured/configured value |
| --- | --- |
| OS | Windows 11 Pro, build 22621 |
| OBS | Studio 32.2.2, obs-websocket 5.7.4 |
| Video | Display Capture, H.264, 1280×720, 30 fps |
| Audio | 48 kHz stereo AAC in MKV |
| OBS output | Advanced recording, track bitmask 15 (tracks 1–4) |
| Track 1 | Mix of all enabled sources |
| Track 2 | SmallRig microphone only |
| Track 3 | OBS Application Audio Capture of an FFplay test-tone process only |
| Track 4 | OBS Media Source with a 1.4 kHz pulse; enabled 7 s after start |

The FFplay process emitted 1 kHz pulses every 4 s. The late Media Source
emitted 1.4 kHz pulses every 3 s. Recording was paused after about 13 s,
resumed about 3 s later, and stopped after another 9 s. A dedicated OBS
profile and scene collection named `Pro4Bro-OBS01` were used. The resulting
recording and generated test WAVs remain under ignored `.scratch/`; do not
commit them because the display and real microphone may contain private data.
The original OBS global and websocket configuration was restored after the
test; OBS was closed and the original websocket-disabled state verified.

## Raw observations

The second, corrected fixture is the measured one. The first fixture enabled
only tracks 1–3 (`RecTracks=7`), so the late source was absent as a separate
track. That failure was retained as evidence that source-to-track assignment
must be checked before recording.

`ffprobe` on the corrected MKV returned one H.264 video stream (index 0) and
four AAC audio streams (indices 1–4); file size 17,405,528 bytes. The video
starts at PTS 0.000 s. All four AAC streams report start time **−0.021 s**;
their first decoded frame is AAC priming and the next begins at 0.000 s. The
container duration is **22.033 s**. OBS websocket event timestamps span
**25.047 s** from StartRecord to StopRecord, including a **3.000 s** pause.
The result is consistent with OBS removing the paused interval from the file
timeline. Video frames run from 0.000 to 22.000 s at 30 fps (661 output
frames); a sampled frame has mean luma 202, so the video is not an empty black
stream. The OBS log reported no output failure.

The MKV tags the audio streams only `Track1` through `Track4`; it does **not**
retain the human source names. The source/track map must therefore be captured
from OBS settings or confirmed by the user at import. A file importer cannot
reconstruct that mapping from MKV tags alone.

### Pulse alignment

Audio was decoded and filtered around each test frequency. Pulse onsets were
measured in 10 ms windows. The same onsets appeared in the isolated source
track and the mix track at all sampled anchors:

| Source | Early | Middle | Late | Mix vs isolated track | Nearest video frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| App, 1 kHz | 2.30 s | 10.30 s | 19.30 s | <10 ms at all three | 0 ms at all three |
| Late source, 1.4 kHz | 6.98 s | 12.98 s | 18.98 s | <10 ms at all three | 13 ms at early/late, 13 ms at middle |

The nearest-frame figures only bound timestamp-grid alignment. They are not a
visual lip-sync measurement: this fixture has no filmed clap or spoken phrase.
The real microphone contributed nonzero audio (mean −33.2 dB), but no spoken
anchor was recorded, so microphone speech-to-picture sync remains unmeasured.

Extracting the app track with
`-map 0:a:2 -af aresample=async=1:first_pts=0 -ac 1 -ar 48000`
produced a WAV whose detected pulses were 2.30, 6.30, 10.30, 15.30, and
19.30 s, the same as the isolated MKV track. Do **not** blindly add the
container's −21 ms AAC start time to STT words; decoder priming and the
extraction transform determine the usable WAV origin.

## Frozen contract for OBS-02

1. The finished OBS video's PTS timeline is the authoritative offline clock.
   A pause is already compacted in this tested MKV. Offline import does not
   need to reconstruct wall-clock pause intervals.
2. Import records each audio stream index, OBS track slot, source label supplied
   by the user or a future plugin sidecar, and the measured transform from
   extracted WAV sample time to video PTS. Source labels are never guessed from
   generic MKV track titles.
3. Extract audio through a timestamp-aware FFmpeg path that normalizes the
   first presented sample to video time zero and fills any actual source delay
   with silence. Preserve the original MKV in the project. Verify the transform
   on a late-starting source and a paused recording before marking it trusted.
4. The future live plugin must record OBS recording start/pause/resume events
   and source timestamps so provisional text can map to the final file. API
   arrival time is never a subtitle timestamp.
5. If a track already contains a mix, label it as a mix. Neither OBS nor import
   can recover isolated originals from it. Keep track 1 as a convenience mix
   and separately select source tracks for independent STT.

## Reproduce on another Windows machine

1. In an isolated OBS profile, set Advanced recording to MKV, 48 kHz audio,
   four tracks, and a short H.264 video. Create a display source, microphone
   source, application-audio source, and a late Media Source.
2. In Advanced Audio Properties, route every audio source to track 1, and each
   isolated source to one of tracks 2–4. Verify the recording output enables
   all four tracks. Use local generated pulse audio rather than meeting audio.
3. Start recording; enable the late source after 7 s; pause after another 6 s;
   resume after 3 s; stop after another 9 s.
4. Run the following and confirm video plus four audio streams:

   ```text
   ffprobe -v error -show_entries format=duration,start_time:stream=index,codec_type,codec_name,start_time -of json <fixture.mkv>
   ```
5. Decode each audio stream separately, compare known pulse onsets in the mix
   and source track at start/middle/end, then compare to video-frame PTS.
   Record the actual numbers; do not adopt this machine's 21 ms AAC priming or
   10 ms measurement resolution as universal constants.

## Gate and next round

OBS-01 **passes the file/timestamp feasibility gate** on this OBS/Windows
combination: distinct audio streams, late-source appearance, pause-compacted
file time, and sampled mix/source timestamp agreement were observed. The
remaining visual lip-sync and spoken-mic measurements belong to broader
end-to-end acceptance; they are not inferred from this synthetic fixture.

Next: **OBS-02**, session ingest and portable per-track assets. Its tests must
include the two traps observed here: disabled recording tracks and AAC priming.
