# OBS-06 — Final STT and session SRT

Date: 2026-09-22. This is the OBS feature track's sixth round.

## Delivered

- Speech to Text can queue Final STT separately for each app-recorded live stem
  or imported MKV child track. The existing media transcription queue stores
  each result and revision on its own asset; queueing one source does not edit
  another source.
- An imported OBS session lists its tracks and requires an explicit checkbox
  selection before merging them. This avoids automatically duplicating speech
  from a mix track and its isolated tracks. The selected source IDs and labels
  are retained in the export activity entry and each SRT cue has a source label.
- The session SRT uses the imported video's duration and each track's measured
  `videoOffsetSeconds`. The OBS-02 import path normalizes MKV track samples to
  video time zero with FFmpeg `aresample=async=1:first_pts=0`, including the
  paused, compacted timeline observed in OBS-01.
- Session export accepts only words with `timingTrusted=true` from assets whose
  quality is `source` or `partial`. Invalid or out-of-range words and cues with
  untrusted timing are omitted. The page and project activity log show their
  separate counts. The SRT stays standards compatible. Video time is never
  inferred from API arrival time.
- The file is written under the project's `exports/subtitles/` folder. A
  selection-specific filename keeps separate source combinations reviewable.

## Verification

- The two-source timing test merged cues at **2.300**, **6.980**, **10.300**,
  **18.980**, and **19.300** seconds, including the late-start source and a cue
  after the OBS pause. It excluded one untrusted cue and one word past the video
  end. Revising the App source changed only App cues; Micro cues stayed intact.
- The real OBS-01 aligned application WAV was opened and sampled at **2.300**,
  **10.300**, and **19.300** seconds. Each 150 ms window measured PCM RMS
  **6,987** (48 kHz mono), confirming that those SRT test anchors coincide
  with actual fixture audio. OBS-01's video track spans 0–22.000 seconds and
  its pulse comparison found mix/isolated agreement within 10 ms at all three
  anchors. The fixture is tones, so this does not measure speech recognition or
  visual lip sync.
- Backend suite: 374 passed, one Starlette deprecation warning.
- Frontend suite: 38 files, 292 tests passed. Production build: 78 modules.
- Browser check after restarting the local API/Studio showed Final STT stem
  controls on every finalized live source with an asset; no browser warnings or
  errors.

## Boundaries

Session SRT is exported against a finished, imported MKV and its normalized
child tracks. A live stem can receive its own Final STT immediately after OBS
stops, but its unreviewed callback timestamps are not silently treated as the
finished video's PTS. To produce a video-synchronized SRT, import the MKV,
review the child track transcripts, select the desired tracks, then export.
This is particularly important around OBS pause/resume and any plugin gap.

The synthetic fixture has no spoken line or filmed clap. A 30-minute spoken
meeting and measured cue-to-picture error at start, middle, and end remain an
overall acceptance exercise; this round does not claim that measurement.
