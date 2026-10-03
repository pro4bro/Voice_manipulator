# LIVELINK-STT-12J — Source Absence Gate

2026-10-03. Bounded source-absence round passed. Wider LIVELINK-08 remains open.

## Reproduction and changes

- Backend regression failed with an empty `channelIntervals` list after native
  missing followed an already-missing heartbeat. Native regression failed at
  retained-prefix assertion after `sync({})` discarded queued PCM. The first
  native harness attempt required OBS initialization; the initialized baseline
  then reproduced the actual prefix-loss failure.
- Added native presence observations, callback boundaries, retained queues and
  counters through disappearance, restoration gap padding, ordered event
  delivery, and heartbeat-tolerant reducer application. Existing v3 contracts.
- First physical take exposed Timeline reporting an intentionally absent source
  as delayed receipt. New UI regression failed with `Đang nhận PCM · trễ 20s`.
  The fix distinguishes known absence and preserves unknown holes; a second
  physical take verified the built UI. ADR 0035; plugin/package 0.6.9.

## Automated checks

- Backend: `.runtime/python/core/python.exe -m pytest services/api/tests -q`:
  **494 passed**, two existing deprecation warnings, 148.76 seconds.
  Focused runtime/reducer suite: **44 passed**.
- Frontend from `apps/web`: `npm test -- --maxWorkers=2`: **54 files / 458
  tests passed**, 60.40 seconds. `npm run typecheck` and `npm run build` passed.
- Configured Visual Studio CMake build and CTest, RelWithDebInfo: **2/2 passed**,
  final 7.02 seconds. Native tests cover inventory baseline/new source/missing/
  restoration/identity changes and preservation of a two-second chunk plus its
  12,000-frame queued tail. Existing native tests and durable outbox checks pass.
- Package DLL equals the tested isolated DLL, SHA256
  `adb1609f1e6589baefdd84d365b00d4367ad4f6a9e918b10f3e294c582f7f1d7`.
  `git diff --check` passed. Upstream engines unchanged.

## Two physical OBS/browser takes

Isolated OBS 32.2.2, newly created looped fixture sources, 48 kHz stereo PCM.
Each take hides source A, restores the same UUID, then removes A before Stop;
B continues throughout. Live medium and detailed large-v3 STT run in the same
Studio process. No receipt-delay injection; frontend is the production build.
All temporary source/scene/output/Forward settings restored after each take.

| Evidence | First take | Built UI take |
| --- | --- | --- |
| Recording | `a14f1bc2-537d-5fc3-a7f3-a3457a4b7686` | `c1e78922-d272-5833-8d3e-be824fa96b2b` |
| Duration | 77.561 s | 66.258 s |
| A / B durable chunks | 39 / 132 | 28 / 91 |
| A captured PCM frames | 1,421,312 | 1,163,264 |
| A intentional absence gap | 780,307 frames | 634,252 frames |
| B captured PCM frames / gaps | 3,720,640 / 0 | 3,178,757 / 0 |
| Receipt p95 A / B | 1.337 / 1.109 s | 1.799 / 1.690 s |
| Sampled outbox peak / final | 4 / 0 | 4 / 0 |
| Last receipt after Stop | 1.276 s | 1.679 s |
| Live events / errors | 36 / 0 | 29 / 0 |
| Detailed published analysis frames A / B | 1,101,942 / 1,861,464 | 899,504 / 1,590,138 |
| Two-track FLAC MKA bytes | 1,602,684 | 1,351,234 |

Receipt age uses metadata UTC at handler entry, not durable ACK completion.
Both MKAs matched journal SHA256 and decoded every audio stream. Every PCM
chunk matched its hash, byte count, format and sequence; no sample overlaps.
A's only sample-index jump equals the native observed absence duration times
48 kHz, rounded down. Its final sample index equals the removal event's sample
boundary: the queued tail survived. Stem gap classification is `source-missing`,
never transport loss. B has no sample gap. Every native absence boundary/sample
counter exactly matches the journal. Restoration closes the first interval;
Stop closes the second interval. Stop has no fabricated terminal sample index.

All live checkpoints consumed every durable sequence, no open utterance or
duplicate final, and detailed STT published the available tails (within one
resampling frame of the final 24 kHz analysis WAV). Both models stayed resident:
Studio model-load count was 2 from warm-up through cleanup. Regression suites
ran before these takes, without competing physical capture/model work.

Browser observations: A and B lanes and provisional footage appeared during
recording. An absent source retained its earlier waveform; restoration resumed
the same lane. The built UI displayed `Nguồn đang vắng · PCM đã lưu` with 91
retained A bars while B had 143 bars. Saved waveform populated after window
changes without reload; the final wide view showed 312/600 bars and A's saved
`source-missing` gap. Missing historic sources without current PCM made no lanes.

Ignored evidence: `.scratch/livelink-stt-12j/{take,ui-after}` projects, native
logs, PCM, transcript journals, model preflight, reports and `acceptance.json`.
Cleanup verifies original scene `Scene`, output directory `D:/OBS_RECORD/1
MONITOR`, Forward settings, idle OBS, no lease, zero outbox and healthy API.
All isolated processes and the temporary browser tab were closed.

## Remaining gap / next round

The owner installation still needs Preferences Install/Repair and OBS restart.
This bounded check does not prove the natural 12H disk-stall cause, exact scene
edit/OBS video synchronization, scene-collection/crash control recovery, large
source counts, DPI or portability. Poll observation can lag an edit about one
refresh period; inventing an exact earlier boundary would hide uncertainty.

Exact next: **LIVELINK-STT-12K** — reproduce the remaining cold-start local
listener loss, distinguish API/Studio/controller failure from health-readiness
delay, and retain evidence for recovery. This matters because a successful
recording on an already warm runtime does not establish reliable startup.
