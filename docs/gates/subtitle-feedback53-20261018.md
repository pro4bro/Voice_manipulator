# Round53 — subtitle selection, insertion color and middle timing scroll

Date:2026-10-18. Owner feedback. ADR0110. One bounded stabilization round.

## RED evidence and fixes

`npm --prefix apps/web test -- src/modules/timeline/SubtitleFeedback.test.tsx`:
4failed/2.65s. Dragged word reaches25–26s but explicit highlight stays20–21s;
inserted word lacks speaker identity; left/right middle assignment jumps scrollLeft
from500px to150px/1000px immediately. Local log:`.scratch/timing53/red.log`.

- Retime explicit selection from draft word anchors for waveform/readout/markers
  and stretch handles; commit together and restore on cancellation. Pure checks
  preserve source scope, disjoint selections and silence padding, scale partial
  word ranges and clamp source boundaries. Initial exact float fixture1.3 versus
  1.2999999999999998 uses9decimal numeric comparison; no product rounding added.
- Nearest insertion context retains row identity and explicit unassignment; old
  word objects stay intact. An additional RED default-footage-speaker case rendered
  the plain surface instead of the profile color (1failed/2.28s). Supply the same
  default profile mapping that Script uses in ordinary/imported/OBS editors.
- Manual subtitle boxes use profile fill and blue classification text. Resolve
  against the actual normal/selected/active/collision background. An actual-CSS
  matrix initially caught2failures with a blue profile background on selection;
  foreground was calculated for a different background. Rendering the exact pair
  resolves the mismatch. Final CSS tests cover2themes,3profile fills including
  alpha and3plain/selected/active states at>=4.5:1. The amber warning border remains.
- Middle assignment joins the existing elapsed-time scroll hook and safe target
  calculation; no separate speed constant or loop. Both directions at2zoom levels
  move100px/s for a1000px viewport, hold10%/90% and keep viewport/target on release.
  Pointer cancellation, Escape and blur discard the draft and stop pending RAFs.

## Integration and review

Focused GREEN before final default-profile wiring:38tests/5files/7.05s. Shared
imported/OBS/timing integration:96tests/3files/12.02s. A broad run caught existing
OBS reset-count assertion3calls versus4; focused RED reproduces it in4.07s.
Remove the duplicate source-reset emission, leaving the existing assertion intact.
The first broad attempt was cancelled for a test-only callback typing error
(TS2348, corrected to a typed function); the next was cancelled after the OBS
reset failure. Both logs remain. Final full run uses freshly frozen inputs.
No declared skip, deadline change or weakened acceptance threshold.

## Final regression evidence

- Frontend:1034passed/126files/145.65s, no skipped cases. Typecheck passes;
  production build passes with182modules. Final default-profile case is included.
- API:1149passed/526.89s,3existing/fixture warnings (Starlette/httpx, audioop,
  duplicate ZIP fixture entry). Backend sources remain identical to starting HEAD.
- All606API/web source/config hashes match the frozen final pre-frontend snapshot,
  including JSX stylesheet tests. Diff check passes. No source edits occurred
  during the final frontend run; later edits only record final documentation.
- No debug probes remain in product/test source. No engine/model or source-media
  processing was needed for these interaction and rendering changes.

Review covers correctness, clarity, architecture, security and performance.
Shared selection/domain helpers own their transformations; all source editors use
the same Timeline. Profile/state contrast pairs are cached, not recomputed per
word per frame. No new dependency, network or storage surface. Existing media,
timing collision, provenance and no-snap contracts remain. No blocking finding
remains after fixing duplicate reset and default mapping.

## Acceptance limits

CUA inventory this turn explicitly reports local browser use disabled in Work
settings. React/RAF tests and actual CSS cascade checks are evidence for their
respective contracts; no real mouse or raster paint acceptance is claimed. Shared
app/runtime was not restarted. Logs/manifest retained in `.scratch/timing53/`.

No backend/model/source-media/project-format changes. This round does not establish
STT acoustic accuracy. Phase03 remains60%; round48 acoustic anchors, Checkpoint A
and13downstream processor gates stay open. Stop after round53.
