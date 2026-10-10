# ADR0052 — individual subtitle density and local timing edits

2026-10-09. Accepted for USER-FEEDBACK-05; supersedes ADR0051's multiword overview
snippet presentation only. Its logical Script rows and30-step session history
remain in force.

## Decision

- Every rendered subtitle box identifies exactly one source word. Overview views
  spatially filter words with a minimum4px stripe, without overlapping visible
  rectangles. Zoom restores omitted words and then their individual labels.
  Source timing/index identity is separate from minimum screen geometry. Direct
  stripe gestures use the displayed index; blank-lane gestures resolve all words.
- Timeline routes text/timing/attribution undo/redo to the existing shared Script
  history. Ordinary, imported and archived OBS parents and their focused word
  editors receive the same callbacks. Inline text commits before history moves;
  numeric gain and other ordinary inputs retain their native keyboard behavior.
- Promoted IN/OUT assignment is atomic. No intermediate move may trim another
  word. Only actual overlap yields a neighbour boundary, preserving at least10%
  of its pre-gesture duration. Direct edge/move editing uses the same reservation,
  including noncontiguous selections. Sub-millisecond intervals must not collapse
  through rounding or a fixed20ms neighbour floor.
- During drag, touching neighbours receive a blinking inset warning. Motion
  reduction retains a static warning. The promotion instruction is a fixed portal
  tooltip after2s hovering the promoted word; it occupies no waveform layout row.
- Invalid supplied editable intervals receive positive, monotonic provisional
  estimates. Source intervals are retained in the existing `sourceTiming` word
  metadata, and estimates remain `timingTrusted:false`. Valid words and real
  silence are preserved; time0 is a legitimate audio onset, zero duration is not.
  New text also receives positive provisional spans, including endpoint edits.
- Acoustic phrase refinement cannot cross original neighbouring words or a
  neighbour's already-refined end. It cannot make an unrelated word yield.

## Limits

Screen decimation does not claim acoustic accuracy. Structural estimates require
review and are excluded from trusted export/training under existing policy.
The history remains session-only, max30, and covers Script word/text/attribution
edits; processing, media lifecycle, audio gain and footage cut commands are not
new history commands in this round. There is no manifest migration or audio
mutation. A new aligner requires the measured gate in
`docs/STT-TIMING-ACCURACY-PLAN.md`; R5/R6 acceptance is not overridden.

## Rendering correction — 2026-10-10, USER-FEEDBACK-17

Readable intervals that touch at one source timestamp must both survive density
filtering when the active word changes. Screen arithmetic tolerates rounding
at 1e-6 pixel precision; compact 4px stripes retain strict occupancy. This does
not change source timestamps or editing collision reservations. Trim grips are
external overlays on the timestamped box, with text clipped separately inside
the box. Grips sit above the label row so adjoining glyphs are clear. Their width
reserves no time or layout space for neighbouring words.

## Subtitle insertion — 2026-10-10, USER-FEEDBACK-18

Add text retains the clicked source time independently of selected word indexes.
A double-click inside an occupied source interval still edits that word even
when density filtering hid its box; a genuine gap opens phrase insertion.
Ordinary, imported multitrack and stopped OBS lanes delegate to the same editor.

Bounded insertion uses an exact word-array splice and the existing transcript
boundary mapper. It equally allocates provisional positive intervals with small
spacing inside the gap/audio bounds. It must not normalize, borrow from or
realign untouched word anchors. If no gap exists it leaves the transcript intact
and requests timing adjustment through an inline alert. These estimates retain
untrusted/manual metadata and require audio review; they are not STT accuracy
truth. No persistent-format migration or new processing success state is added.
