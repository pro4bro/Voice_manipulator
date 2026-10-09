# USER-FEEDBACK-16 — Speaker model nesting and OBS Script/Timeline sync

2026-10-10. One bounded owner-feedback round.
Product commit: `cc1a8fa`.

## Reported issues and root causes

- Model slots were always visible under a profile header, without a disclosure.
  Added independent, initially collapsed profile expanders with model counts,
  aria-expanded/controls and contained, indented child slots.
- Archived OBS Timeline never published per-asset active words or listened to
  ChannelScript's common playback seeks. Its playhead callback depended on live
  transcript rows, absent after a normal archived-file STT.
- Single-track ScriptEditor emits workspace WordSelection; OBS Timeline did not
  receive it. Subtitle clicks changed only display time, leaving audio unchanged.
- Lead review found the focused child editor had no selection callback in the
  default multitrack view. Added local selection for that focused asset while
  retaining workspace selection for the explicitly selected track.

## Reproduction and verification

VoiceVault regression failed before disclosure (1 failed/16 passed), then its
17 tests passed. Existing model-action tests now explicitly expand the profile;
the imported-voice reopen assertion also expands, avoiding a vacuous hidden-button
pass. CSS review pins Properties to its own grid column for zero-model profiles.

Two real ModuleRegistry integration regressions failed before the clock repair:
both multi-track Script word clicks and single-track word selection left audio
at zero instead of3s. They exercise actual ScriptEditor/ChannelScript and
ObsLiveLinkTimeline rather than mock module callbacks. The repaired assertions
cover both channel clocks, simultaneous words, playback-to-Script highlights,
subtitle-to-audio seek, unrelated asset rejection and no active word in silence.
The first implementation incorrectly highlighted the nearest word in silence;
the regression caught it and publication now validates the actual interval.

Additional regressions cover refreshed word arrays without rewind and focused
editor clock ownership. Review's multitrack focused selection failed with
aria-pressed=false; it passes with asset-local controlled selection. Existing
live capture, archive navigation, overlap, cuts, timing editor, waveform and
shortcut regressions remain in the full frontend suite.

Re-clicking a selected Script word emits selection at click completion, after
pointer handling reserves selected words for row dragging. The regression now
uses the real pointer-down/up/click sequence. Depending on the selection object
allows that new click to seek even with the same anchor; asset refresh alone
does not trigger it. No Script selection or row-drag implementation was changed.

Final frontend: **701 passed /77 files**,92.39s. Typecheck/build/diff check pass;
production build transforms131 modules, JS801.24kB/CSS259.74kB. Focused VoiceVault
17 pass; final full suite includes all46 OBS Timeline tests. One intermediate
focused run also had a short-archive zoom label mismatch0.02 vs0.01; it did not
recur in the subsequent full runs, and its assertion was not changed. No native
zoom acceptance is inferred from that pass.
Backend implementation is unchanged; API718/two existing warnings is the carried
STT-GAP-01 baseline, not a rerun in this round. No inference or service restart.

## Real metadata and preservation

Read-only audit: owner project test-obs-9-f4e60d5e, recording
13b6cb03-2dfc-4b75-a05e-dd795c70d549. Both source stems map to their correct
asset and parent asset-live-861380327005. Channel1 asset-live-05d3d2248f2d retains
1,094 words; Channel4 asset-live-32b7726db251 retains42. Both saved arrays are
sorted. Six project/index/journal/catalog/word metadata hashes are retained in
`.scratch/user-feedback-16/obs9-identity.json` and checked again at closure.
This audit proves identity/order preservation, not native playback behavior.

## Owner acceptance and next round

After reloading the built UI, expand a Speaker Profile and verify model controls
remain inside it. Open saved OBS footage at parent and individual track levels:
click Script words, click Timeline subtitles and play across speech/silence;
confirm audio position and active words agree. Open the timestamp editor from
the parent view and verify word selection still works.

Native browser/audio acceptance remains open. Earlier automatic approval review
rejected browser automation; no CUA/CDP/Playwright/headless workaround is used.
Tests here use the repository's jsdom runner, not the owner's browser.

Exact next development round: STT-GAP-02, reviewed recovered gap text and other
long/boundary/silence samples. STT-TIMING-ACCURACY-01 and Phase03 frozen budgets
remain open; UI clock repair does not improve or certify recognizer timestamps.
