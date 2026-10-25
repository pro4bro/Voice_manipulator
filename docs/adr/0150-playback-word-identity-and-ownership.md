# ADR0150 — Playback word identity and Timeline ownership

Date: 2026-10-25
Status: Implemented; native browser acceptance pending
Round: VM-PLAYBACK-IDENTITY-01

## Context

The owner still observes Script jumping or stopping while scrubbing Input table
and both Voice Manipulator views after ADR0149. Geometry-only tests cannot prove
that the viewport is following the correct source word.

Four reproducible failures were found at actual component seams:

- Imported Timeline keeps its parent mounted while rendering a focused Timeline.
  The child reports its playhead to the parent. Both publish playback indexes,
  but the parent uses source intervals while the child displays editable timing
  repairs. Equal onsets reproduce two different highlighted words at one time.
- Unmounting an older Timeline unconditionally clears the global playback store,
  even after another Timeline has published its current word.
- The old greedy text mapper can attach a changed/deleted word to a later
  repeated occurrence, dropping surviving words between them.
- Voice Script gates all playback mapping on whole-row freshness. A small edit
  in a merged turn disables highlight for every surviving timed word in that row.

## Decision

All standard, imported and OBS Timelines use `activePlaybackWordAt`. Within each
source lane, a containing interval with the latest onset wins; equal onsets use
the last source index. Endpoints are start-inclusive/end-exclusive. Invalid or
zero intervals and silence have no active word. Separate simultaneously speaking
sources retain separate indexes. Subtitle painting and Script publication use
the same computed index, including forced subtitle visibility in dense views.

`usePlaybackPublisher` publishes during the subtitle layout commit. Each Timeline
has a lifetime token; only the current publisher may clear its snapshot. Imported
and OBS parents suspend publication while a focused child owns playback. The
focused child still reports its playhead for parent navigation/resume purposes.
No selection, caret or editor focus is changed by publication.

Map timed word identities to current text with monotonic token alignment instead
of forward searching repeated tokens. Preserve normalized prefix/suffix anchors;
align the remaining middle exactly with rolling LCS scores and direction bits.
The middle has a 16-million-cell work bound. Larger wholesale divergences retain
only proven prefix/suffix anchors, not guessed positions. This bound does not
change text, timestamps or source indexes. Standalone punctuation with existing
source timing is mapped too. New/replaced text without a surviving source match
does not receive invented audio timing.

Voice Script builds offset maps independently of whole-row freshness. Its normal
editor uses paint-only CSS Highlight ranges; its editable table uses spans in the
existing noninteractive text overlay. Edit pending/fixed colors and literal text
are retained. Alignment and edit-diff work are memoized outside word-clock renders.
Freshness still controls generation readiness and the existing timestamp warning.

## Consequences and validation

Regression tests compare actual subtitle and Script highlights while dragging,
including the real imported-parent/focused-child composition, overlap boundaries,
silence, retiring publishers, edited legacy turns and long distant edits. Normal
view tests inspect the actual CSS Highlight Range text. Existing virtualized
1400-word follow, stale media event and selection gates remain required.

The owner's active 2119-word output and two merged Script rows were inspected
read-only. All source words map monotonically to the current Script, including
standalone dashes. The inspected project JSON hashes remain unchanged. This is
data evidence, not native layout acceptance.

Current manifests place Script plus Timeline together on Input and Voice
Manipulator. Their variants share this path. Voice Changer and LipSync currently
have no Script module; no new playback system is added to those pages.

No backend, engine, audio, persisted project format, source timing or source media
change. Browser inventory still returns `Local browser use is disabled in Work
settings` before any tab opens. Native project drag/scroll acceptance remains open;
see the round gate for commands and results.
