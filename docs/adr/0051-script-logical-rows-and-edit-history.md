# ADR 0051 — Logical Script rows, selected attribution and edit history

Date: 2026-10-09. Status: accepted for USER-FEEDBACK-04.

## Context

The owner confirmed improved interaction responsiveness after feedback03. Its
64-word view fragments nevertheless repeated speaker controls, selection boxes
and row borders, appearing as several rows for a single speaker. Dense Timeline
markers retained timestamps but suppressed every readable word label. Speaker
selectors still changed unchecked rows and no shared Script undo history existed.

## Decision

- A logical Script row changes only when its speaker identity changes. An
  inherited footage profile and the same explicit word profile share one key.
  Separate tracks retain their own source identity and clock. View fragments
  remain an implementation detail inside one visible row; its speaker controls,
  checkbox, original ordinal and logical row actions appear once per view.
  The existing bounded word DOM and distant-word reveal remain.
- Selection buttons have a fixed 24x24px border box in both states; an unchanged
  box holds the check glyph. The row ordinal appears directly underneath.
- Speaker choices inside Script target checked rows. Row and toolbar dropdowns
  are disabled without the appropriate checked selection. Row dropdowns assign
  all checked rows. Word context choices and plain text/tag speaker annotation
  are restricted to indexes belonging to checked rows; Media Pool footage
  tagging remains a separate action. Selecting text or moving the playhead does
  not implicitly check its row.
- Ctrl+A routes to every logical row, including unmounted words, while the
  pointer is in Script or keyboard focus is there. Active text inputs retain
  native text selection; Find/query inputs keep their native editing shortcuts.
- Ctrl+Z / Ctrl+Shift+Z use a project-session command history capped at30 steps.
  A committed edit snapshots text, words/timestamps and attribution metadata.
  Pending prose/inline edits finish before undo or redo. New edits clear redo.
  Cross-track speaker assignments from one event are grouped into one history
  step, with restoration through the existing ordered/versioned word save queue.
  Source audio, AI processing and asset deletion are outside this history.
  The history resets on project change/reload and does not change project format.
- Dense subtitle overviews add bounded inert snippets on non-overlapping screen
  slots. Increased zoom increases snippet density, then native timed word labels
  take over. Original timing boxes/source indexes remain authoritative for hit
  testing, editing and promotion. Summary slots never stretch word timestamps.

## Verification and acceptance

Regression failures reproduce repeated row DOM, unchecked row assignment and
inherited/explicit identity splitting. Synthetic tests cover fixed selector
structure/ordinals, hovered Ctrl+A, history routing, pending-edit redo, 30-step
limits, new-edit redo clearing, grouped tracks and persisted text/timing/speaker
restoration under queued writes. Subtitle helper/component tests cover6,000 words,
bounded non-overlapping snippets, zoom detail and original timestamps.

Actual checkbox sizing/theme, snippet legibility and scrolling still need the
UX-EDITING-DEVICE-01 device check. The earlier browser tool policy restriction is
unchanged; DOM/CSS checks do not establish screenshot-level visual acceptance.
