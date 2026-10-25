# VM-SCRIPT-SCRUB-FOLLOW-01 — Script visibility during scrubbing

Date: 2026-10-25
Scope: owner feedback after VM-SCRIPT-UNIFIED-01; one bounded correction round.
Implementation: `e89a2af`.

## Feedback

> hiện tại khi drag playhead thì nó vẫn nhảy lung tung trên Script module.
> Em hãy kiểm tra kỹ lại.

The owner clarified that Input table view and both Voice Manipulation views are
affected: Script stops following or jumps. This is broader than the previously
reproduced selection-to-seek feedback in Timeline. This round tests the Script
viewport itself, not merely the playhead transform/time readout.

## Reproduction and diagnosis

1. Long edited Voice Script rows are textareas. The old layout effect sets every
   field height to `auto` and back on every render, including word-clock changes.
   An integration test drags the actual Timeline while a long edited row is
   scrolled1200px down. Six height writes occur despite unchanged content/layout.
   The test models native parent-scroll clamping during collapse; it is a JSDOM
   model, not an observation of the owner's browser.
   Red log: `.scratch/vm-script-scrub-follow-red.log`.
2. Both table/text follow paths consider an unchanged word index already handled.
   Late row measurements/wrapping/viewport geometry can move its box out of view
   after that first follow. In the cross-page regression, the word's bottom
   becomes346px in a200px viewport. Five cases fail after late layout; the sixth,
   Voice Script table with disjoint ranges, fails earlier at2620px because follow
   was disabled by the continued presence of a multiple selection.
   Red log: `.scratch/vm-script-scrub-follow-layout-red.log`.
3. Injected stale media timeupdate/seeking/seeked/durationchange events during held
   forward/reverse drags do not overwrite the requested clock in these cases.
   Existing Timeline drag ownership guards remain; no clock guard is weakened.

## Repair

- Cache textarea size inputs by element/value/width/computed font and box metrics.
  Only real content/layout changes collapse a field to measure it. Restore its
  enclosing viewport after measuring and account for border/padding correctly.
- Share layout observation between table and paint-only text follow. Observe
  the viewport/direct content; coalesce ResizeObserver notifications into one
  animation frame and reconcile the latest target, honoring manual pause.
  Keep existing word/pending-reveal guards during intermediate virtual commits.
- A new multiple selection pauses Voice Script table follow. A later Timeline
  gesture resumes it while preserving the selection; its mere presence no longer
  disables follow indefinitely. Single-source/multi-source follow ownership and
  manual wheel/typing policy remain covered by existing suites.
- Cancel queued frames and disconnect observers on binding change/unmount.
  Text highlight still never changes focus or DOM Selection.

An intermediate implementation that followed every render failed five existing
far-reveal cases with maximum update depth. That approach was removed. The final
implementation coalesces layout refreshes instead of chasing intermediate spacer
commits. No existing tests, assertions, timeout, or configuration were weakened.

## Evidence

- Focused final gate:8 files/79 tests passed,16.00s. Log:
  `.scratch/vm-script-scrub-follow-01-focused-final.log`.
- Full standard `npm test`: **172 files/1371 tests passed**,208.61s, exit0.
  Log: `.scratch/vm-script-scrub-follow-01-frontend.log`.
- Typecheck/build pass;238 modules transformed. Final build JS
  `index-CXL_0ZWo.js`, CSS `index-CvOkEaYc.css`.
- New integration coverage includes all three reported views, forward/reverse
  held drags, existing disjoint selections, delayed geometry with the same word,
  old media events, and a1400-word virtualized Input document. The latter changes
  modeled wrapping heights, keeps word1300/230/990/30/1399 visible and verifies
  that the viewport settles rather than oscillating across repeated layout ticks.
- Separate tests verify growth/shrink on content/width/font changes, viewport
  restoration, correct box sizing, one-frame coalescing, latest-target callbacks
  and pending-frame cleanup. Browser geometry is explicitly mocked in JSDOM.
- Lead review covers correctness, ownership, observer/frame lifetime, bounded
  measurement and data boundaries. `git diff --check` passes; temporary diagnostic
  test logging was removed. No backend/engine/project-format/audio change; no
  owner project or media write. Prior full API baseline1626 is carried, not rerun.

## Native acceptance and boundary

CUA inventory still returns empty apps/browsers and
`Local browser use is disabled in Work settings` before opening a tab. No native
drag, screenshot, clipboard/IME or listening success is claimed. The owner's
actual project/view must still be checked on the built app when Browser works.
Earlier native Script/frozen-subtitle UAT remains open.

This round does not assign invented timings to new text without matching audio.
Edited/untimed rows keep their existing timing-readiness rules; their viewport
must remain stable rather than collapse on playback renders. Audio endings,
newline pauses and the owner's additive30/60/90 emphasis rules remain separate
planned work. Phase03 stays60%, Phase06 open; stop after this bounded fix round.
