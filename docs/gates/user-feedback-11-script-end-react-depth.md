# USER-FEEDBACK-11 — Script end React185

2026-10-09. Baseline `38c3e37`, branch `feat/03-04-high-quality-training`.
One bounded feedback round. Product commit `9c6c696`; design ADR0058.

## Owner evidence and scope

Owner reports that jitter has stopped, wheel scrolling no longer runs by itself,
and the scrollbar is present. In test OBS9, scrolling to the end now displays
"Không hiển thị được script" with "Minified React error #185". Screenshot retained
at `.scratch/user-feedback-11/owner-script-end.png`. This round repairs the shared
Script update cycle, preserving the accepted scroll/presentation behavior.

## Reproduction / minimization

The actual archived route is ChannelScript with row assignment controls. Read-only
artifact inspection:1,136 words,10 rows, counts `[31,3,3,833,12,49,17,40,7,141]`.
Final Channel1 row has141 words, indexes953–1093, fragments64/64/13, last word
"họa". The earlier833-word turn has a one-word last fragment.

Direct End and single-long-row fixtures initially passed. A17px wheel sweep with
measured row/fragment heights and a dynamic browser-like scroll clamp reproduces
maximum-update-depth. Trace shows row minimum/chrome alternates21/93px, the
correction alternates+72/-72px and first-window indices alternate15/16.

Minimized shared-hook fixture has65+600 words (one-word continuation; enough to
enable virtualization),140px viewport,100px sidebar minimum and measured28px
text lines. Baseline fails with the exact exception in174ms. The independently
confirmed ChannelScript caller fixture retains the real two-track/ten-row shape,
assignment controls and actual word buttons. It warms preceding measurements,
lands at the load-bearing2,057px fixture boundary, then goes to End. Baseline
fails with the same exception (secondary stack in ScriptScrollbar.setGeometry).
The fixed caller passes; final word and clamped end remain reachable.

## Root fix and rejected candidate

Previously measurement updates published new prefix offsets while viewport state
still held the previous position. That transient render mounted another window,
whose short-tail row had a different sidebar minimum. It fed back into another
measurement/correction before stabilization and reached React's nesting limit.

The fix enqueues corrected viewport and measurements together. DOM scrollTop is
still written after commit; its actual clamped readback and bubbling scroll event
synchronize the virtualizer and shared scrollbar. No bounds, spacing or UI layout
change, and no swallowed React exception.

A separate window-local chrome candidate was tested but rejected after review:
subtracting all sidebar excess from the top spacer could shift continuation text.
The final source contains only the atomic correction change, with no such cache
or debug instrumentation. Independent final review found no concrete regression
in clamp/readback, inset handling or observer cleanup.

## Verification

- Baseline differential logs: `hook-red-minimized.log`,
  `caller-red-minimized.log`; baseline files restored in a finally block.
- Focused actual/shared callers: **20 passed /4 files**,7.23s.
- Full frontend `npm test -- --maxWorkers=2`: **659 passed /75 files**,88.66s.
- `npm run typecheck`: pass. `npm run build`: pass,125 modules; final
  `index-DYlpXzWZ.js`, existing stylesheet/deletion Worker retained.
- `git diff --check`: pass; no `[DEBUG-UF11]` remains under product source.
- Bundled Node24.19 used via process-local PATH. Full original17px caller sweep
  took~13s and exceeded the unchanged5s test timeout; the load-bearing boundary
  was minimized instead of relaxing the timeout. A coarser83px sweep skipped the
  bug and was rejected as a regression signal.
- Initial differential wrapper hit Python cp1252 when printing Unicode output;
  the captured red log was already saved and the finally block restored source.
  Subsequent wrappers print ASCII verdicts and retain UTF-8 logs.
- Backend source unchanged; full API687/two existing warnings is carried08
  evidence, not a rerun. No services, OBS, inference, owner transcripts/media,
  schema or upstream changes. All logs/candidates remain clearly under scratch.

## Remaining gap / exact next

**UX-SCRIPT-END-DEVICE-01**: reload the normal app, open test OBS9 and wheel down
through its last turns, to the final word, then back up; repeat and confirm no
error boundary or revived jitter. Try the same boundary in table/prose/channel
views where available. This native check matters because geometry mocks do not
establish the owner's actual pixel layout and wheel behavior. Prior browser
restrictions remain; no browser/CDP/Playwright workaround was attempted.

Exact next executable **STT-GAP-01** retains isolated recognizer/merge artifacts
to attribute missing OBS words before replacing owner text. Startup/device/LAN,
word-truth and Phase03 quality/budget gates remain. Phase03 stays60%.
