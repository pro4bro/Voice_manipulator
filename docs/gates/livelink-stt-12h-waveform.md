# LIVELINK-STT-12H — retain live waveform and recording-owned lanes

Date: 2026-10-03
Result: cursor/lane regressions and OBS/browser presentation checks passed;
sustained PCM receipt latency remains open.

## Reproduction and fix

Two component regressions failed before the fix:

- A saved SVG path `M0.0 20.1V39.9` became empty when a cursor response
  advanced over chunks outside the viewed window. That API response legitimately
  contains `sampleRate=null`, no points and an updated sequence cursor. The
  frontend treated the rate difference as an authoritative replacement.
- A missing historical source with Forward enabled and zero chunks in the
  current recording still created a pending lane.

For a matching recording, channel, source, sample axis and window, an empty
cursor delta now retains the saved bins/rate and advances the sequence fields.
Full snapshots, window changes and rate changes remain replacements. Tests
also cover received silence after an empty delta and a new empty window.
The backend regression pins the real empty-delta contract, including pagination.

Live lanes now include present forwarded sources and any source with durable
PCM in this recording. A missing source without PCM in this take is omitted;
a source removed after recording audio stays available. When a live window
has no waveform but its track already has saved PCM, the UI says
`PCM đã lưu · cửa sổ này chưa có dữ liệu`; an unrecorded track still says
`Đang chờ PCM`. No PCM, public API or persistent format changes were made.

## Physical OBS/browser checks

Used isolated official OBS 32.2.2 with unchanged plugin 0.6.7, an isolated API
registry, the two Vietnamese speech fixtures from 11C and the built UI in the
in-app browser. The copied inventory retained four missing historical sources
with Forward enabled. Only the two new test sources were forwarded. Tests
ran before recording; Studio was warmed again after backend tests. Its load
count was 8 before recording and at cleanup, with `medium` and `large-v3`
resident. No API/Studio restart occurred during either take.

The first recording, `155c3923-e756-5248-a834-c2533b7307dc`, lasted 202.977 s.
Detailed `large-v3` STT started at 37.3 s with 60-second blocks; live STT ran
concurrently. Input, Script, Media Pool and Timeline stayed open. Scratch API
probes logged response windows, cursors, rate, extrema counts and elapsed time,
without PCM, credentials or transcript content. Browser observations read SVG
paths and visible status text; screenshots checked both Layer and Column layouts.

- Exactly two live lanes appeared despite the four missing historical sources.
- At 61.8/74.8 s both SVG paths had 440/590 time bins respectively, including
  nonzero extrema, across automatic window changes and a layout change.
- Seeking the first Script row returned to 0–60 s while recording continued.
  The API emitted empty cursor replies; both paths retained 600 bins, including
  280/233 nonzero bins, when inspected again. An immediate window-change
  observation briefly preceded one track's full response; it is not counted
  as a completed render or a clearing regression.
- Returning to live, changing zoom and Stop handed the two lanes to MKA
  waveform rendering without refreshing the page. The archive tail was visible.
- 478 waveform responses were logged, including 93 empty cursor responses
  across historical and future windows. Window response timing does not certify
  compositor presentation or uninterrupted frame-by-frame visibility.

The second recording, `757ad200-a049-5be2-b31d-23685deacad5`, lasted 46.509 s
and used the final build including the new empty-window label. One test source
was removed at 15.219 s. Both recording lanes remained, with no historical
extras. At 40.424 s in a 15-second live window, the removed source displayed
the saved-PCM label while the continuing source showed 269 bins, 110 nonzero.
Both sources were retained in the completed two-track archive. Detailed STT
was not requested in this short source-removal check.

## Artifacts and validation

| Check | Sustained take | Source-removal take |
| --- | --- | --- |
| Committed chunks, source 1 / 2 | 292 / 292 | 24 / 79 |
| Native format | 48 kHz stereo s16le | same |
| Sample gaps / overlaps in retained PCM | 0 / 0 on both | 0 / 0 on both |
| Live checkpoint next sequence | 292 / 292 | 24 / 79 |
| Live events / error-status events | 109 / 0 | 17 / 0 |
| Open utterance / duplicate final | none / none | none / none |
| MKA bytes | 5,664,701 | 787,042 |
| Journal hash / all audio streams decode | passed / passed | passed / passed |
| Detailed published 24 kHz analysis frames | 4,871,444 / 4,871,453 | not requested |

Every retained PCM length/hash/sequence was checked. Detailed published cursors
equal the available recording-bounded analysis frames; both tracks published.
The source-removal archive retains the removed source's captured prefix.
Its journal did not record a mid-take source-missing interval for that new
source; this timing-provenance gap remains open in LIVELINK-STT-12J.
Native logs contain idle/Start overflow counters; retained-chunk continuity
does not by itself classify those counters as lost audio inside this take.

- `npm test -- --maxWorkers=2`: 54 files / 457 tests passed on final source.
- `npm run typecheck` and `npm run build`: passed on final source.
- Backend suite: 493 passed, two existing deprecation warnings; after extending
  its waveform contract assertions, the affected test passed separately.
- `git diff --check`: passed. Native plugin and engine source unchanged.
- Restored test scene, recording directory and visible-source Forward choices;
  browser lease released, outbox empty and isolated test processes stopped.

Ignored evidence: `.scratch/livelink-stt-12h/prepare.py`, `probe_api.py`,
`waveform-responses.jsonl`, `take/`, `quick/`, `check.py`, `acceptance.json`,
`browser-observations.json`, native/API logs and `cleanup.json`. Helpers use
the repository root and project-owned media; no owner project was edited.

## Remaining gap and exact next

The sustained take again built up a native outbox: sampled peak 118, finally 0.
PCM receipt p95 was 41.434/41.801 s, maxima 42.575/43.052 s; the last receipt
arrived 36.058 s after Stop. At 173.8 s the browser correctly showed pending
PCM lag of 36/37 s. Zooming to a future 30-second window then had no received
audio to draw. Preserving cached bins does not supply that missing live tail.
Native HTTP times also increased; this round did not profile durable-write
stages or establish the cause of the renewed backlog. The favorable 12G
latency result is not a sustained latency guarantee.

Exact next: **LIVELINK-STT-12I** — reproduce and profile the renewed PCM ACK
backlog under sustained browser waveform polling with model residency checked,
reduce the measured bottleneck, then verify the live tail and Stop drain again.
Recognition accuracy, cold startup/reconnect, Script follow, broader sources,
owner DPI and clean-machine portability remain in the wider LIVELINK-08 matrix.
