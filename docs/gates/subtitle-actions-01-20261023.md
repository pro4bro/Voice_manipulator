# SUBTITLE-ACTIONS-01 — visible preview/apply controls

Owner feedback: Ghost Preview and Apply Aligner could not be found in Input.
This bounded correction changes action discovery, without advancing Phase03
(60%) or closing Phase06.

## Reproduction and cause

`npm test -- src/modules/script/SubtitleRefinementPanel.test.tsx --maxWorkers=1
-t 'keeps named preview'` initially failed: no accessible Ghost Preview button.
With no eligible track, the component rendered only its empty-state text.
With eligible words, the actions were below the full parameter form and named
`Bắt đầu tinh chỉnh` and `Apply New Timing`, unlike the owner's expected labels.
Input's right column already scrolls; no separate clipping bug was established.

## Correction

- Show Ghost Preview and Apply Aligner immediately below the refinement heading,
  above settings, with the existing button styles and a two-column wrapping grid.
- Keep actions visible but disabled without an eligible selected STT track; explain
  what is needed. Apply still requires a current preview with changed words.
- Explain the two steps and unchanged/manual-lock outcomes. Preserve EasyAligner
  defaults and existing explicit inference, source fencing, conflicts and Restore.
- Update existing interaction tests to the visible labels. Update the registry
  test's MFA-only catalog fixture to include the selected EasyAligner default.

## Verification

- Focused frontend panel/registry/manifest: 3 files, **16 passed**, 8.45 s.
- Backend engine/neural/MFA checks: **42 passed**, 2.70 s; one existing
  Starlette/httpx deprecation warning.
- Typecheck and production build pass (214 transformed modules).
- Isolated browser renders the real panel/provider/ghost components and product
  styles at 280 and 400 px column widths. Preview adds a conflict ghost and enables
  Apply; Apply moves only the fixture's changed word; Restore returns it; clearing
  selection keeps both disabled buttons visible. No warning/error console logs.
- The browser fixture uses deterministic API responses: no model was run and no
  owner Project was edited. No managed app listener was available on the checked
  local ports, so this is component/browser verification, not a live Project UAT.
  Temporary fixture files and its Vite process are removed after verification.
- Full suites are not rerun for this UI-only correction; previous unrelated full
  suite limitations remain recorded in SUBTITLE-ENGINES-01.

Remaining alignment quality limits (unknown tokens, neighbour conflicts and a
second recording) are unchanged. Stop this bounded round after commit/push.
