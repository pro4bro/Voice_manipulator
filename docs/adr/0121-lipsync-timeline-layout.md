# ADR 0121 — LipSync Timeline alignment layout

Date: 2026-10-21
Status: Accepted for round 64 UI alignment slice

## Context

Round 63 gave LipSync an Input-shaped page but rendered a small, bespoke
two-track ruler in the bottom row. The left source selector and center preview
also did not occupy the Input modules' full height. The user asked for Input's
column/module proportions, Preview Video in place of Script, and the existing
Timeline appearance with independent video and generated-voice adjustment.

## Decision

- Use the same `studio-board` row sizing as Input and the shared `library-panel`
  tab/header treatment on the left. The center Preview Video fills the Script
  module's footprint. The right timing controls remain project-specific.
- The bottom renders the exported `Timeline` module in an alignment mode. This
  mode uses the Timeline frame, ruler, zoom, navigator, transport and playhead
  treatment. Video and Voice Output have separate lanes on one clock. The voice
  lane reads the existing Voice Output waveform endpoint.
- Dragging a clip moves its timeline start. Its left and right handles trim
  source IN and OUT non-destructively; the same values have numeric controls
  and 50 ms keyboard nudges. This changes placement and source selection, not
  the source media or playback rate. The Input audio editing tools for gain,
  subtitle words and destructive cuts are not shown in this alignment mode.
- The preview owns one clock and mutes original video audio. Source video and
  Voice Output follow that clock through independent placement maps. The
  current alignment remains a session draft as in ADR 0120.

## Consequences

The page matches Input's regions while the Timeline can carry media-specific
lanes without changing ordinary Input editing behavior. Generate LipSync,
After and optional face replacement remain gated on approved persistent timing,
a real adapter, a durable job and output QC. Engine candidates are screened in
`docs/research/lipsync-engines-2026-10-21.md`; no processor is selected by this
UI round. Real media decoding, clip synchronization and quality require a
separate acceptance gate with project footage and generated voice.
