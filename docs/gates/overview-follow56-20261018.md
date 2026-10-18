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
Typecheck/build187modules pass. API full run and numbered app-update parity pending.

## Remaining acceptance

This round fixes viewport synchronization and does not prove acoustic word timing
quality. Round48 independent listening anchors, Checkpoint A,13processor gates and
wider live/imported editing UAT remain open. Phase03 stays60%.
