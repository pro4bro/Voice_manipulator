# USER-FEEDBACK-24 — visible diarization labels and partial turn reassignment

2026-10-12. Owner feedback: after Speaker Diarization, Script showed only
“Chưa gán Profile”, hiding which row was Speaker 1 or Speaker 2. Reassigning a
selected passage in the middle of a turn needed to produce A–B–A; assigning at
an edge needed to join the adjacent B turn.

## Bounded correction

- Stored Script tables now show the row's diarization label independently of
  its Speaker Profile dropdown. Archived/imported channel rows show their raw
  or manual diarization label too. The dropdown remains a separate identity
  mapping control, and its established placement relative to the track name is
  retained.
- The selected-word context menu offers the existing diarization speakers in
  the document. Selecting one writes a manual diarization override for exactly
  those words, through the existing `onWordsChange` history path. Raw STT
  speaker IDs, word text and timing remain unchanged. Row grouping derives
  A–B–A for an interior passage and merges an edge passage with an adjacent B
  row. Profile choices in this word menu now act on the explicitly selected
  words without requiring a separate row checkbox; row dropdowns and bulk
  actions still act on checked rows.
- New tests cover both edge directions, an interior reassignment, preserved
  source label/timing, ordinary Script visibility and channel visibility.

## Verification

- Focused Script/channel/layout tests: **70/70 passed**.
- Full frontend: **777/777 passed** across 84 files with two workers.
- The final selected-word Profile regression was strengthened after the full
  run; its affected ScriptEditor file passed **40/40** again.
- `npm run typecheck` and `npm run build`: passed.
- Backend: **742/742 passed**, two existing deprecation warnings, in 273.03s
  through `.venv/Scripts/python.exe -m pytest services/api/tests -q`.
- `git diff --check`: passed (Git's LF/CRLF conversion notices only).

## Remaining acceptance

Automated DOM and word-data tests do not prove the visual layout and pointer
gesture on the owner's device. After refreshing the source frontend, verify a
real diarized project: Speaker 1/2 remain visible before profile mapping;
select a middle phrase, assign Speaker 2, then assign first/last words and
check A–B–A versus adjacent-row merge, Undo/Redo and Timeline synchronization.
No processor, audio, model or source-media result is claimed by this UI round.
Phase03 remains 60%.

Exact next round: USER-FEEDBACK-24B native Script/Timeline acceptance on a
diarized project after the owner refreshes the source build. The independent
STT-TIMING-ACCURACY-01 anchor review still needs the Conviction reference.
