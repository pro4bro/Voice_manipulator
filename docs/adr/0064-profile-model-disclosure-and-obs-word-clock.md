# ADR0064 — profile disclosure and archived OBS word clock

2026-10-10. Accepted for USER-FEEDBACK-16.

## Context

Speaker Profile identifies a person; its ProjectVoice records are trained model
artifacts. Always-visible model slots looked like peers of their owning profile.
Archived OBS Timeline displayed detailed words but did not publish their playback
indexes or subscribe to ChannelScript seeks through the common playback store.
Single-track Script uses the workspace WordSelection instead of ChannelScript's
seek request. The OBS implementation did not consume that selection either.

## Decision

Each Speaker Profile has an accessible, independent model disclosure, collapsed
initially. Children remain inside its indented slot; their model selection and
existing context/Collection actions remain available after expansion. Expansion
is transient UI state, not part of the portable project format.

Archived OBS uses the existing playback-sync contract keyed by asset ID. Publish
one active source-word index per channel only within its actual IN/OUT interval;
silence and provisional live capture publish no detailed active word. Accept seek
requests only for this recording's imported lanes. Route subtitle clicks, Script
seeks and shared single-track selection through one bounded audio/playhead seek.
Selection changes seek once; refreshed word arrays never rewind playback.

When a standard Timeline owns a focused word editor, its word publisher owns the
clock. The archived parent does not overwrite it on polling/asset refresh. The
focused child receives workspace selection for an explicitly selected track, or
local selection when the multitrack parent selection is ambiguous. Reset local
selection on opening another editor. No shared global word indexes are assigned
to the wrong channel.

## Evidence and limits

Real ModuleRegistry caller regressions cover ChannelScript and single-track
ScriptEditor with OBS Timeline, simultaneous channel words, subtitle/audio seek,
silence, unrelated seeks, refreshed assets and focused editor selection. Saved
OBS9 metadata confirms the two source stem/asset/parent identities and sorted
word arrays. Gate: `docs/gates/user-feedback-16-profile-obs-sync.md`.

No STT inference, source audio, transcript or persistent schema changes occur in
this round. Native visual/audio acceptance and STT-GAP-02 recognition review
remain required; repaired interaction does not prove word timing accuracy.
