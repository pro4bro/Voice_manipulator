# UX-11B — Recording selector and track-label acceptance

Date: 2026-10-03
Result: Controlled running-browser gate passes; no new source defect observed.

## Scope and setup

The existing UX-11 follow-up checks named recording selection and 11.2px track
labels with multiple recordings, including clipping and readability. It does
not change capture, recognizers, media formats or the Voice Training phase.

A separate registry/project and managed controller/API/Studio use
18219/18220/18281 under ignored `.scratch/ux-11b/`. The project copies the two
real OBS archives used in UX-08B/09B (29.93s and 43.77s, two tracks each).
Mutable metadata is copied; immutable audio bytes are linked and never edited.
Eight source MKA/WAV/MKV hashes are unchanged after the browser gate.

Owned metadata fixtures use a long Vietnamese project name, clear one stored
display name to exercise legacy name fallback, and assign one long native
source label and one short `Mic B` control. These are presentation fixtures;
they are not new hardware recordings or speech-quality evidence. Source IDs,
archive bytes and sample timing are retained.

## Browser findings

The initial browser viewport is 1280×720, DPR 1. Responsive checks also use
750×884 and 853×480, DPR 1, in both themes.

- Both recordings have distinct local start timestamps. The retained name is
  `2026-10-03_16-01-14_UX-08B-physical-two-takes_LIV_55224012`; legacy fallback
  uses the copied project's long Vietnamese name and its stable recording ID.
- The selected `title` always equals the full selected option text. Changing
  selection through the dropdown and ArrowDown/ArrowUp + Enter updates it.
  Existing stored names remain stable when the project has a different name.
- The selector is about 319.56×23px. Its rectangle remains inside the wrapping
  header at all measured viewports; it does not overlap the waveform body.
  Long text is clipped inside the closed select while its full name remains in
  the tooltip and option text. No extra layout repair is needed.
- Labels are **11.2px × font scale** in both Layer and Column views. The current
  scale is 1.08, giving 12.096px actual browser text; the setting is preserved.
  The long label is 517px wide inside a 109px Layer viewport and scrolls on one
  line. The short label is 81px wide and remains stationary.
- Keyboard resize reaches the existing 240px Column minimum. Its long-label
  viewport is 79px beside the meter controls, with scrolling still enabled;
  the label occupies one line rather than covering meters or waveforms.
- Keyboard focus on `Nghe kênh Track 7` pauses the label animation. An earlier
  focus probe landed on Gain instead; that intermediate measurement is retained
  as diagnostic evidence, not counted as a passing focus case.
- Selected record identity remains `fa1f74e5` in the selector and Script after
  returning to it. Audio elements stay paused; changing recording does not
  autoplay. Final browser warning/error logs are empty.
- Light labels use `rgb(24,26,22)`; dark labels use `rgb(243,240,231)`. Light
  selector text is dark on `rgb(255,253,248)`. Screenshot review finds readable
  name/selection text in the tested views. This is not a whole-product contrast
  acceptance claim.

Evidence: `.scratch/ux-11b/browser-evidence.json`, `acceptance.json`,
`media-before.json`, `journals.json`, `dark-layer-long.png`,
`dark-column-min.png`, `light-layer-750.png`, `light-853.png`,
`accepted-overview.png`.

## Verification and cleanup

- Frontend: **55 files / 465 passed**, 121.32s, one worker.
- Typecheck and production build pass; `git diff --check` passes.
- Backend 501 is the carried UX-10B baseline, not rerun for this presentation
  acceptance round; no product source is changed.
- Five browser acceptance cases pass; one intermediate focus measurement is
  explicitly diagnostic. Final console warning/error entries are empty.
- Eight original media SHA256 values still match after testing and cleanup.
- Scratch services stop; 18219/18220/18281 return to free and the runtime
  session file is removed. Browser viewport/theme restore and test tab closes.

## Limits and next round

Current Windows system DPI is 96 (100%), and browser DPR is 1. Physical Windows
125/150% scaling is unverified. The current reduced-motion preference is false;
the existing CSS reduced-motion rule is not claimed as physically exercised.
Those checks remain in UX-10B/LIVELINK-08 and MEDIA-VIEW-02B respectively.

The roughly five-minute PCM spool/Stop-to-archive delay from UX-10B remains a
separate unresolved performance gap; this archived-media UI gate cannot prove
live capture latency or STT quality.

Exact next existing round: **UI-CONTRAST-01B**, inspect highlighted states
throughout the running app in both themes at the owner viewport. Individual
name checks cannot establish readable inherited text in every highlighted UI.
