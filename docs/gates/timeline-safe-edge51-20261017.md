# Round51 — stable safe-edge playhead drag and release

Date: 2026-10-17. Owner feedback on Timeline edge drag. ADR0108.

## Reproduction and change

Before the fix, two ordinary Timeline gesture regressions failed: the playhead
followed the pointer beyond the existing 10%/90% safe boundaries while dragging.
After release, playback following repositioned the viewport. In the right-edge
fixture, the transform was1750px instead of the expected1400px safe-edge target.
RED run:2failed/7passed,3.78s (`.scratch/timeline51/safe-edge-red.log`).

Shared dragSeekTime now constrains viewport scrubs at10%/90% while that side can
pan. Pointer direction still controls scrolling at10% viewport width/s; existing
fractional accumulation is preserved. Apply the same target on down/move/frame/up
across ordinary, imported multitrack and archived OBS timelines. One-screen-pixel
tolerance in ordinary playback following avoids rounding-driven post-release
recenter. At physical source limits, full-width seek reaches the first/last sample.

OBS releases its target before stopping the shared drag, and suppresses the next
click if the drag panned or was edge-constrained. This covers a stationary held
pointer as well as a moved pointer. Full-duration transport retains direct seek;
live OBS behavior, audio preview and media/source timing are unchanged.

## Regression evidence

- Focused four-file Timeline/helper/imported/OBS run:100tests pass,12.05s.
- Additional left-edge release assertions in both virtual timelines:86tests in
  2files pass,11.77s. Both left/right cases preserve ruler/target after release;
  ordinary cases also emit media timeupdate/seeked, OBS emits a final click.
- Pure helper test covers left/right clamps, center, pan, physical source limits
  and full-source fit. Existing800px/60frame test retains80px/s scroll acceptance.
- Old right-edge expectations95% were deliberately changed to90% to implement
  this owner request (ordinary950px→900px relative; imported46.5s→45s; OBS63s→60s).
  Initial focused runs retained the old assertions and failed before updating
  these contracts. No test skip, timeout increase or weakened numeric tolerance.
- Full frontend:1013passed/125files/147.12s. Typecheck and build182modules pass.
- Full API:1149passed/530.32s,3existing/fixture warnings (Starlette/httpx,
  audioop deprecation, duplicate ZIP fixture entry). No backend source edits.
- All603API/web input hashes match the frozen pre-frontend snapshot at completion;
  backend inputs also remain unchanged from the clean starting commit. Diff check
  passes. Logs and manifest are retained locally under `.scratch/timeline51/`.

## Diff review

Reviewed production handlers and regression assertions for correctness, clarity,
module boundaries, security and performance. The shared helper owns all three
viewport contracts; integrations retain their existing audio scrub path. There
are no new dependencies, persistent fields or I/O surfaces. No extra animation
loop or per-word work is introduced; the existing loop is cancelled on release.
Follow tolerance is screen-based and limited to one pixel. No blocking finding
remains from this review; real mouse acceptance is separately limited below.

## Browser limit and remaining work

CUA inventory in this turn returned no browsers and explicitly reported local
browser use disabled in Work settings. No real mouse/paint acceptance is claimed
for round51 and no shared app/runtime was restarted. Regression tests exercise
actual React handlers and simulated RAF/media events; user mouse UAT remains.

No source media, model, saved word timestamps or backend source edits. Phase03
remains60%. Independent STT acoustic anchors, Checkpoint A and13downstream
processor gates remain open. This round stops after this bounded feedback fix.
