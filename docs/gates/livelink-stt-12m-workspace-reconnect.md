# LIVELINK-STT-12M — workspace reconnect

Date: 2026-10-03. Source baseline: `d5fef50`.

## Verdict and boundary

The same-document, paused archived-recording review gate passes. Selected
project/footage/track, Script word and scroll, Timeline recording and zoom survive
deliberate API exit and UI Restart all. Recovered Timeline polling clears its
own stale transport alerts. This is not a new simultaneous OBS/STT recording
gate, F5 persistence promise, transcript quality measurement or proof that the
historical natural listener loss and disk stalls are fixed.

## Diagnosis and repair

Two App regressions failed before repair: an unavailable runtime unmounted the
workspace, and a delayed post-restart project refresh did the same. App now
renders the selected project's stable workspace before loading/offline branches.
A sibling recovery dialog blocks interaction through `inert`, enters/traps
focus and restores focus when services recover. Project identity still controls
workspace replacement. Existing transcript cursors and merge behavior remain.

The first browser replay exposed a second defect: Timeline still displayed
`Pro4Bro workloads are stopped. Use Windows → Turn on all.` after recovery.
Two Timeline regressions reproduced stale status and recording-list alerts.
Those polling errors now have separate state and clear on their own successful
responses. A successful status does not clear an unrelated waveform failure.
The final browser replay verifies the stale alert disappears automatically.

## Independent corpus and service isolation

- Copied the real two-track 12D acceptance project from the independent 12L
  corpus into `.scratch/livelink-stt-12m/data/projects`, without hard links:
  **2,434 files / 138,097,106 bytes**. Embedded copied provenance paths point
  into this new project. Preferences are empty; models use installed offline
  runtimes. No new recognizer success or accuracy is claimed.
- Test controller/API/Studio use **18219 / 18220 / 18091** and a separate browser
  origin. Scratch wrappers change ports/module paths only. Studio source is
  copied into scratch before launcher sync; owner runtime folders are untouched.
- Owner listeners **18119=41576, 18120=29892, 18081=55688** remain unchanged
  through final cleanup. No owner OBS/plugin installation changes.
- Source-copy size/mtime checks remain unchanged for all 2,434 inputs. This is
  metadata evidence, not a new full-content hash audit of owner originals.
- Final cleanup confirms all three test ports free, no test session file,
  owner listeners unchanged. Test browser tab is closed after evidence capture.

Harness setup initially refused occupied owner ports. A scratch Studio port
override and Windows wrapper-path recognition were corrected before the gate.
One Hub locator used an inaccurate accessibility checkbox role; DOM showed the
actual button and the locator was corrected. Final artifact aggregation uses
explicit UTF-8 and retained logs/files after services stop. These harness issues
are not natural product listener failures.

## Real browser replay

The built UI opens the copied project and expands its materialized footage
into two selectable tracks. Historical fixture aliases are Track 17/18; this
round does not change track mapping/count semantics. Track 18 Script review
selects the last word (`Chọn từ và?`), scrolling its table to 122 pixels.

| Case | Deliberately exited API | Recovered API / Studio | Controller |
| --- | --- | --- | --- |
| Initial replay | 34316 | 69624 / 69000 | 43236, unchanged |
| Final replay after alert repair | 69092 | 33876 / 37516 | 68748, unchanged |

Both recover through the actual UI **Restart all** action. During outage the
workspace DOM remains mounted/inert and retains selection/scroll; keyboard
Tab/Shift+Tab remains in the recovery dialog. Final before/after observations:

| Retained field | Before | After |
| --- | --- | --- |
| Recording | `57703cdd-60de-5931-981b-22031a9d38d9` | Same |
| Track 18 selected | true | true |
| Script selected word | `Chọn từ và?` | Same |
| Script table scrollTop | 122 | 122 |
| Timeline zoom | 2 | 2 |
| Workspace inert | false before outage | false after recovery |
| Timeline transport alert | Present during outage | Absent after recovery |

Recovered API log accepts transcript reads with **afterRevision=144**, HTTP200;
there is no afterRevision=0 request in that restarted process log. Hook regression
also proves an existing utterance updates in place while another track appends,
without losing rows/revision across transport rejection.

After the initial recovery, first/last Script word selection scrolls to 0/122
pixels. Muted playback resumes both decoded track audio elements (readyState4,
times 25.056 / 25.032711 seconds); Timeline playhead reaches 24.917 seconds.
The sampled speech gap has no active word highlight, so automatic word highlight
during playback is not claimed. Final replay console warn/error entries are empty.
Final screenshot has the recovered workspace and no stale Timeline stopped alert.

## Retained media artifacts

The portable media index has one parent and two analysis children, all files
inside the copied project. Offline ffprobe after cleanup reports:

| Artifact | Bytes | Audio streams | Duration |
| --- | --- | --- | --- |
| source.mka | 7,536,547 | Two FLAC streams, each stereo 48kHz | 267.058 seconds |
| First analysis.wav | 12,818,214 | Mono PCM16 24kHz | 267.044500 seconds |
| Second analysis.wav | 12,818,842 | Mono PCM16 24kHz | 267.057583 seconds |

No audio conversion algorithm changes. The UI journal span is 268.723 seconds;
probe duration describes saved media, not an exact OBS video timing acceptance.
Browser playback demonstrates audio access after reconnect, not new clipping,
quality or source-boundary measurements.

## Verification and artifacts

- Red: two App lifecycle tests, then two stale Timeline polling-error tests.
- Green: **55 frontend files / 464 tests**, **20.90 seconds**; typecheck and
  production build pass. Six tests added across lifecycle, transcript resume,
  feed error routing and Timeline recovery. A required test prop omission caught
  by typecheck was fixed before the final complete gate. Diff check passes.
- Backend **500 passed / 182.90 seconds** is the carried 12L baseline, not a
  rerun this frontend-only round. Backend/Studio/native/engine source unchanged.
- ADR 0037 records lifetime/error decisions. Ignored
  `.scratch/livelink-stt-12m/acceptance.json` retains runtime observations,
  browser fields, transcript revision, media probes and cleanup. `final.png`,
  browser JSON snapshots, service logs, provenance and setup/manage scripts
  retain the physical replay evidence.

## Remaining gap and exact next round

This copied archived review does not prove interaction with provisional Media
Pool footage while OBS is recording or the owner's full independent-source
matrix. Natural 12F listener loss, 12H disk stalls, owner installation, exact
video timing and wider LIVELINK-08 source/UI/portability gates remain open.

Exact next: **LIVELINK-CAPTURE-10B**, the existing queued running-app live Media
Pool and independent-source gate. It tests ongoing capture behavior that a
successful archived reconnect cannot establish; no additional 12N round is
introduced. Voice Training phase status is unchanged.
