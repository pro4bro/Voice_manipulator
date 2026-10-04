# UX-CONSISTENCY-01 — selection, Script and waveform consistency

Date: 2026-10-05. Owner requested this related group in one/few rounds.
Baseline: `64f2db4`, branch `feat/03-04-high-quality-training`.

## Delivered behavior

- Projects Hub right-click offers permanent Delete for one or multiple selected
  projects. Bulk Delete confirms once with the project names; partial failures
  retain failed projects in the list and report their names. Remove still only
  forgets a project.
- Timeline canvas (including recording/TTS), imported multitrack and OBS use
  the same filled min/max envelope, centerline and 46%-height amplitude scale.
  OBS no longer draws separate vertical strokes. Missing PCM intervals remain
  gaps. Old stroke/translucent imported styles were removed. Active envelopes
  use the same lime treatment. Conviction's actual cache was inspected: mono,
  24 kHz, 24 frames per peak; no project-specific style setting exists.
- Media Pool publishes its selected footage/track IDs to Script. Ctrl toggles,
  Shift ranges and multiple selected tracks show only those scripts. Selecting
  an archive shows its imported children; clearing selection clears Script.
  The old track/original Script switches were removed. Explicitly selected
  pending OBS recordings still show their own live transcript; deselecting
  archived footage cannot fall back to that transcript.
- Each transcript row has a Speaker Profile dropdown. Row selection now sits
  beside Speaker, accessible without scrolling across the content. Multi-row
  assignment and existing word/segment correction remain available. Combined
  footage/channel views can also assign individual or selected rows, scoped to
  the correct source words. Separate footage clocks do not invent overlaps.
- Diarization and row-profile selects/options use panel background and theme
  text colors. In the running browser: dark background/text RGB 34/37/32 and
  243/240/231; light 243/240/231 and 24/26/22.
- Voice Training only receives Train-selected footage/tracks. Archive parents
  remain when they contain selected tracks; unchecked siblings and pending
  local/OBS items are excluded. Unticking the opened asset clears its preview.
- Word times appear in a fixed tooltip outside the scrolling transcript, with
  no inline text insertion. Hover/focus shows it; leave/blur/Escape/scroll
  dismisses it. Browser geometry for the next word stayed x=516, y=173.21875
  before and after showing the popup.
- `BẢNG SCRIPT` is renamed `DẠNG BẢNG` in Input and Voice Script. It switches
  the Speaker/content/timestamp table to a prose/text view; this display choice
  remains useful independently of footage selection.

## Verification

- Frontend: `npm test -- --reporter=dot` — **491 passed / 57 files**.
- Final label-only Voice Script follow-up: **12 passed**.
- Final Channel Script regression follow-up: **5 passed**; an unrelated active
  OBS recording cannot combine the clocks of separately selected footage.
- `npm run typecheck`, `npm run build`, `git diff --check` — passed.
- Backend: `.venv/Scripts/python.exe -m pytest services/api/tests -q` —
  **564 passed**, existing Starlette/httpx and audioop deprecation warnings.
- Worker waveform suite: **59 tests**, including live gaps and single peaks.
- Read-only Worker integration review found an OBS deselection fallback; fixed
  and covered by a new regression. Lead reviewed the integrated diff and CSS
  cascade in the actual browser; selected OBS paths now have `stroke: none`.

Browser tested against the portable stack using a copied Conviction project
at `.scratch/ux-consistency-01/project`, with one additional copied control
asset. Four source audio/cache files matched SHA-256. Owner word data remained
unchanged. Changing row 1 affected exactly word indexes 0–26; after assigning
the first two rows together only indexes 27–30 differed from the original.
All 665 texts, start/end times and raw diarization IDs remained unchanged.
Train checked/unchecked filtering, multi-footage display, empty selection,
two-theme colors and the tooltip were exercised through the UI. The existing
copied OBS project and its real 78.746-second TTS output verified both waveform
surfaces. No browser console errors were captured.

Local screenshots and preservation hashes are retained under
`.scratch/ux-consistency-01/`: `hub-bulk-delete.jpg`, `speaker-rows-dark.jpg`,
`speaker-rows-light.jpg`, `timing-popup.jpg`, `training-filter.jpg`,
`obs-envelope.jpg`, `tts-envelope.jpg`, `final-input.jpg`, and `media-preservation.json`.
Hub bulk-delete menu visibility was checked in the real browser; destructive
execution/cancel/partial-failure were tested with mocked APIs, without deleting
owner projects.

## Runtime and limits

The old controller was no longer listening during browser validation. Normal
launcher start reclaimed two verified orphan workload trees. Readiness passed:
controller **2.909 s**, Studio **3.302 s**, API **3.611 s**; portable services are
running. This does not reproduce the original cold-start delay.

No new physical microphone/OBS recording or model generation was run. Imported
multitrack and capture rendering are covered by the renderer tests; browser
media checks used existing real copied artifacts. Independent ingestion,
training-publication and previously recorded physical UAT gaps remain open.
No product phase advances.
