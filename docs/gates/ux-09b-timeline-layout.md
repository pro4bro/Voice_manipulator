# UX-09B — Timeline layout and pointer acceptance

Date: 2026-10-03. Source baseline: `3238764`.

Verdict: **controlled browser comparison passed after three repairs**.
Normal Timeline and archived OBS Layer/Column are compared at the same CSS
viewport and DPR 1. Physical Windows 125/150% DPI, six live sources and REC/PAUSE
remain in the existing UX-10B gate. This is not a new live capture or STT gate.

## Setup and boundaries

An independent registry and a complete copy of UX-08B's retained project live
under ignored `.scratch/ux-09b/`. Controller/API/Studio run on initially free
18219/18220/18281. The two actual OBS recordings from UX-08B retain their original
MKA, PCM, channel journals and analysis WAVs. No new OBS process or native PCM
capture runs. One copied analysis WAV is imported through the product API to
exercise the normal single-audio Timeline. No STT job is requested.

The IAB's initial viewport is 750×884, DPR 1. Temporary overrides compare
1280×720, 1024×576 and 853×480, also DPR 1. The latter two reduce available CSS
space to approximately the equivalent of 125/150% scaling on a 1280×720 display;
they **do not emulate Windows DPI or prove glyph rendering at those scales**.
The override is reset and the owned test tab closed at the end.

## Reproduced failures and repairs

1. **Unbounded Layer height in the stacked workspace.** Below 900px, the board
   has automatic height. Each Layer row uses 60% of the measured Timeline
   viewport height. With two rows, their content enlarges the viewport, which
   increases the measured row height again. The initial measurement reaches a
   41,512px module; retained `before-layer.json` later measures **124,012px**, with
   two 61,948px rows. Playback controls and the second track become unreachable
   through ordinary scrolling. A definite responsive module height now breaks
   that feedback. The body flexes into the height remaining below its header.
2. **Controls overlap and disappear.** A shrinking flex header lets the recording
   selector extend left across the identity, and the edit group collide with
   zoom. An old narrow-screen rule hides the fourth edit action, which is UNCUT
   in these components. Normal and OBS headers now wrap complete groups; edit
   buttons can wrap within a group, the selector can shrink within its label,
   and the obsolete hiding rule is removed. Body height follows the actual
   header rather than subtracting a fixed 39/40px.
3. **Column keyboard resize jumps.** Unconfigured columns grow to fill space
   after a sibling is resized, while their separator still reports the computed
   default. A 930px column can become 560px after one ArrowLeft, whose intended
   step is 24px. Each OBS column now has an explicit default basis and no flex
   growth. Rendered width, accessible value and keyboard starting width agree;
   neighboring columns keep independent widths. Unused space after narrowing
   columns remains empty until a column is expanded.

The existing resize regression now asserts the default basis/value and the
unmodified sibling's basis. It fails before the width repair (`''` versus
`360px`) and passes afterwards. Pointer resize, Home minimum 240px, Arrow keys
and width retention across Layer/Column remain covered. Lane labels retain the
later UX-11 size and MEDIA-VIEW-02 scrolling behavior; the older 16px memory does
not override those later decisions.

During finish review, the first repair candidate raised the normal module
minimum to 260px while its desktop board row could still be only 220px. The
normal screenshot exposes a partially clipped transport button. The board now
reserves at least 270px (262px after panel padding), and the repeated sweep
checks parent clipping and transport hit targets in addition to header geometry.
Actual Play/Pause succeeds in every final case. The intermediate screenshots are
retained as `before-transport-normal-*.png`.

## Browser evidence

At each of the four viewport sizes, select the same two-track OBS footage and
exercise both Layer and Column; then select the imported WAV and exercise the
normal Timeline. All **12 cases** have no overlapping header controls, no
controls outside the header, and no obstructed control centers when in view.
Transport buttons/selects stay within both the module and its containing panel;
Play/Pause brings below-fold controls into view in the stacked workspace.
No alert or final browser warning/error is present.

| CSS viewport | Normal module height | OBS module height | Layer rows / common playhead |
| --- | ---: | ---: | --- |
| 1280×720 | 262px | 282px | 110px each / 220px |
| 1024×576 | 262px | 282px | 110px each / 220px |
| 853×480 | 320px | 320px | 110px each / 220px |
| 750×884 | 486.19px | 486.19px | 202px each / 404px |

The common Layer playhead begins at the first row and reaches the last row's
bottom. The existing Timeline viewport scroll reveals remaining Layer content;
this is separate from the Recorder/mixer channel-list scroll requirement.

- Home sets Track 7 to an actual/reported 240px; a physical browser pointer drag
  of 96px produces 336px. The sibling's ArrowLeft changes 584→560px rather than
  jumping from an expanded flex width. Switching Layer→Column retains 336/560px.
- At 240px, a long name stays within its label viewport and enables the existing
  scrolling label. Both channel/source names remain on one line.
- Normal WAV playback advances from about 0.13s to 20.01s, readyState 4; Pause,
  Zoom and Source gain remain interactive. Gain changes to +0.5dB in the copied
  project's preview/edit state.
- OBS Zoom changes the window to 30s, Track 7 preview gain becomes 99%, and both
  audio elements advance to about 39.36/39.35s with readyState 4. This is
  synchronized archive playback, not isolated-track or live-tail acceptance.
- All six original MKA/analysis WAV hashes match the retained UX-08B backup after
  the interaction sweep. No source audio is rewritten.

Ignored evidence: `before-layer.png/json`, `obs-layout-matrix.json`,
`normal-layout-matrix.json`, twelve per-view screenshots, `resize-proof.json`,
`obs-playback.json`, `final-columns.png/json`, `final-overview.png`,
`verify-evidence.py`, `acceptance.json`, `console.json` and cleanup/runtime logs.
The verifier checks geometry, width/value agreement, playhead extent, console
and immutable media hashes; it passes.

## Verification and cleanup

- Focused OBS Timeline suite: **31 passed**, 5.58s, following the red regression.
- Full frontend: **55 files / 465 passed**, 119.38s with one worker.
- `npm run typecheck`, `npm run build`, `git diff --check`: pass.
- Backend 500 remains the carried 12L baseline; no backend/native/engine source
  changed or new backend suite run. The full-suite count stays 465 because an
  existing resize test is strengthened.
- Return to Hub, release the workspace, reset viewport and close the test tab.
  Stop only owned scratch controller/API/Studio. The first managed stop takes
  11.812s. The owned services restart for the final transport refinement; the
  final stop takes 8.625s;
  all three test ports return to free and the isolated runtime session is gone.

Remaining gap: physical Windows DPI, six or more live sources, live REC/PAUSE
and the Recorder/mixer outer-scroll interaction still need direct acceptance.
CSS-space tests do not establish OS scaling, active capture status or input
hardware behavior. Exact next existing round: **UX-10B**. Sustained live latency,
STT accuracy and the wider LIVELINK-08 matrix remain separate.
