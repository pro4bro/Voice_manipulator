# Round60 — TIMELINE-SOURCE-BOUNDARY-01

Date: 2026-10-19. Baseline: `0fe8564`.

## Owner requirement

At every zoom, a playhead dragged into the physical beginning/end of footage
must reach and retain that endpoint outside the normal 10%–90% safe window.
Keep the existing 10% viewport width/second pan while more footage remains.

## Diagnosis and changes

1. Fractional canvas width versus integer DOM scroll extents, plus strict
   floating point comparisons, incorrectly classified terminal views as interior.
   Use the same scroll extent for ordinary pan/seek, normalize physical bounds
   within one CSS pixel, and recognize mathematical endpoints with ULP tolerance.
2. Empty endpoint audio previews could call `play()`, which can restart ended
   media. Bound previews to source duration and leave empty previews paused.
3. Canvas ResizeObserver captured the time at its last zoom render. Delayed
   waveform/layout updates could repaint that old position after an otherwise
   correct release. Repaint from the latest playhead time instead.

See ADR0117. No engine/backend source, persistent project format, saved word
timing, user media or model files changed. No portable package issued.

## Failing reproductions before each fix

- `.scratch/end60/red-final.log`: 3 failed / 18 passed. Mathematical endpoint
  `100.123s` became `96.78556666666665s`; ordinary playhead and waveform endpoint
  cases lost 100 screen pixels at a fractional high zoom width. Positive/negative
  rounding fixtures span three zoom slider positions (100, 500, 1000).
- `.scratch/end60/scrub-red.log`: 1 failed / 7 passed. Exact endpoint invoked
  `play()` twice instead of leaving the media at the final sample.
- `.scratch/end60/resize-red.log`: 1 failed / 15 passed. Delayed resize repainted
  the position at zoom (1000px) instead of the released endpoint (2000px).

Early test development also corrected a duplicate clock-text query and a fixture
that changed canvas width without a corresponding zoom/measurement. Those test
setup failures are not counted as product reproductions.

## Verification

Commands run from `apps/web` unless indicated otherwise. Existing worker limits,
timeouts and assertions retained; no skipped cases or weakened gates.

| Check | Result |
| --- | --- |
| Focused ordinary/imported/OBS/drag/audio suite, `npm test -- --maxWorkers=1` with six timeline test files | **131 passed / 6 files**, 28.23s |
| Final `npm test` | **1127 passed / 136 files**, 161.28s |
| `npm run typecheck` | Pass |
| `npm run build` | Pass, 191 modules, 382ms Vite build |
| Root `.venv/Scripts/python.exe -m pytest services/api/tests -q` | **1207 passed**, 3 warnings, 642.63s |
| `git diff --check` | Pass |

Final logs: `.scratch/end60/focused-complete.log`, `frontend-complete.log`,
`typecheck-complete.log`, `build-complete.log`, `api-full.log`. Earlier frontend
runs passed 1125 tests before the audio fix (156.57s), then 1126 before the resize
fix (154.72s); neither substitutes for the final source gate. Backend code and
tests are unchanged throughout this frontend-only round. Its three warnings
remain Starlette/httpx deprecation, audioop deprecation, and an intentional
duplicate ZIP entry fixture.

Manual diff review covered the three production files and their regressions:
physical versus interior bounds, shared imported/OBS seek behavior, fractional
scroll rate, callback freshness, preview fences and cancellation. No test skips,
assertion removals, timeout changes, dependency or engine modifications.

## Browser geometry/media probe and limits

Source Timeline rendered in an isolated ignored fixture at port18443, using
synthetic 20.123s, 8kHz mono PCM16 WAV and matching PCM peaks. Its temporary media
server must support byte ranges: the initial server exposed `seekable=[0,0]`
despite full buffering, so its audio-zero observations were rejected as fixture
failures. Corrected server exposes `seekable=[0,20.123]`.

DOM pointer sequences run across animation frames with pointer capture stubbed
only in the fixture. They exercise actual browser layout, React seek handlers,
native media seeking and delayed resize/media events. They do **not** prove a
native held mouse capture/drag, nor installed portable acceptance.

| Stable case after release/resize/media updates | Source time | Canvas transform | Scroll position |
| --- | --- | --- | --- |
| Fractional width4421.5625px, end | 20.123s | 4421.56px | 3317px, at max |
| Same zoom, beginning | 0s | 0px | 0px |
| Maximum zoom, width20123px, end | 20.123s | 20123px | 19018px, at max |

Evidence: `.scratch/end60/browser-proof.json` and `end-max.png`; fixture source
under `apps/web/.scratch/end60*`. Earlier fixture-only HMR/createRoot warnings,
synthetic capture errors and rejected no-range media attempts are not clean
native-mouse acceptance evidence. User projects and the user-owned browser tab
were not altered. Dedicated test tab/server are closed after verification.

Phase03 stays60%. Existing acoustic anchor, Checkpoint A, provider quality,
device and complete dubbing/translation/live processor gates remain open.
