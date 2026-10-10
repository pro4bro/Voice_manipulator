# ADR0065 — one transcript presentation for every source

2026-10-10. Accepted for USER-FEEDBACK-19.

Update: ADR0066 supersedes the archived-aggregate command restriction below.
The shared presentation contract remains in effect.

## Context

Ordinary footage used ScriptTable, imported/archived channels used ChannelScript
cards, and pending OBS used a separate live list. Their headers, text sizing,
speaker controls, timing labels and scrolling chrome differed. VoiceScript
also maintained its own column geometry and row selection placement. Ordinary
column preferences were keyed by footage ID, so switching projects could change
the layout even within the same renderer.

## Decision

Use the Conviction table as the transcript presentation contract: SPEAKER,
NỘI DUNG, TIMESTAMP, column controls, the shared scroll viewport and row chrome.
`script-transcript-layout.tsx` owns the header, cells, inline speaker control,
selection/row number and column preference hook. All four source adapters use
these primitives. New transcript sources must adapt their data into these
components, rather than add a source-specific card/list layout.

The speaker dropdown sits beside the checkbox without a second speaker-name
line. The checkbox is16.8px in both states (30% smaller than24px); its row number
stays underneath. A channel label sits directly below the dropdown, including
when opening an individual child of imported multitrack footage. VoiceScript
keeps its distinct Voice Model chooser below the Speaker Profile control.

Column defaults are220/620/164px, with one browser preference:
`pro4bro:script-table:shared-v1`. Resizing, removing and adding columns propagate
to other mounted Script instances and subsequent projects/pages. Legacy
per-footage keys are retained but no longer applied. This is a browser UI
preference change, not a portable project format or word timing migration.

Source adapters retain ownership of grouping, source clocks, selected row word
indexes, editing and playback callbacks. Independent audio clocks are never
flattened into one normalized word stream for presentation. Live OBS has
segment timing and draft status; its profile assignment remains read-only until
an archived word document exists. Controls requiring one archived document
(export, clear and AI review) stay visible but disabled in the aggregate/live
view; opening a child document uses the established functional actions.

Word-aware source adapters also use `script-table__word-wrap` per word. Its
inline-block whitespace layout, together with common word button padding, is
the canonical inter-word spacing contract (USER-FEEDBACK-21).

## Evidence and limits

Cross-source DOM and real stylesheet tests cover canonical columns, inline
speaker placement, fixed checked/unchecked size, profile assignment/unassignment,
track placement, shared column updates and formatting inheritance. Existing
selection, editing, source seeks, overlap and measured long transcript scrolling
regressions remain active. The stylesheet test exposed VoiceScript's different
plain-click checkbox behaviour; it now toggles like the other sources.

Native visual/device acceptance remains after refreshing the built client.
This round changes presentation and browser preferences, not transcription
content, audio, model artifacts or acoustic timing accuracy.
