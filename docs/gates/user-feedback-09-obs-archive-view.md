# USER-FEEDBACK-09 — OBS archive view, waveform and transcript gap

2026-10-09. Baseline `dabe8f6`, branch `feat/03-04-high-quality-training`.
One bounded feedback round. Product commit `4568e3f`. Design: ADR0056.

## Reproduction and changes

The focused Vitest invocation for `ObsLiveLinkTimeline.test.tsx` and
`Timeline.test.tsx` reproduced three failures before the fix: paused zoom set
scrollLeft from2,000 to0; archive playback left the ruler at00:15 after the clock
advanced to76s; Stop never requested the standard track PCM waveform. Output:
3 failed /52 passed. Natural-device rapid jumping was not directly observed.

Shared Timeline now follows changed playback/seek time, preserving paused zoom
and metadata browsing. Removed the drag-release animation callback that captured
the old playhead. Programmatic follow updates the PCM-loading viewport. Archive
OBS playback advances its window at90% with10% lead and end clamping; paused
events do not cancel browsing. Five repeated idle status/journal refreshes retain
the manually chosen04:00 window and PCM detail in the regression.

Stopped tracks load source-derived PCM peaks through the same media waveform
endpoint used by ordinary Timeline, at1,024–16,000 screen-density points. The
shared filled geometry, accent color and gain/mute apply. Green selected-source
color and utterance background bands are live-only. Loading/error/retry overlays
retain same-track overlapping data without adding a row; obsolete requests are
aborted and fenced after JSON resolution. The existing archived-seek test was
updated to assert the intended absence of live green bands while retaining its
source, text and playhead assertions.

## Missing words: real artifact evidence

Read-only owner recording: `test-obs-9-f4e60d5e`,
`13b6cb03-2dfc-4b75-a05e-dd795c70d549`, journal duration406.4052262s.
Channel1 asset `asset-live-05d3d2248f2d` has1,094 detailed words and44 overlapping
[228,258). Detailed timing stops at240.352s and resumes at269.020s:28.668s with no
saved detailed words. Continuous PCM chunks, non-silent analysis audio and final
realtime utterances are present. Channel4 is digital silence in this window.
Both stored STT jobs report complete100%, error=null; the gap is not just display
density or missing capture. Raw per-segment detailed checkpoints are absent.
Recognizer omission versus merge loss is not attributable from the retained data.

Final realtime utterance text is exposed as a segment-level subtitle-lane note
where trusted detailed-word coverage is absent for at least2s. Tooltip shows the
original utterance interval/text; no new word timing or completion status is
fabricated. Silent portions of an utterance can also produce this review hint.
Independent Worker review identified untrusted estimates incorrectly counting
as coverage; fixed and covered by a regression. Existing words/timestamps and
owner transcripts are unchanged.

## Verification

- Full frontend: `npm test -- --maxWorkers=2`: **646 passed /74 files**,81.00s.
- `npm run typecheck`: pass. `npm run build`: pass,122 modules; final bundle
  `index-wL7TOgqS.js` and deletion Worker artifact emitted.
- Relevant backend: `.venv/Scripts/python.exe -m pytest
  services/api/tests/test_audio_waveform_envelope.py -q`: **2 passed**,0.10s.
  Backend product source unchanged; full API687/two existing warnings is the
  carried USER-FEEDBACK-08 baseline, not a rerun in this round.
- `pcm-detail-evidence.py` reads actual24kHz mono analysis WAVs with scratch-only
  caches. Both channels return1,500 points at228–258s and full overview; zoom
  240–240.5s returns500 real1ms peaks. Initial cache work~1.31–1.35s per channel;
  warm half-second query~10–11ms. These are adapter measurements, not browser
  responsiveness guarantees. WAV and source MKA hashes remain unchanged.
- `git diff --check`: pass. No debug product instrumentation remains.

Full tests use process-local PATH to bundled Node24.19.0. Initial system Node24.18
fork/thread runs timed out before executing any tests; bundled runs succeeded.
This does not establish why the initial test-worker boots stalled. Packages and
lockfiles were not changed. Frontend red output is retained in this chat; final
logs, transcript collector/results and PCM probes are under `.scratch/user-feedback-09`.

## Remaining gap and exact next round

**STT-GAP-01**: reproduce the affected audio on an isolated copy with retained
per-segment recognizer/merge artifacts; determine where the missing words are
lost, then fix with a regression before any owner transcript replacement. This
matters because a successful job currently does not reveal the missing speech.
STT-TIMING-ACCURACY-01 still needs reviewed word IN/OUT truth.

UX-EDITING-DEVICE-01 remains for actual paused/end scrolling, playback follow,
Stop waveform, audible scrubbing and editing acceptance after reload. Prior
browser-tool restrictions remain; no browser workaround was used. Runtime
readiness idle/cold, physical/LAN and Phase03 quality/budget gates are unchanged.
No services, OBS or inference were started/stopped by this round. Read-only normal
controller status at closure reports API stopped, Studio running, busy=false;
service operation must be restored before owner UI acceptance. The built UI is
ready to load on reopening/refreshing the normal app.
