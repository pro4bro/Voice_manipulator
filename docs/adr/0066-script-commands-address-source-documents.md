# ADR0066 — Script commands address source documents

2026-10-10. Accepted for USER-FEEDBACK-20. Supersedes ADR0065's restriction
that archived aggregate Script actions require opening a child first.

## Cause

USER-FEEDBACK-19 shared the table presentation but kept row selects disabled
until checked and aggregate actions disabled whenever `obsFeed` existed.
The workspace Export/AI handlers also looked up the selected parent instead
of the actual child documents. Identical chrome did not establish functional
parity. A source adapter must supply real command targets as well as a renderer.

## Decision

The common row profile select is always enabled, with an unassigned option
even for an empty catalog. Opening it selects its row only if no rows are
selected. Otherwise the selection remains unchanged. Assign/unassign commands
apply exclusively to the selected rows in footage, channels and VoiceScript.

An archived parent provides `sourceDocuments`, `renderSources(mode)` and
`onSourceDocumentsChange` to ScriptEditor. Table/text, Find/Replace, pause
formatting and Clear Text operate on each document's ID, local text offsets
and word clock. Native text editing reconciles timing and labels through the
existing reconciliation module. Do not flatten independent timelines or edit
the parent archive using the aggregate display text.

Export and AI fix receive actual source IDs. The workspace waits for pending
word writes, resolves current eligible assets and reports each source result.
AI revisions remain proposals: the user keeps STT, chooses AI or edits a
proposal manually. A late AI response merges only its AI revisions if the
user edited the text meanwhile; it cannot restore a removed source or overwrite
new words. Multi-document changes form one step in the existing 30-step history.

Capabilities follow document readiness, active capture, deletion and processor
readiness. Source names/project names cannot disable an otherwise available
command. A pending capture has segment drafts but no archived word document;
its destructive/word-document commands stay unavailable until archiving.
That is the same readiness boundary as an active microphone transcript.

## Evidence and limits

Registry caller regressions reproduce the owner's disabled dropdown/buttons,
then verify real source changes, command targets, native find selections and
Undo routing. Workspace tests exercise actual saves, API dispatch, atomic
Undo/Redo and late AI response handling. The full frontend/backend checks and
module audit are recorded in `docs/gates/user-feedback-20-script-actions.md`.
Native popup appearance and physical-device acceptance remain owner checks.
