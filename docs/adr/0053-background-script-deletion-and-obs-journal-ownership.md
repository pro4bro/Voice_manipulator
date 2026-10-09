# ADR0053 — bulk Script deletion and OBS journal ownership

2026-10-09. Accepted for USER-FEEDBACK-06.

## Decision

- Selected-word deletion maps lexical identities once and commits one text/word
  edit. Surviving annotations/timestamps retain their objects; unmapped selections
  fail atomically. Exact spelling avoids unnecessary normalized-token allocation.
  Changed text proves a history edit without serializing both entire snapshots.
- At1,000 words and above, available browser Workers process lexical deletion off
  the UI thread. Only word text, Script text and indexes cross the boundary.
  Metadata stays in an immutable UI snapshot. Asset/text/word identity fences,
  cancellation on navigation/edit/unmount, visible pending/error state and no
  duplicate pending deletion prevent stale results from overwriting newer work.
  The result uses the existing30-step history and ordered API saves.
- Script timing notices belong to scrolling content, outside the transcript value
  and semantic grid. A measured leading inset participates in virtual coordinates;
  prose notices and text overlays follow the native textarea scroll and padding.
  No warnings are inserted into editable/copied/exported Script text.
- Machine OBS history cannot prevent a valid current journal from being written
  merely because a historical project owner no longer exists. Such history entries
  are pruned from the machine list only; portable media/journals remain untouched.
  Missing or unreadable completed journals are never recreated as successful
  artifacts from a machine snapshot. Their explicit recovery error remains.

## Limits

No project schema migration, upstream edit, acoustic timing or identity claim.
Background computation tests do not establish browser/native/audio acceptance;
UX-EDITING-DEVICE-01 retains that gate. Environments without Worker use bounded
synchronous deletion. Current machine history still requires valid project ownership
for the active recording. Previously absent journals are not automatically recovered.
