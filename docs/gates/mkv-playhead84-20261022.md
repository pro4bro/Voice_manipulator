# Round84 — Growing MKV playhead stability (2026-10-22)

Scope: UI-08. Owner reports that dragging a playhead on an imported recording MKV
returns it to its earlier position. One bounded ImportedMultitrackTimeline round;
ADR0132 records pointer/media ownership and resource revision behavior.

## Reproduction and cause

`.scratch/playhead84/drag-red.log` reproduces two failing Layer/Column cases. An
audio element knows60s; the growing footage publishes120s during the drag. The
pointer selects96s, but the element clamps its seek to60s. Its subsequent
timeupdate changes the UI back to60s and could persist that unwanted coordinate.
The minimized replay uses the actual component, scrubber, refresh, pointer and
resume mechanisms; it does not require changing selection or moving the viewport.

Ranked checks were cached/paused media events, scrub lifecycle cancellation on
source polling, and resume/viewport restoration. The held coordinate is correct
until timeupdate; changing only clock ownership makes both drag cases pass
(`clock-probe.log`). Base audio URL remains unchanged as PCM grows (`pcm-red.log`).
updatedAt in the hook source key separately ends audition during a payload poll.

## Change

- Pointer and paused position retain authority; only active primary playback
  advances the clock. Existing visible-track checks stay intact.
- Scrubber lifecycle uses stable track IDs/base URLs. Payload polling preserves
  the gesture; actual source removal/switch/unmount still stops audition.
- Followed MKV audio URLs include analysis-path/duration revisions. PCM growth or
  final publication reloads media; transcript-only updatedAt does not reload it.
- New resource metadata restores held position/audition before its clock may
  advance. A separate red case catches18.5→0 during resource loading
  (`metadata-red.log`).
- A new scrub invalidates pending full Play activation. The red case otherwise
  starts two channel plays after release (`activation-red.log`).

No backend, shared scrubber, engine, dependency, source media or persistent-format
changes. Existing full-fit and safe-edge pan behavior remains.

## Tests and review

Focused closure passes77 tests/4 files/9.16s (`focused-closure.log`), including
all43 imported Timeline cases, shared audio scrubbing, ordinary navigation and
registry selection. Script playback parity passes16/16/6.16s separately
(`script-clock-closure.log`). New six regressions cover the paths above.

Three existing test fixtures emitted media timeupdate while playback was paused:
imported resume persistence, initial edge-pan placement and the registry Script
clock case. Resume/registry now start Play explicitly; edge-pan starts from an
actual pointer seek. Their original assertions remain, including position,
per-source persistence, safe-edge hold and Script word ownership. First focused
and full failures are retained. No assertion, timeout or threshold is relaxed.

The first typecheck catches nullable playbackUrl at the audio src prop; using its
supported undefined value fixes the type without an assertion/suppression.
`typecheck.log` retains that failure; `typecheck-closure.log` passes. Production
build passes212 modules/424ms (`build.log`).

Five-axis review covers pointer/primary ownership, stable source versus resource
identity, bounded metadata-map cleanup, unchanged local media routes and no reload
on transcript-only refresh. Isolated mutation inverts the growing revision guard;
the resource-refresh regression fails as intended (`mutation.log`).42 unrelated
cases are filtered by test name only. Product SHA before/after remains
`0fe9d53ad8b38f728fb197244480f57f0ad188be02382c5f493e5ff59d9f9a11`.

## Real-media and browser boundary

Local browser use is disabled in Work settings at this round's check. No new
browser/device success or screenshot is claimed. Component event tests exercise
the drag/reset behavior; the independent real-media proof below checks the
container, actual audio endpoint and WAV revisions without owner project writes.

The actual follower imports two AAC tracks from a partial MKV, appends complete
Clusters and finishes the container. Their base audio endpoints stay the same
while WAV duration grows2.925625→11.702625→24.032666666666668s on the first track.
All six revision-query/Range reads return206 with the advertised PCM frame counts.
Final tracks are24kHz mono PCM16/576784 frames, and the source-final container hash
matches the original. See `media-probe.json` and `media-probe-recheck.log`.

The first media probe assumed a44-byte WAV header and failed on the final FFmpeg
file's additional chunks (`media-probe.log`). Reading the first4096 bytes handles
the valid extended header; no product media/parser was changed for the probe.
Both runs use disposable projects, no STT/model jobs and no owner project writes.

## Full closure and remaining verification issue

Final frontend suite passes1215/150 files/177.12s
(`frontend-full-recheck.log`). The first full run's1214 pass/1 Script clock fixture
failure/182.97s remains in `frontend-full.log`; its original assertions pass after
starting playback explicitly. Typecheck/build, focused tests, real media and
isolated mutation pass. No skips, suppressions or acceptance limits are changed.

Full API is **not green**:1317 pass/1 fail/3 existing warnings/615.14s
(`api-full.log`). The failure is
`test_portable_update_entrypoints.py::test_update_stops_controller_holding_api_directory[True-False-False-False]`.
Its disposable-process remapping did not preserve the live source process: the
postcheck reports source API PID54648 stopped, and controller/API/Studio became
unavailable. The exact termination path remains unproven. No backend or portable
product/test edits are made or asserted successful in this round. This is an open
verification containment issue, not waived or hidden by a green rerun.

The failed wrapper is retained as `portable-apply-running-failed.ps1`, with local
issue `portable-test-isolation-issue.md`. Do not repeat that test against the live
stack until termination is fenced before any call to fixture-owned process trees;
retain its protected-process postcheck. No live rerun is attempted here.

Canonical `scripts/pro4bro-console.ps1 start` restores the app in a hidden owned
console. Its logs are `runtime-recovery.out.log`/`runtime-recovery.err.log`.
Controller/API/Studio are running, busy=false,lastError=null; `/api/health` is ok
and the managed API serves `index-BMWBk2b4.js` (`runtime-health-restored.json`).
Recovery rebuilt the same212-module bundle in554ms. Recovery console6064 remains
alive to own the restored stack. Probe/mutation processes have completed; their
scratch artifacts remain for review. Browser/device UAT and the portable-test
containment issue remain open.

Phase03 stays60%, Phase06 open; no STT default or portable release change. Stop84
after verification, documentation and commit/push.
