# ADR0145 — Legacy Script rows become speaker turns once

Status: accepted, 2026-10-25. Round VM-LEGACY-SCRIPT-TURNS-01.

The owner now authorizes automatic grouping of old Script rows. Documents carry
`turnGroupingVersion: 1` after conversion; new documents start at this version.
Only legacy documents without the marker are grouped on opening. Intentional
rows added later remain separate through saving, checkout and reopen. Older
browser-only row arrays convert once and are cached as the complete document.

Combine consecutive rows with the same explicit Speaker Profile and Voice Model,
or the same explicit Voice Model when neither has a Profile. Preserve the first
row ID, join the exact original text with a newline, union tags/provenance, and
retain all member IDs in `legacyRowIds`. A/B/A stays three turns. Unknown people,
different effective settings/models, duration budgets, row-specific timing or
reference bindings, and the existing 5000-character limit retain boundaries.
This avoids discarding separate production intent while grouping ordinary text.

Current/generated/Full snapshots use common compatible boundaries. History and
recycled snapshots preserve their own guarded identity/settings. Keep pre-migration
Script/session-book backups beside the original JSON files. Migration increments
the relevant revision once. Source WAVs, source output metadata and composition
geometry are not rewritten to change the editor's row layout.

Timing display aggregates the original source spans and word indexes. Local Fix
uses a read-only projection of exact, adjacent source aliases onto the grouped
row. Unsafe or incomplete provenance retains a blocker rather than fabricating
timing. Later Full/Fix outputs carry the grouping marker and alias metadata;
subsequent Fixes and layer renders can still resolve original sources.

Each original row becomes a line inside one cell, with text wrapping and automatic
cell height. Alt+Enter inserts a literal newline without creating a row. Leading,
trailing and repeated newlines remain visible when viewing timed words. The
existing Enter behavior also remains inside the row; Add Row creates a new turn.
