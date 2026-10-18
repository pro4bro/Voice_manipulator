# 0111 — Word editing parity and project playback resume

Accepted 2026-10-18, stabilization round54. Extends ADR0109/0110.

## Word commands

Subtitle context menus expose Speaker Profiles alongside Add/Edit/Delete. Reference
assignment stays available as an explicit menu action, including keyboard context
menus, preserving the frozen disjoint selection. Script table, native text and
channel views expose Add/Edit/Delete through their existing atomic word/text
commands. Delete acts on selected words in the owning module, while input,
textarea and contenteditable retain native editing. Read-only/live sources remain
read-only; generated output editing still follows the existing Voice Edits model.

## Exact replacement interval

A known one-word replacement keeps its exact original IN/OUT. Multiple replacement
tokens partition that same interval; they cannot borrow surrounding silence.
Preserve row metadata, source timing provenance and unchanged neighbour identities.
Use timingSource=user-text-preserved and timingTrusted=false: preserving the user
interval does not establish acoustic alignment of the new spelling. Genuine Add
text remains user-interpolated, with available audio bounds; reject a zero-space
insertion and retain its draft instead of repairing neighbouring anchors.

## Resume state ownership

A versioned localStorage envelope stores project-local source IDs separately from
source-scoped cursor positions. It stores no absolute path or source media. Source
selection changes only through workspace source actions; clock updates never select
a source. Asset child identity includes its parent; outputs and OBS archives have
distinct identities. Validate corrupt/unavailable storage and clamp finite cursors
against available duration. Zero is a valid saved position.

Initial restoration waits for media/output hydration, validates the current source
and yields to explicit user opens. Deleted or withdrawn media do not reopen. OBS
archive restoration waits for its journal; live recording follow is not restored.
Timeline source switches guard initial zero/stale clocks and stale media metadata.
Imported/archived focused editors share their parent clock identity. Paused seeks
save immediately; ordinary playback retains a cursor snapshot and flushes on pause,
pagehide or unmount. Restore pauses audio rather than auto-playing it.

## Verification boundaries

See docs/gates/word-edit-resume54-20261018.md for checks and limitations. These are
UI/editor-state changes, with no engine, backend, model or media processing changes.
No STT acoustic accuracy claim. Phase03 stays60%; independent acoustic anchors,
Checkpoint A and13downstream processor gates remain open.
