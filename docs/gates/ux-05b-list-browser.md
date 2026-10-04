# UX-05B1 — copied-project list and playback browser gate

Date: 2026-10-04. Source baseline: `9a7339f`.

## Scope and fixture

This bounded round exercised the running browser on a complete copy of the
UX-08B two-recording project at `.scratch/ux-05b/project`. The 431 copied files
total 37,237,491 bytes. The source at `.scratch/ux-08b/retained-before-delete`
was not edited. Three disposable Speaker Profiles, three one-second mono 24 kHz
PCM16 Voice Outputs and three Script rows populated the lists. Synthetic tones
serve selection behavior only, not voice quality.

## Observed browser behavior

- Sound Library: Shift range selects all three profiles, Ctrl toggles one, and
  Ctrl+A selects all. Bulk color changes every selected avatar to `#228866`.
- Voice Output: Shift range selects all three generated rows, Ctrl toggles one,
  and Ctrl+A selects all. Permanent bulk deletion is not claimed.
- Typed Script: Shift range, Ctrl toggle and Ctrl+A select the expected three
  rows. Bulk speaker assignment changes all selected rows to Speaker B.
- One copied OBS recording moves to Recycle Bin through the visible Media Pool
  menu. It remains viewable with its Script and two playable audio tracks while
  recycled; Restore returns both parent footage rows. A second recycle prepares
  the permanent-delete check. Its confirmation and post-restart tombstone gate
  remain open.
- The other OBS recording opens with two audio elements at readyState 4 and
  43.773-second duration. Clicking the overlap seeks both to 22.201 seconds
  without autoplay. Space starts and pauses both tracks; dragging the Timeline
  seeks both to 35.002 seconds while paused. The same Script and waveforms remain
  visible in light and dark themes. No repeated loading state was observed in
  these interactions.

SHA-256 comparison of all 132 copied `.mka`, `.wav` and `.pcm` files against the
untouched source finds zero mismatches. This verifies media preservation for
the tested actions, not every metadata record or live recording boundary.

## Verification and remaining gate

Full backend: **561 passed**, two existing deprecation warnings. Full frontend:
**477 passed / 56 files**. `npm run typecheck` and `npm run build` pass. There is
no production-code change in this round.

The UX-05B parent remains open: browser permanent deletion and restart must
prove the copied journal cannot rediscover the removed footage; pending-footage
navigation was not exercised; Voice Output bulk deletion was selected but not
executed. The running UI confirmation policy requires action-time approval for
irreversible deletion, which was requested for the copied recording only. Do
not infer the outcome from API or unit tests. Exact next bounded UX scope is
UX-05B2 after that approval: perform the UI deletion, restart/reopen, verify
the surviving recording's media/transcript, then cover a pending-footage
fixture without mutating owner media.
