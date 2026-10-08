# USER-FEEDBACK-02 — Media Pool and pointer audio preview

2026-10-08. Bounded response to the owner's latest Media Pool, Queue and
Premiere-style scrub feedback. Code/UI semantics and synthetic interaction
checks are delivered; audible/device acceptance remains separate.

## Delivered

- The inert-looking root breadcrumb now says **Thư mục gốc**, matching its
  existing navigation to unfiled root footage. It works from nested folders.
- Main Import opens the browser multi-file chooser for the device in use.
  Existing in-app cache choices and independent import jobs remain. A separate
  Host import control keeps host paths and growing-MKV follow; picker exceptions
  now produce a visible workspace status. Main Import/folder buttons are 42px
  with 21px glyphs.
- Recycle, Restore and permanent Delete work consecutively without refresh.
  A request revision prevents an older full media response from undoing newer
  lifecycle actions. The revision remains after a fresh read acknowledges the
  action, because an older response may still arrive later. Parent/child
  lifecycle writes and permanent-removal fences are retained.
- STT/DIA checkboxes show activity and accessible busy status for queued/active
  work. Parent footage aggregates child tracks. Training uses pending/running
  speaker runs matched to footage/word speaker assignments. It is a speaker
  participation indicator, not measured per-footage training percentage; the
  current run API does not include frozen manifest source IDs. Reduced-motion
  mode retains a static activity marker.
- One audio preview controller covers normal Timeline left waveform/playhead/
  transport drag, promoted middle-button timing, imported multitrack and
  archived OBS drags. It preserves gain/mute, restores playback rate, stops on
  release/cancel/source cleanup and fences delayed play. Pointer time remains
  authoritative over native playback events. Removed regions are silent and
  preview duration is capped at the next excluded boundary.
- [AI Queue proposal](../AI-QUEUE-PROPOSAL.md) documents one module with filtered
  tabs, parent/track hierarchy, Training speaker runs and TTS rows, followed by a
  durable global dispatcher. This round does not implement the unified Queue.

## Evidence

Regression-first: paused left waveform drag called seek without play; its test
failed before implementation and passed afterward. An STT terminal refresh
overwrote a newly recycled row; the sequential lifecycle regression failed
before the fence and passed afterward, including newer-ack-before-old-response.
Tests cover browser input click/multi-file flow, visible host-picker error,
immediate recycle/restore/delete, active checkbox states, normal/middle/imported/
OBS scrub, seek coalescing, newest in-flight target, stationary stop, preserved
mute/rate, delayed play after release/new drag/excluded region and cut boundary.

Final frontend: **593 tests / 68 files** (includes the pre-existing ignored
`.scratch/footage-switch.performance.test.tsx`; tracked suite is 592/67).
`npm run typecheck` and `npm run build` pass. Final build: 114 modules;
JS750.97kB/gzip216.56kB, CSS247.53kB/gzip38.28kB. `git diff --check` passes;
Git reports only the existing Windows LF/CRLF conversion notices.

First full API run: 676 passed, one readiness timing failure, two existing
warnings. The initial listener evidence consumed a cold two-second test budget,
leaving `probe=not-probed`; no API/launcher source changed in this round. All
three readiness tests passed independently in 11.02s. Final full API rerun after
frontend work finished: **677 passed, two existing warnings in 201.45s**.
The first-run timing caveat remains recorded rather than discarded.

## Remaining acceptance — UX-EDITING-DEVICE-01

The earlier browser tool policy rejection remains; no browser/CDP/shell
workaround was used. This round issued no normal-service start/stop/restart or
model/GPU work and changed no owner media. A closing read-only inventory found
the normal controller/API/STT listeners on18119/18120/18081; their processes
predate this round (17:23 local). They were left running. Native chooser
interaction, visible theme/icon sizing and actual
audible smoothness require authorized browser/device evidence. Native media
seeks depend on buffering. The implementation previews short forward audio at
each pointer position; reverse PCM playback or Premiere's internal DSP is not
claimed. Live OBS without archived audio remains non-playable.

Owner check after reopening the updated app:

1. Main Import chooses several completed files from the device; Host import
   selects a host file or growing MKV, and cache choices appear in the app.
2. Enter a nested folder and use Thư mục gốc to return.
3. Recycle a disposable footage, immediately Restore, Recycle again and Delete
   that disposable copy, including while a background status refresh runs.
4. Queue STT/DIA/Training and observe appropriate checkbox activity, including
   parent/track activity. Stop and verify activity ends on terminal status.
5. With paused spoken audio, drag waveform/playhead and middle-align words;
   hear the word at the pointer, release to silence, then check normal Play,
   gain/mute and excluded regions. Repeat imported tracks and archived OBS.

Older physical mic/OBS, real-load responsiveness, quality/identity, saved-file
download/cancel and second-machine LAN/Tailscale gates remain open. This round
does not advance Phase03 acceptance budgets.
