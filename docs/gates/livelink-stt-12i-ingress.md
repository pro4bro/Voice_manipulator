# LIVELINK-STT-12I: PCM receipt cost and backlog chunk ceiling

Date: 2026-10-03

## Scope and method

Profile the renewed 12H backlog while the browser polls Media Pool, Script and
Timeline, then reduce a measured fixed receipt cost. Product change: native
plugin/package 0.6.8 consumes up to two seconds of already queued PCM, capped
at 96,000 frames. It does not wait for a full chunk or change the 250 ms
spool drain. Native FULL source/ACK transactions and both API durable flushes
remain. No API, project schema, UI or engine changes. See ADR 0034.

All takes use isolated portable OBS 32.2.2, two existing speech fixtures,
48 kHz stereo capture, browser workspace polling, live `medium` and detailed
`large-v3` STT. Studio stays in one process; both models are warmed before
recording. Scratch probes measure chunk handler, lock acquisition, concurrent
PCM/metadata preparation, each write/fsync, atomic replacement, waveform
projection, capture state and waveform responses. They do not log credentials,
PCM or transcript content and are not product changes.

Ignored evidence is in `.scratch/livelink-stt-12i`: `stages.jsonl`, each run's
`state.json`, `samples.jsonl`, `report.json`, `stage-report.json`,
project PCM/journals/STT/MKA, `comparison-prefix.json`, `acceptance.json` and
`cleanup.json`. Browser observations are sampled DOM/SVG state, not continuous
frame or compositor measurements.

Receipt age is the wall-clock `receivedAtUtc` minus capture time inferred
from the recording start and chunk monotonic timestamp. It is measured from
the chunk's first sample and excludes the following file flush and ACK
transaction. Last receipt after Stop is also a receipt-start measurement,
not an exact final durable-ACK or archive-publication timestamp.

## Reproduction and measured cause

The first unchanged 0.6.7 take ran 202.777 seconds and did **not** reproduce
12H's severe natural stall: receipt p95 was 2.968/3.308 seconds, pending peak
10, final 0, last receipt 3.215 seconds after Stop. Saved waveform survived
rewind (600 bins each), return to live, Columns/Layer and zoom. The live tail
had 455 bins each at archive handoff. This variability prevents claiming the
precise trigger of the natural 12H stall has been isolated.

Across its 615 chunk handlers, concurrent PCM/metadata pair preparation and
publication consumed 84.414 of 98.674 seconds (85.5%). Handler median/p95:
148.70/280.18 ms; pair: 124.22/237.45 ms; PCM fsync: 89.09/169.71 ms;
metadata fsync: 97.69/174.88 ms; replace: 1.17/2.16 ms; waveform projection:
7.79/21.37 ms; runtime lock wait: 0.01/0.09 ms. Concurrent fsync times must
not be added as if they were sequential handler stages.

To reproduce insufficient receipt throughput deterministically, the scratch
API adds 400 ms before each pair write while preserving the real writes and
flushes. The delay remains enabled through Stop drain in both comparison
takes. This is a controlled fixed-cost pressure test, not a claim that the
owner's disk always takes 400 ms or that waveform polling alone causes it.

| Measurement | 0.6.7 with delay | 0.6.8 with same delay |
| --- | --- | --- |
| Take duration | 123.372 s | 204.330 s |
| Chunks, track 1 / 2 | 180 / 180 | 160 / 160 |
| Mean audio per chunk | 0.685 s | 1.277 s |
| Receipt p95, track 1 / 2 | 125.713 / 126.278 s | 30.985 / 31.477 s |
| Receipt p95 for first 120 s of audio | 122.526 / 123.098 s | 20.798 / 21.664 s |
| Sampled pending peak / final | 182 / 0 | 43 / 0 |
| Last receipt after Stop request | 134.400 s | 32.570 s |
| Handler median / p95 | 497.95 / 564.82 ms | 499.15 / 556.62 ms |

Per-request cost stays similar; fewer requests carry the audio. Chunk count
per captured second falls by about 46%. The native backlog regression first
failed at `chunk->frames == 96000`, then passed with the new ceiling. The
physical pressure run demonstrates reduced backlog even over a longer take.
Separate fixture phases, OBS restart and disk scheduling still limit causal
attribution of every latency difference.

The pre-change harness timed out waiting 120 seconds for archive readiness.
Its restoration block ran, the retained outbox continued draining, and the
archive subsequently became ready and decoded. It is not a passing harness
exit. The post-change harness completed with an empty outbox and ready MKA.

The delayed post-change browser retained 600 bins each on rewind. At
03:53:50 UTC, its live window had
343 bins each and reported 14 seconds of pending audio. At 03:55:35 UTC,
zooming to 172.5–202.5 seconds showed no saved PCM yet. It automatically
showed 487 bins each in the final window after archive handoff. The pressure
test **still** delays the visible tail; it does not establish zero lag.

## Final verification

The final 0.6.8 quiet take ran 201.191 seconds. Both tracks retained 245
contiguous chunks; receipt p95 was 1.577/1.885 seconds, sampled pending peak
5 and final 0, last receipt 3.307 seconds after Stop. These are separate
physical takes, not a controlled disk/cache comparison against the first
quiet run. In the final minute, live Layer had 466 bins each; zoom retained
468 bins each with no empty/pending label. After Stop, the 172.5–202.5-second
window automatically had 574 bins each, 371/139 nonzero, without reload.

All four takes passed source PCM byte-length/hash and sequence/sample-index
continuity checks: no gaps or overlaps. Each MKA matched its journal hash,
decoded both FLAC 48 kHz stereo streams and retained its embedded manifest.
Archive sizes: 5,589,413 / 3,550,969 / 5,751,610 / 5,685,236 bytes. Live
checkpoints reached every retained sequence with no open utterance, error
events or duplicate finals; event counts: 107 / 65 / 103 / 110. Detailed STT
published every available 24 kHz analysis frame, including the Stop tail:

| Take | Track 1 / 2 published analysis frames |
| --- | --- |
| Quiet before | 4,866,628 / 4,866,644 |
| Delayed before | 2,960,920 / 2,960,896 |
| Delayed after | 4,903,916 / 4,903,914 |
| Quiet after | 4,828,574 / 4,828,575 |

Studio model-load count stayed 2 from preflight through the recording cleanup,
with `medium` and `large-v3` resident in the same process. Full regression
suites run after physical recording, so any test-triggered model load is
outside this acceptance interval. Test OBS scene/directory/visible Forward
choices were restored, browser lease released, SQLite outbox empty and API
healthy. Startup initially encountered the isolated OBS unclean-exit sentinel;
its marker directory was preserved in scratch before retry. No owner OBS
configuration or installation was changed.

Native build/package and CTest: 2/2 passed (6.90 seconds); only existing OBS
header C4201 warnings. Regression checks include two-source backlog ordering,
immediate partial delivery, exact Stop packet clipping, four-source sample
continuity, capture-to-durable-spool recovery and ACK atomic rollback.
The tested isolated DLL matches package SHA-256
`dcf8e4f64006a66637f1af760a230b69b8775be1c41477c6c9830f765772ce3d`.

Full backend: 493 passed, two existing deprecation warnings (152.90 seconds).
Frontend: 54 files / 457 tests passed with `--maxWorkers=2` (57.57 seconds).
Typecheck, production build and `git diff --check` passed. No tracked upstream
engine changes. Temporary delay/probes remain only in ignored scratch.
After tests, Studio reported one additional `tiny` load (count 3), outside the
recording interval; saved separately in `studio-after-tests.json`. All owned
test processes were stopped and ports 18081/18120/18119/4455 released.

## Remaining scope

Arbitrary storage stalls can still outrun the sender. The exact natural 12H
stall trigger, cold startup, runtime reconnect/Script follow, native idle/Start
overflow attribution and the wider source/DPI/clean-machine matrix remain
under LIVELINK-08. Recognition accuracy is not measured by complete PCM or STT
checkpoints. Owner installation of 0.6.8 still requires Preferences
Install/Repair and OBS restart; only the isolated test installation is changed.

Exact next round: **LIVELINK-STT-12J**, persist absence timing when a newly
added source disappears mid-take. Its retained PCM/lane and source-missing
interval are separate acceptance requirements.
