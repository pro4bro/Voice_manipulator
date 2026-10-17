# Round47 — waveform clock and synchronized selection

Date:2026-10-17. Requirements: STT-06, STT-09 and owner timing/selection feedback.
ADR:0105. One bounded stabilization round; Phase03 remains60%.

## Reproduction and fix

1. AudioWaveformEnvelope used fixed ceil-sized groups with a shorter final
   group. Plain Timeline placed peak i at i/(N-1); imported Timeline assumed
   equal groups at i/N. Numerical4285s/1500point reproduction shows final-bucket
   start error +2.357s/plain and -0.499667s/imported. This is display drift, not
   a measured constant word/STT offset.
2. Detail peaks and overview source frames now use proportional partitions,
   rendering at bucket starts i/N. Overview cache version2 invalidates old
   geometry;1ms peak data remains reusable. Source WAV and saved words unchanged.
3. Timeline border consumed two pixels while pointer mapping used its outer
   width. An inset shadow preserves the frame with shared input/draw geometry.
4. Registry only enabled selection ranges for generated voice. Ordinary STT
   now shows matching waveform highlight, START/DURATION/END and subtitles.
   Imported tracks receive selection callbacks and asset/revision-scoped ranges.
5. Native Script textarea and channel word/text views now publish timed word
   selections. Incoming text selections preserve the editing caret and partial
   text; disjoint words never imply a contiguous native text selection.
6. Ctrl/Meta+left drag selects time on waveform/subtitle track. Plain waveform
   drag scrubs. Plain subtitle Ctrl-click inserts only after no-drag release.
   Existing Ctrl-drag stretch handles remain under the voice-edit controller.
   Imported disjoint selections do not trigger implicit seek/scroll; imported
   readouts clamp inside the visible lane.

## Tests

RED:3registry cases failed with missing overlays and premature subtitle input.
Two Python grouping/cache tests failed before the fix. Actual Timeline paint
regression restores the old formula and fails at midpoint x6000; fixed renderer
passes. Worker tests reproduced missing imported/channel/text selection, then
caret/disjoint/outside-release failures; corrections pass. Final review reproduced
collapsed native selection retaining stale waveform highlight; clear shared
selection when the native range collapses. Browser ArrowRight clears it and
Shift+ArrowLeft restores the correct500ms overlay. Final unchanged UI rerun passes937tests/113files/132.61s; initial full pass937/129.53s is retained.

- Full frontend:937passed,113files,132.61s (`npm test`, default2workers).
- Typecheck:pass. Production build:pass,172modules.
- Full backend:1147passed,3existing/fixture warnings,537.75s (`.venv/Scripts/python.exe -m pytest services/api/tests -q`).
- Focused API waveform:4passed.
- Focused Timeline/import/registry:51passed; channel/native Script:24passed.
- No skipped test, timeout/threshold relaxation or assertion removal in source.
  Focused `-t` repro filters are not the reported full-suite result.
- Frozen source manifest:.scratch/timing47/source-hashes.json (587inputs).
- Final diff check passes; all587frozen source inputs match. Only ScriptEditor and its registry test changed after the initial UI full pass; the final full UI rerun includes both. API inputs stayed unchanged throughout its full pass.

## Real browser and PCM evidence

A private registry/component fixture on18421 uses actual ModuleRegistry,
ScriptEditor, Timeline and ImportedMultitrackTimeline. A private Python endpoint
on18422 uses the actual AudioWaveformEnvelope adapter. No model inference.
PCM16 mono24kHz,600s, two500ms synthetic tone bursts at300s and400s; SHA256
4bceb14b3d7f85b25e5e729a17dcfcd7b7b52b7a3be4ea68566016c85b5d7cd2.
Synthetic tone timing is controlled; it is not linguistic alignment acceptance.

Actual browser before: outer Timeline1114px vs waveform/word lane1112px,
origins145px vs146px. After: all1114px, origin145px. At zoom, plain400s overlay
and subtitle both x663.96875,width75.78125; imported300s both x702,width75.734375.
Script word clicks and native keyboard text selection display correct500ms
START/DURATION/END ranges. No browser console warnings/errors observed.

Screenshots/receipts retained locally under .scratch/timing47:
selection-before-wave-fix.png, single-zoom.png, imported-zoom.png,
native-text-selection.png, final-selection.png, browser-evidence.json, drift-repro.json,
painter-red.log, web-full.log, web-full-final.log, api-full.log. Private listeners18421/18422 stopped and ports verified free; temporary browser tab closed.

## Remaining acceptance and limits

- Exact owner footage/word/time has not been identified. Do not claim its STT
  anchors are corrected; no word offset or forced-alignment change was applied.
- Coarse min/max bins cannot locate phonetic onsets inside a bucket; zoom before
  word review. Group geometry error is bounded by source peak/frame partition
  resolution, not a guarantee of millisecond linguistic accuracy.
- Browser proof is a controlled registry/component fixture, not full Hub/project
  reopening or native Ctrl-drag UAT. Ctrl-drag and cancellation/stretch behavior
  are covered by component integration tests.
- Live growing OBS timeline and cross-source bulk row-checkbox clock composition
  remain separate. Native text cannot represent disjoint selections; skip false
  contiguous mirroring. Table/Timeline can show the separate ranges.
- Shared runtimes, user media/projects, training and models were not restarted or
  modified. No new portable release, new processor completion or phase advance.
- Existing Checkpoint A, Browse native foreground and linguistic/model quality
  gates remain open. Reload/restart the source app to load new UI/backend code.
