# VM-LEGACY-SCRIPT-TURNS-01 — 2026-10-25

One bounded round for the owner's old-project row correction:

1. Migrate adjacent compatible rows for the same explicit speaker into one row,
   keeping the first identity and joining original row texts with literal newlines.
   Preserve speaker order; A/B/A remains three turns. Unknown identities, changed
   voices/settings, duration budgets or text beyond the existing row limit retain
   their boundaries. Save a one-time grouping marker and source row aliases.
2. Migrate current/generated/Full snapshots coherently and retain source timing,
   composition, word indexes and immutable audio. Local Fix must still resolve old
   source row identities. Preserve manual rows added after migration on reopen.
3. Support old browser-only drafts and older output adoption, retain new document
   markers, and show grouped content with Excel-like lines inside one cell.
   Alt+Enter inserts a newline without creating a new row.
4. Verify migration idempotence, unchanged highlights, pending/fixed text, timing,
   Fix/clone/recycle behavior, and real UI on owned synthetic project/media only.
   Record actual frontend/backend gates and remaining environment failures.
