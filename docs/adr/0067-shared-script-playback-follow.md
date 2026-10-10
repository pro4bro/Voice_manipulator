# ADR0067 — source-independent Script playback following

2026-10-10. Accepted for USER-FEEDBACK-22. Extends ADR0065 and ADR0066.

## Context

ChannelScript observed per-track playback to highlight words, but had no
viewport-follow policy. Ordinary ScriptTable had its own follow effect. Its
virtual reveal and seek-resume paths could also wait for another word change.
The difference was caused by renderer ownership, not by OBS recognition data.

## Decision

Stored transcripts share `useScriptPlaybackVisibility` and
`useScriptPlaybackFollow`, regardless of recording/import provenance. Ordinary
footage, imported tracks and OBS archived tracks publish source ID/word index
through the playback store. A parent subscribes to all of its displayed source
documents; it does not subscribe to the archive ID or flatten their clocks.

- The viewport follows a changed active word during playback or paused seeking.
- Virtual reveal addresses the source and word together. Mounting an offscreen
  fragment is followed by positioning its word on the next commit.
- Wheel, touch, scrollbar manipulation and reading keys pause automatic
  following. A deliberate seek or Timeline scrub resumes it, even within the
  same word. Interaction notification is separate from audio seek requests.
- Simultaneously speaking tracks keep their highlights. Scroll focus stays
  with its current source until silence, unless an explicit word seek chooses
  another source. Rendering order must not make tracks fight over the viewport.
- Follow changes only the Script viewport. It does not scroll the workspace,
  select a different footage, rewrite timestamps, or change source audio.
- Multitrack plain text uses the same source-aware follow policy and a native
  textarea overlay for the active word. The overlay contains only two text
  runs and one active span, including for large transcripts. Focusing the
  editor removes tracking presentation and preserves native text selection.
- Generated VoiceScript tables reuse the visibility policy. Source ingestion
  adapters may differ in audio acquisition; they do not own transcript-follow
  policy. Pending live recognition has no finalized per-word document yet and
  remains provisional until archived assets exist.

The shared registry continues to own commands described in ADR0066, with
source-owned edits and undo history. Existing grouping, measured virtualization,
shared styles/column preferences, zoom/density and clock adapters remain in use.

## Verification

`script-playback-parity.test.tsx` renders the real ModuleRegistry for ordinary
file, imported parent/child and archived OBS parent/child. It covers paused
follow, manual reading, same-word resume, distant virtual words, source identity,
simultaneous speech, plain text, native editing and releasing playback ownership.
Timeline component tests drag the actual waveform handlers into Script for
ordinary, imported and archived OBS views. Existing scrolling/editing tests and
real stylesheet tests remain active. Gate evidence and native-device limits:
`docs/gates/user-feedback-22-script-playback-parity.md`.
