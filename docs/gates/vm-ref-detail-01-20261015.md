# VM-REF-DETAIL-01 — 2026-10-15

Right-column Reference Detail displays one two-line slot per frozen target with
all source names. Independent expand controls show source spans, properties,
strength/priority, requested/missing/stale warnings and random-off state. Content
navigation opens the target output without replacing the current Script draft;
shared selection and an explicit navigation request reveal both views. Untimed
Script selections remain untimed. Expansion and deletion never seek or navigate.
Revision-checked deletion preserves sources and other assignments. Read tokens
prevent old refreshes overwriting a subsequent Apply/delete result.

Validation: frontend focused 78 initial tests:77 passed, one accessible-name
failure corrected with explicit separated label; final ReferenceDetail/selection
6 passed. WorkspaceShell/registry/manifest77 prior passing tests; backend reference
bindings7 passed, typecheck/build pass. Browser geometry/native scroll UAT remains
open until browser provider is available. Reopen/state uses the existing portable
binding store. No reference conditioning or timing execution claimed here.

Next: VM-REF-RESOLVE-01.
