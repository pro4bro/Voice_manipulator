# VM-OUTPUT-SESSIONS-01 — Voice Output Versions and engine picker

One bounded Voice Manipulator round, 2026-10-24. The owner's two screenshots
showed native engine options with unreadable text in dark mode. The owner chose
independent Voice Output copies as the meaning of New Version.

## Delivered

- Voice Output header has labeled icon controls: folded blank page with a plus
  for New Session, overlapping pages for New Version. Project-owned Session and
  Version rows are selectable; newly generated audio fills an explicitly empty
  active Version. Existing outputs are adopted without changing their WAVs.
- New Version copies the selected WAV, metadata and validated edit journal under
  a fresh output ID. `sourceOutputId` records lineage. Revision conflicts reject
  stale requests. A deleted output's slot is retained and is never silently
  reused; an unavailable WAV cannot be cloned.
- Engine picker now renders its option list with the app's theme tokens in a
  viewport-positioned portal. It keeps automatic selection, unavailable-engine
  inspection and keyboard navigation; the chosen engine still passes to the
  existing generation guard.

## Verification

| Check | Result |
|---|---|
| Frontend full | 154 files, 1263 tests passed |
| Frontend typecheck/build | Passed, 217 modules built |
| Voice Output and engine focused | Final 22 tests passed |
| New backend adapter/API cases | 3 passed: copy/independent journal, project move, revision fence, invalid WAV refusal |
| Existing Script backend cases | 32 passed, combined run 33 passed before final backend follow-up |
| Backend full | 1545 passed, 3 existing warnings, 826.99 s; started before the final third new test and WAV guard, both verified in the final 3 focused cases |

No owner project, media or model was modified. No real browser/theme screenshot or
live audio audition was performed. Script editing remains project-wide rather
than per-Version; this round versions generated audio and its edit journal. Phase
03 remains 60%; Phase 06 remains open. See ADR0140.
