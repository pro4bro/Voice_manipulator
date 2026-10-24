# ADR0142 — Output slots share a recoverable lifecycle

Status: accepted, 2026-10-24. Round OUTPUT-LIFECYCLE-01.

Make Session/Version removal a shared snapshot-and-restore policy. Keep the
entire state and owned generated artifacts together until an explicit permanent
action in Recycle Bin. Preserve original IDs and shared immutable inputs;
cross-Version or LipSync references prevent purging Voice audio still in use.
Export a Session or Version as a project-relative product ZIP. Retain individual
media/subtitle export capabilities.

Share action types, symbol controls, context menus and bin presentation across
product modules. Media Pool uses the same bin shell with its existing source
asset operations. A pure lifecycle policy handles hierarchy and recovery;
format adapters own job guards, references and artifact enumeration. One checked
artifact adapter packages files and stages permanent removal with metadata
rollback. This avoids coupling source-media deletion to generated-product layout.

Treat Training Run persistence and progress as Queue's source of execution
truth. Durable Queue receipts remain a projection/history, reconciled on read,
so stale Done state cannot hide ongoing or interrupted training.
