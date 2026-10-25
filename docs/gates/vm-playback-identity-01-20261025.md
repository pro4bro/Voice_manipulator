# VM-PLAYBACK-IDENTITY-01 — Subtitle and Script follow the same source word

Date: 2026-10-25
Implementation: `232a05c`
Scope: one correction round after the owner's repeated cross-page scrub feedback.

## Reproduction before repair

`npx vitest run src/modules/script/ScriptPlaybackIdentity.test.tsx` initially
failed all four cases. Removing an older actual Timeline cleared Input highlight
after the current Timeline had already highlighted word2. For source
`xin bạn đi xin về`, editing the first word to `chào` made the old mapper return
only source0→later `xin` and source4→`về`, dropping the intervening words. Both
Voice Script views failed to highlight surviving words in an edited legacy turn.

`npx vitest run src/modules/timeline/ImportedMultitrackTimeline.test.tsx -t
'lets only the focused'` then failed at the real parent/child seam: source words
one/two share onset1/end4; the focused Timeline repairs their display intervals.
Dragging to1.2s highlights source0 in the subtitle but the parent republishes
source1 to Script. The child reports its cursor to the parent through the actual
resume callback. Suspending the parent's publisher removes this conflict.

A further1200-word case caught loss of the middle between distant edits with a
small alignment bound. Exact rolling-score/direction-bit alignment fixes it;
normal-view tests assert the actual CSS Highlight Range text, not merely a row
class. No old assertions, timeout, test configuration or gates were weakened.

## Repair and review

- Standard/imported/OBS Timelines share one active-word lookup. Subtitle paint
  and Script publication use the same source index. Overlaps have one winner per
  source; simultaneous sources remain separate; silence clears both highlights.
- A publisher lifetime token prevents an old Timeline from clearing its
  successor. Imported and OBS parents suspend while focused editing is active.
  Publication occurs in the layout commit, preserving existing scrub/media guards.
- Monotonic text alignment prevents jumping to a later repeated occurrence.
  Standalone timed punctuation is retained. Whole-row freshness no longer hides
  surviving word clocks after a small edit. Untimed changes receive no invented
  source clock. Exact middle alignment is bounded at16 million cells; larger
  wholesale divergence retains proven prefix/suffix anchors only.
- Editable table overlays combine edit and playback boundaries without modifying
  literal text, caret, selection or pending/fixed states. Normal view keeps its
  paint-only CSS Highlight path. Alignment/diff work is memoized outside clock
  renders. Existing scroll geometry/manual reading policy remains in place.
- Lead review checked ownership cleanup, focused-parent handoff, source index
  preservation, half-open interval boundaries, edited text mapping, overlay text
  preservation, and source/media boundaries. `git diff --check` passes.

## Validation

- Full standard `npm test`: **174 files /1380 tests passed**,202.61s, exit0.
  `.scratch/vm-playback-identity-01-frontend.log`.
- Final focused gate: **4 files /117 tests passed**,43.96s, exit0. Covers playback
  store, Script identity, imported Timeline and OBS Timeline after final cleanup.
  `.scratch/vm-playback-identity-01-focused.log`.
- Existing full-suite gates include1400-word virtual Input, forward/reverse
  scrubs, stale media events, disjoint selection and late layout measurements.
- `npm run typecheck` and `npm run build`: pass;239 modules. Build assets:
  `index-BeQ6RswV.js`, `index-CJncqiqd.css`.
- No backend/engine/project-format/audio change. Previous full API1626 baseline
  is carried, not rerun for this frontend correction.
- Read-only real-project probe: active output has2119 words/120 original segments;
  merged rows map1158/1158 and961/961 source words monotonically, including timed
  dashes. Mapping took24.47ms/15.40ms in this one local probe (not a performance
  threshold). `.scratch/probe-playback-identity.ts` and its JSON retain evidence.
  SHA256 of inspected Script, sessions and active output metadata unchanged:
  `5dc4a437902c133b312e7790f16db86f10b960ac1402d299b941a8afab6b9840`,
  `746e38f4b8275583e63604949c4ac472212f53072d831fa78301eb0cbd2dbe25`,
  `61b7e4acedccd0c2e923d76483092df3f36716010bef323ad70e83d058a7e03c`.

An early6-file focused run had one5s timeout in the existing virtual Input case
under concurrent load. It passed alone without changing its timeout, and the
standard full suite subsequently passed all1380 tests. This is retained here
rather than reported as an uninterrupted all-green run.

## Acceptance still open

CUA inventory again returns no apps/browsers and `Local browser use is disabled
in Work settings` before any tab opens. No native browser drag, screenshot,
clipboard/IME, frozen-subtitle or listening acceptance is claimed. The full
suite models geometry; the read-only data probe does not replace native UAT.

When browser access works, check Input table/normal, imported all-track/focused
handoff, and Voice Manipulator table/normal on the owner's long merged project:
drag forward/reverse across short words, line boundaries, gaps and edits; confirm
subtitle and Script highlight the same timed word and the viewport settles.

ADR0150 records the contract. Phase03 remains60%, Phase06 open. Audio endings,
newline pauses and additive30% per uppercase/bold/underline remain planned
separately. Stop after this bounded correction round.
