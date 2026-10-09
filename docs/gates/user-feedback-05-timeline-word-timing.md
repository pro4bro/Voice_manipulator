# USER-FEEDBACK-05 — Timeline word identity and timing edits

2026-10-09. Baseline b61f99c, branch `feat/03-04-high-quality-training`.
The owner's three screenshots and latest request define this bounded round.

## Delivered

- Timeline text/timing/attribution edits use the existing shared30-step session
  undo/redo. Ordinary, imported multitrack and archived OBS timelines route the
  shortcuts in both overview and focused editors. Pending inline text commits
  first; history navigation cancels a live timing gesture so releasing it cannot
  overwrite restored history. Gain/numeric inputs retain native undo behavior.
- Every rendered subtitle box represents one original word. Spatial filtering
  preserves at least4px of visible stripe without overlapping screen rectangles;
  zoom restores omitted words and then labels. Direct stripe gestures address
  that displayed word, while blank-lane gestures resolve the full source array.
  Compact grips are hidden until zoom supplies enough room for separate handles.
  Display width does not stretch the source timestamp.
- Promoted middle-button IN/OUT assignment is atomic. The former intermediate
  move could trim a neighbour even when the final interval did not touch it.
  Actual collisions alone trim neighbouring boundaries, retaining at least10%
  of each neighbour's pre-gesture duration. Noncontiguous selections respect
  their internal unselected neighbours; tiny words retain positive intervals.
- Touching/encroached neighbours blink during the drag; reduced motion gives a
  static outline. The promotion instruction appears above its word after2s of
  hovering, in a fixed portal tooltip. It adds no row beside the waveform.
- Unsafe zero-duration, malformed and overlapping editable intervals receive
  positive, monotonic estimates with original `sourceTiming` and explicit
  `timingTrusted:false`. Valid source words and silence retain their intervals.
  Text replacement/insertion receives positive provisional timing. Audio time0
  remains a legitimate onset; zero duration is disallowed.
- Studio phrase-edge refinement is fenced against original neighbouring words
  and an already-refined previous end. Separate phrases cannot claim the same
  gap or cross an unrelated word. The recognizer/model preset is unchanged.

## Diagnosis and regression evidence

New timing cases reproduced the two-stage neighbour mutation, an unchecked word
inside a noncontiguous selection being overlapped, and a fixed20ms floor inverting
a tiny interval. New Studio cases reproduced cross-phrase overlap and two adjacent
refinements claiming the same gap. They pass with the fixes.

The first full frontend run had618 passing and5 failing tests, all old assertions
requiring replacement timing `{start:0,end:0}`. A second run during integration
had622 passing and4 failing tests: transition fixtures lacked editing callbacks,
and old checks expected the removed flow instruction. Positive-estimate assertions
now verify unchanged neighbouring timing, attribution and explicit lack of trust.
Routing regressions keep the same mounted overview/editor/overview instance.

Final verification:

| Command | Result |
| --- | --- |
| `npm test -- --maxWorkers=4` in `apps/web` | **627 passed /71 files**,43.72s |
| `npm run typecheck` | Pass |
| `npm run build` | Pass;119 modules; JS770.81kB/gzip223.34kB; CSS249.65kB/gzip38.64kB |
| `.venv/Scripts/python.exe -m pytest services/api/tests -q` | **679 passed**,194.93s;2 existing warnings |
| Focused API timestamp adapter + STT Studio tests | **30 passed**,1.33s;2 existing warnings |
| Worker final four Timeline suites | **70 passed** |
| `git diff --check` | Pass; ordinary Windows LF/CRLF notices only |

The frontend count includes the existing ignored
`.scratch/footage-switch.performance.test.tsx`; tracked suite is626/70. API warnings
are the existing Starlette/httpx and audioop deprecations. Capped test concurrency
does not change production scheduling. Earlier full API678 passed before the final
adjacent-gap regression was added.

## Limits and owner acceptance

History here covers committed Script word/text/attribution edits from Timeline;
audio gain, cut/mark, processing and media lifecycle are not new history commands.
Screen-density and structural timing repairs do not prove acoustic accuracy.
Estimated timings still require review under existing export/training rules.

The existing browser tool approval rejection remains; no alternative browser/CDP
or shell automation was used. No normal services were restarted, models dispatched,
upstream engines modified, owner media rewritten or project schema migrated.
Real visual and audible acceptance remains open under UX-EDITING-DEVICE-01.

After refreshing the UI, check:

1. Ordinary, imported-track and archived OBS word edits undo/redo from Timeline;
   undo during an unfinished drag does not reapply that drag on release.
2. At full zoom-out, individual stripes remain visible. Zoom reveals individual
   words, with no multiword summaries or overlapping visible boxes.
3. Assign a middle-button interval in free space: untouched neighbours keep their
   timing. Drag into a neighbour: it warns and retains10% even after an excessive
   pointer movement. Check audible scrubbing on the actual device.
4. Hover the promoted word for2s: instructions float above it; waveform height
   stays constant. Check repaired legacy intervals remain visibly estimated.

Restart the app/Studio only after current processing finishes to load the backend
phrase-refinement fix. It affects subsequent STT; this round does not rewrite
previous persisted transcripts.

Exact next round: **STT-TIMING-ACCURACY-01**, as scoped in
`docs/STT-TIMING-ACCURACY-PLAN.md`. It needs reviewed word IN/OUT truth and an
isolated model comparison; the earlier250h candidate improved median but worsened
mean/tail proxy error. Existing R5/R6 gates are retained. ADR0052 records the
contracts. Older physical/quality/download/LAN prerequisites remain and Phase03
stays60%; the proposed unified Queue is unchanged.
