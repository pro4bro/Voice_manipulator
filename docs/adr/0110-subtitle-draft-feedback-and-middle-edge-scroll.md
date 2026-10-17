# 0110 — Subtitle draft feedback, insertion identity and middle edge scrolling

Accepted2026-10-18, stabilization round53. Extends ADR0108/0109.

## Selection follows timing edits

An explicit production selection stores source intervals. productionRanges
correctly preserved those intervals, but consequently ignored the dragged word's
draft timing. Derive displaySelection from the original words and current draft:
move the range edges with their selected word anchors, scale partial-word edges
through trims, preserve surrounding silence padding, and clamp to source bounds.
Keep pure-silence ranges unchanged, disjoint ranges separate, and all identity,
scope and index fields intact. Waveform overlay, numeric readout, stretch handles
and scroll markers use the same derived selection. Commit its timing with the
word edit; cancellation restores the original selection without saving a draft.

## New subtitle identity and readable classification

Boundary insertion inherits only row identity fields (speakerId, diarization and
manual diarization IDs, segmentIndex) from its nearest temporal neighbour. A tie
uses the preceding word; a document boundary uses the available neighbour. Keep
explicit null, preserve old word objects/timestamps and do not copy acoustic trust.
The existing replacement path retains its own source-row metadata.

Timeline also receives defaultSpeakerId from the footage/track, as Script does.
An unnamed word can inherit that default; explicit null or a diarization row does
not silently adopt it. Wire ordinary registry, imported and archived OBS editors.
The default remains inherited rather than being persisted as a manual override.

Manual words use the Script manual classification hue#1a5fa7 as preferred text.
Their ordinary box fill is the Speaker Profile color, composited to an opaque
background on the actual theme surface. Unassigned words use that surface.
Keep the untrusted timing outline/border; the requested speaker fill replaces the
estimated-word amber fill for manual text. Selection/active/collision retain their
semantic backgrounds. Resolve the blue foreground against each exact background
at>=4.5:1, and render both members of the resolved pair. Cache pairs per profile,
theme and state instead of resolving contrast for every word on every drag frame.
Compact overview stripes remain glyph-free; saved user colors do not change.

## One edge scrolling rule for middle IN/OUT assignment

Middle waveform assignment updated currentTime without joining the shared drag
scroll loop, so playback follow jumped the viewport once the target crossed its
safe window. It now uses the same dragSeekTime and useDragAutoScroll as normal
seeking:10%/90% safe edges, raw pointer direction and10% viewport width per second
at every zoom, with fractional accumulation and source-end access. Playback follow
is suspended while assignment is held. Preview/commit use the last constrained
target, including stationary RAF scrolling and pointer release; no raw-pointer
recalculation can jump the target afterward. Stop on release, cancel, Escape,
blur, source change and unmount. Audio preview and next-word advance remain.

Source-change cancellation owns a single promotion reset. Existing OBS regression
caught a duplicated reset when cleanup was first integrated; remove the redundant
call while preserving the original exact event-count assertion.

## Boundaries

See docs/gates/subtitle-feedback53-20261018.md for RED/GREEN and final regression
evidence. No backend, model, source media or persistent format changes. No saved
word shifts outside explicit user edit commits. Real mouse/paint acceptance is
blocked by local browser use disabled in Work settings. Phase03 stays60%; acoustic
anchors, Checkpoint A and13downstream processor gates remain open.
