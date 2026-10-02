# LIVELINK-STT-12G — PCM ACK cost with the browser workspace open

Date: 2026-10-03
Result: sustained two-track data/latency gate passed; live waveform UI gate open.

## Changes

- Plugin 0.6.7 commits explicit outbox ACK IDs once per bounded send burst,
  instead of flushing a deletion for every chunk. SQLite FULL durability,
  source PCM/metadata flushes, duplicate replay and Stop clipping are retained.
- Heartbeats durably replace the recording-folder locator only when its
  contents change or need recovery. No persistent schema or public HTTP
  contract changes. ADR 0033 records the replay and transaction semantics.
- Native logs include ACK commit count and elapsed milliseconds.

## Method and reproduction

Used an isolated API registry and two portable copies of official OBS 32.2.2.
The first loaded plugin 0.6.6; the second loaded the built 0.6.7 DLL. Test
scenes looped the same two Vietnamese speech WAV fixtures from the 11C gate.
Only those two active sources were forwarded. The in-app browser kept Input,
Script, Media Pool and Timeline open, with the normal status/waveform polling.
Both models were warmed before recording; Studio retained the same process.
The status check before the second take reported both models and
`model_load_count=2`; cleanup reported both models and a count of 5. The logs
do not locate those additional loads, so continuous model residency is not
established and model/cache effects remain a comparison limit. Detailed STT started at
37.1/36.3 seconds, with 60-second blocks and the existing padding policy.
Neither take restarted the API while recording.

Scratch wrappers timed API chunk handling, the shared runtime lock, durable
PCM/metadata preparation, waveform projection and capture evidence writes.
The second API also timed HTTP request handling through ASGI. Native HTTP
and ACK timings came from OBS logs; the first plugin did not log ACK stages,
so its deletion cost was measured separately using the real Windows native
spool class. A 30-chunk replay with a recording-folder heartbeat exercised the
redundant locator flush. It measured 77 ms median heartbeat time and 105 ms
median PCM-pair preparation before the fix. A later quiet replay took 4.145
seconds versus 8.735 before; a replay during model loading took 15.685 seconds
and is excluded from the quiet comparison. Disk timings vary with other work.

The test harness retries transient HTTP errors, writes state atomically and
waits for OBS output shutdown before restoring its recording directory. It
completed the planned duration in both takes. Tests/builds ran between takes,
not during their recording intervals. Browser probes logged event receipt and
two-animation-frame callbacks for text-bearing rows; intersection with the
Script list distinguished visible from offscreen rows. Only the first frame
per revision is counted. These are frame-boundary proxies, not compositor
presentation measurements. Raw tuples are revision, receipt milliseconds
since recording Start, first-frame milliseconds, and viewport intersection.

Reproduction/evidence in ignored `.scratch/livelink-stt-12g`:

- `profile_api.py`, `replay.py`, `bench-spool.cpp`, `summarize.py`;
- `baseline/` and `optimized/`: `obs_take.py`, `state.json`, `samples.jsonl`,
  `report.json`, `browser-timings.json`, `timing-report.json`, event monitor;
- `stages.jsonl`, native OBS logs, API logs, benchmark JSON and model warmup;
- project-owned PCM, chunk/envelope metadata, recording journal, two-track
  MKA, transcript events, per-track live checkpoints and detailed STT state.

## PCM and artifact results

| Measurement | Before | After |
| --- | --- | --- |
| Recording duration | 174.830 s | 171.477 s |
| Committed PCM chunks, source 1 / 2 | 255 / 256 | 257 / 258 |
| PCM format | 48 kHz, stereo, s16le | same |
| Sample gaps / overlaps | 0 / 0 on both | 0 / 0 on both |
| PCM receipt median, source 1 / 2 | 22.368 / 21.551 s | 1.223 / 1.421 s |
| PCM receipt p95, source 1 / 2 | 49.012 / 49.263 s | 2.157 / 2.520 s |
| PCM receipt maximum, source 1 / 2 | 52.510 / 52.216 s | 2.957 / 3.379 s |
| Last PCM receipt after Stop request | 52.344 s | 2.670 s |
| Native pending peak, sampled every 5 s | 99 | 7 |
| Final outbox count | 0 | 0 |
| MKA bytes | 4,905,417 | 4,784,728 |
| Archive journal hash / all-stream decode | passed / passed | passed / passed |
| Live event count / error-status events | 91 / 0 | 93 / 0 |
| Live checkpoint next sequence | 255 / 256 | 257 / 258 |
| Duplicate final utterances | 0 | 0 |
| Detailed STT analysis frames, source 1 / 2 | 4,195,894 / 4,195,908 | 4,115,449 / 4,115,442 |

Every PCM length/hash and sequence was checked. Live checkpoints have no open
utterance and reach each committed tail. Detailed published cursors equal the
available 24 kHz timeline frames computed from native PCM and Stop bounds;
both tracks published. Both MKA archives contain two independent FLAC streams.
Recordings are `4073aa70-ebb4-5111-8af5-55bc5ca602b8` and
`a34c6fd0-2c72-5e73-9d41-4aafeafe1302` respectively.

## Stage findings

| API stage, median / p95 / maximum | Before | After |
| --- | --- | --- |
| Chunk handler | 159 / 368 / 4,040 ms | 143 / 266 / 1,153 ms |
| PCM + metadata durable preparation/publication | 136 / 339 / 4,009 ms | 122 / 231 / 1,131 ms |
| Waveform note | 8 / 31 / 672 ms | 7 / 19 / 65 ms |
| Runtime lock acquisition | <1 / 1 / 4 ms | <1 / <1 / 4 ms |
| Capture evidence update | <1 / 47 / 292 ms | <1 / 47 / 132 ms |
| ASGI PCM request | not instrumented | 159 / 337 / 1,164 ms |

The baseline has 512 chunk attempts for 511 committed sequences, including a
retry; the second take has 515 attempts/commits. Durable pair preparation took
85.406 of 98.400 handler seconds before and 69.529 of 80.068 afterward. It
remains the largest API stage. Lock acquisition and waveform computation do
not explain the backlog. The unchanged-folder flush is an independently
reproduced cost; physical baseline heartbeat sync was usually milliseconds,
so do not attribute its 49-second receipt age to folder writes or browser
polling alone.

Native benchmark: 40 ACK deletes took 1.488 seconds individually and 0.773
seconds in batches of four. Both retained `synchronous=FULL`. This measures
the deletion seam directly. Separate physical takes also differ in fixture
phase, cache state, exact duration and disk scheduling. The comparison supports
the change and demonstrates a healthy sustained take on this machine; it does
not isolate every source of the larger end-to-end improvement.

## Browser caption timing

| Measurement | Before | After |
| --- | --- | --- |
| Events received by browser | 91 / 91 | 93 / 93 |
| First measured text-row revisions | 58 | 62 |
| First-frame revisions intersecting Script viewport | 8 | 10 |
| Receipt-to-frame median / p95 / maximum | 33 / 51 / 65 ms | 33 / 67 / 103 ms |
| Text event audio age at receipt median, source 1 / 2 | 26.977 / 24.151 s | 4.210 / 3.864 s |
| Text event audio age at receipt p95, source 1 / 2 | 54.090 / 54.030 s | 8.729 / 5.819 s |
| Visible first-frame audio age maximum, source 1 / 2 | 16.662 / 4.278 s | 7.885 / 5.855 s |
| Visible first-frame samples, source 1 / 2 | 6 / 2 | 7 / 3 |

All events reached the browser; later rows were generally offscreen. A low
receipt-to-frame time does not imply that an offscreen row was visible to the
owner, nor does complete PCM/checkpoint evidence establish recognition accuracy.

## Validation and remaining work

- Backend: 493 passed, two existing deprecation warnings.
- Frontend: 54 files / 455 tests passed with `--maxWorkers=2`.
- Typecheck and production build passed after temporary UI probes were removed.
- Native build/package 0.6.7 and CTest: 2/2 passed. Only upstream OBS header
  C4201 warnings were emitted. Tests cover crash-before-ACK retention, rollback,
  batch commit/reopen and rejected PCM preservation.
- The folder regression first failed (5 writes instead of 1), then passed
  along with change/restart/reconnect/corruption recovery.
- Restored test OBS scene, directory and original visible-source Forward
  choices; released the browser lease and stopped the isolated test processes.
  The owner's installed OBS plugin was not replaced; the new package is ready
  for Preferences Install/Repair and an OBS restart.

Live Timeline still sometimes showed empty/pending waveform for the active
sources despite successful PCM receipt and a full waveform API response with
nonzero extrema. In the second take it also showed two historical removed
sources in addition to the two active sources; after archive handoff only the
two real tracks remained and their MKA waveforms rendered. The precise live
UI cause is not claimed established here. This reproduces a presentation gap
under low PCM latency and must be fixed before saying the owner's waveform
complaint is resolved.

Exact next: **LIVELINK-STT-12H** — reproduce and repair live waveform clearing
and historical missing-source lanes, then verify the recording tail in the
browser with the improved ingress path. Cold model startup, runtime reconnect
and Script follow behavior, broader source count/DPI, portability and the
clean-machine matrix remain under LIVELINK-08.
