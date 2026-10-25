# VM-LEGACY-SCRIPT-TURNS-01 verification — 2026-10-25

## Delivered

Old project Script rows now group once into consecutive speaker turns, with each
old row on its own literal line in one cell. Alt+Enter inserts an in-cell newline.
The grouping marker protects future intentional Add Row boundaries. Current,
generated and Full snapshots share safe grouping boundaries; old source row IDs
remain available for timing, word selection and local Fix. JSON migration backups
remain beside the project Script and Session book. See ADR0145 and
`docs/VM-LEGACY-SCRIPT-TURNS-PLAN.md` for scope and compatibility guards.

Frontend implementation: `85122db`. Backend implementation: `66f8e72`.

## Automated evidence

- Final standard `npm test` from `apps/web`: **164 files / 1324 tests passed**,
  190.50s. Log: `.scratch/vm-legacy-script-verified-frontend.log`.
- Final `npm run typecheck` and `npm run build` pass; **229 modules** transformed.
- Focused tests cover legacy cache idempotence, A/B/A, identity/settings/duration
  boundaries, row length, source aliases, aggregate timing, blank lines, Alt+Enter,
  generation of the complete grouped text, and later manual row persistence.
- Initial Vitest fork startup failed before any tests ran. Temporary command-line
  `--pool=threads` enabled focused diagnosis without changing repo configuration.
  An intermediate threaded full run encountered the unchanged OBS playhead race
  (expected70%, observed0%); its exact isolated retry passed. The final standard
  full run above passes every case. No assertions, timeouts or cases were weakened.
- Backend final focused: **26 passed**, one existing audioop deprecation warning,
  3.24s, with `.venv/Scripts/python.exe`. Covers migration, exact timing projection,
  repeated Fix, Full then Fix, clone, recycle/recover and immutable original WAV.
- Full backend: **1625 passed, one failed, three existing warnings**, 1002.14s.
  The sole failure is the unchanged 60s embedded VibeVoice import timeout in
  `test_embedded_runtime_imports_streaming_package_from_the_correct_checkout`.
  That gate remains open; no assertion, timeout or case was weakened.
  Log: `.scratch/vm-legacy-script-api-full-venv.log`.
- An earlier full API attempt used global Python3.10 and failed collection on
  missing `soundfile` in two expressive test files. That attempt is not a valid
  project gate; verification uses the documented development `.venv` interpreter.
- Lead reviewed frontend/backend changes and `git diff --check` passes. Review
  added regressions for multiple independent speaker groups, second Fix, and
  Full→Fix to preserve aliases after outputs themselves become grouped.

## Browser and artifact evidence

Owned fixture: `.scratch/vm-legacy-script-uat`, copied from the prior synthetic
Full/Fix fixture before use; local port18130. No owner project, media, engine or
model was changed. The local runtime status response is fixture scaffolding;
the Engine Ready banner is not evidence of a model training/inference gate.

- Opening the unmarked project converts two consecutive An rows into one cell:
  `alpha bright village dream\necho`. Current/generated/Full each have one row,
  retained ID `row-1` and aliases `row-1`,`row-2`.
- Native Alt+Enter followed by Vietnamese text inserts a third line in that same
  row. Explicit Add Row creates a second row with the same An Profile. Reload and
  reopen preserve both rows and their text; no second automatic merge occurs.
- The temporary manual row/text were removed afterward; the original pending
  fixture text remains as one grouped cell. The blue pending/fixed differences
  are preserved. Dark/light themes were inspected at1864×900, and the editing
  path also exercised the normal1280×720 viewport.
- Source evidence: **22 WAV files and22 output JSON files remain byte-identical**.
  `source-metadata-proof.json`, `opened.json`, `manual-row.json` and `final.json`
  record checks under the owned fixture. Composition layers/clip geometry remain
  intact. No synthesis occurred in this browser UAT.
- The migrated fixture's local Fix plan has no structural blocker. Its existing
  incomplete trusted alignment uses the explicit whole-turn fallback (0–120000
  frames at24kHz), preserving the established5s clock. Exact word-span mapping is
  separately covered by trusted-word backend tests.
- `voice-over.json.pre-turn-grouping` and
  `voice-output-sessions.json.pre-turn-grouping` retain old Script/book content.
- Screenshots: `.scratch/vm-legacy-script-uat/dark.png` and `light.png`.
  The temporary browser tab/server were closed after verification.

## Limits

Automatic grouping deliberately retains boundaries for different voice/settings,
duration budgets, row-specific timing/reference bindings, unknown identities or
the existing row text limit. No acoustic/model-quality claim follows from these
synthetic checks. Phase03 stays60%; Phase06 remains open.
