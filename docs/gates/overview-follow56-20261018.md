# Round56 — OVERVIEW-WAVEFORM-FOLLOW-01

Date:2026-10-18. Baseline:6fd4e133c20bbb30f65c8d6557e71d24f914255b.

## Scope

Link overview transport seeking, painted playhead, waveform viewport and existing
Script word publication while zoomed. Ordinary Timeline reused in focused editors
changes only its follow helper and transport seek caller. No backend/model/media/
saved word timing changes. ADR0113 records policy and the multiple-selection rule.

## Regression evidence

- RED:`npx vitest run src/modules/timeline/TimelineNavigation.test.tsx -t
  'overview transport drags'`:2failed/9filtered-out,35.02s including cold jsdom.
  At85s playhead transform1700px, scrollLeft remained0 instead of1000. Both plain
  and disjoint selections reproduced the owner's symptom. `.scratch/follow56/red.log`.
- GREEN:TimelineNavigation +ProductionSelection +SubtitleFeedback:28pass/3files,
  10.76s. Assertions cover immediate pointerdown/move, Script active word at85s
  then20s, viewport1000 then300px, stale media event immunity and stable release.
  Selection callback is not invoked by overview seeking.
- ImportedMultitrack +ObsLiveLink:94pass/2files/16.34s, including4new LAYER/CỘT
  overview controls and existing edge pan/release/cancel/follow cases. An initial
  test query wrongly requested the shared ruler in column layout; corrected to
  the actual column ruler/playhead without changing product behavior/assertions.
- Typecheck/build187modules pass. Full gates recorded below after completion.

## Source browser evidence

Own background dev tab at18441, Test11's6744-word transcript and38:59.243 audio.
At maximum zoom, a real drag of the full-duration transport fromx200 tox850
landed at00:30:50.492. Waveform ruler moved to30:50.x and Script scrolled to that
passage. Playhead screenx304.5 is inside viewport199..1263 (1064px wide),
scrollLeft1850386. Reverse real drag tox350 landed00:07:37.049; ruler and Script
both moved back, playheadx304.375, scrollLeft456943. No console errors observed.
Real drag screenshots observed after release; held-pointer synchronization is
proven by the component regression tests. No transcript/media edits or shared
runtime restart. Own server/tab closed; owner's existing tab preserved.

## Full gates and release

Frontend:`npm test -- --maxWorkers=1`:1102pass/133files/273.66s.
Typecheck/build187modules pass. Full API:`.venv/Scripts/python.exe -m pytest
services/api/tests -q`:1150pass/479.45s,3existing/fixture warnings. Diff check and
all599frozen input hashes pass. No skips, assertion relaxations or timeout changes.
Full web/API ran sequentially; no retries were needed. Logs under `.scratch/follow56/`.

## App-update verification

Official generator allocated alpha0.5.17 NoVibeVoice from clean source
9c9ebbc1aacd4787318e57db3afdae78075635af. Capture package gate passed. All206payload
files match source hashes; all210ZIP entries match bytes and pass CRC. ZIP:
`releases/updates/App-alpha-0.5.17-NoVibeVoice.zip`,1,443,424bytes.
SHA256:7ef6cf0f9b536c45848e563a33923a8761307af03860b856e714e3374c1d10b1.

Served the actual payload/apps/web/dist in an own preview origin with the existing
local API. On Test11, maximum zoom and real forward/reverse overview drags reveal
the correct waveform at30:50.492 then07:37.049. Source/pack scrollLeft1850386 and
456943 respectively; playhead screen304.5/304.375 inside viewport199..1263. Script
follows the passage; no console errors. Own preview tab/server closed. This proves
compiled UI parity, not the installed full base/runtime stack: that gate remains
deferred until the owner copies the heavy components and runs VERIFY0failed.
No shared runtime restart, source media or transcript edits during QA.

## Remaining acceptance

This round fixes viewport synchronization and does not prove acoustic word timing
quality. Round48 independent listening anchors, Checkpoint A,13processor gates and
wider live/imported editing UAT remain open. Phase03 stays60%.
