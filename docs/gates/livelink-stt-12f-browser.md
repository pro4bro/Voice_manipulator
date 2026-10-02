# LIVELINK-STT-12F — browser caption timing

Date: 2026-10-03. Diagnostic round on `ce31ac9`; no product behavior change.

## Method and evidence boundary

Two looping speech fixtures from the 11C acceptance run were played through
the installed 0.6.6 plugin in OBS 32.2.2. A separate portable OBS copy kept
the owner's installed OBS configuration intact. The browser used the runtime
controller at port 18119 and owned the workspace lease.

Temporary probes measured:

1. PCM receipt from each committed chunk's metadata.
2. Live recognition request duration, semaphore wait and latest-chunk queue wait.
3. Transcript event persistence after its flush.
4. Browser receipt of that event.
5. A double `requestAnimationFrame` callback, checking that the row exists and
   intersects both the Script list and the viewport.

The last measurement is a render-boundary proxy, **not compositor presentation
time**. Multiple events in one poll can collapse into the latest row revision;
those earlier revisions have a receipt measurement without a frame measurement.
An existing row outside the list viewport is recorded as offscreen, not visible.
Audio age means wall time minus recording start minus the event's audio end.
It is not delay from the start of an utterance, nor a word-timestamp quality score.

All probes were restored from byte-for-byte backups before verification.
Fixtures, recordings, logs and harnesses remain ignored under:

- `.scratch/livelink-stt-12f-physical`
- `.scratch/livelink-stt-12f-warm`
- `.scratch/livelink-stt-12f-controlled`

## Cold startup and restart take

The first take lasted 234.233 seconds, with live `medium`, detailed `large-v3`
started about 36 seconds in, and an API restart about 120.6 seconds in.
Studio was cold. Model construction reported 80.962 seconds for `large-v3`
and 43.204 seconds for `medium`. The first live request exceeded its 60-second
timeout and wrote one error-status event with an empty error string. Counting
only nonempty error strings would incorrectly report zero errors.

Both tracks retained 350 contiguous 48 kHz stereo PCM chunks with zero sample
gaps or overlaps. The 6,436,215-byte MKA matched its journal SHA-256 and decoded
both FLAC streams. Both live checkpoints reached 350, with 119 events and no
duplicate finals; detailed STT published 5,621,602 analysis frames per track.
This does not establish complete live text: the timed-out opening utterance
has an error event even though its source PCM remains available for detailed STT.

PCM ingress p95 was 63.405/63.699 seconds. The spool was empty after recovery;
the final PCM receipt was 65.872 seconds after Stop, and live checkpoints reached
the tail about 151.6/154.8 seconds after Stop. This cold take is not comparable
to the warmed 12E latency result.

The API listener recovered in 9.756 seconds and stayed healthy for 18 samples
over 90 seconds. The test launcher registered its new PID only after those
samples. Consequently the controller classified it as foreign during that
interval. That registration delay is a harness fault and was corrected before
later attempts. The app also unmounted its workspace when runtime status became
partial; after recovery the source selection returned to Microphone. The full
offline interval must not be attributed solely to that product behavior.

## Interrupted warm attempt

A later detached launch was healthy for its initial samples but no longer had
a listener when work resumed. A foreground retry also lost its listener while
its Python process remained alive. Their root cause was not isolated. Startup
logs also showed recovery workers for numerous older projects, so the attempt
cannot represent only two active tracks competing for a warmed model.

The interrupted 161.744-second take was recovered in a separate API data root
containing only its project locator and relevant copied machine state. Its
193/196 PCM chunks were contiguous, the 4,480,085-byte two-stream MKA passed
hash/decode checks, and checkpoints reached both tails. It emitted 89 events
including one empty-string error event. Detailed STT had not been started.
Its outage/catch-up timing is excluded from the warm browser comparison.

## Controlled browser measurement

After the previous take's spool and live queues drained, both recognizers were
warmed and remained resident. A new two-track take ran in that isolated data
root with the Script visible. Detailed STT started at 36.6 seconds, using
60-second blocks. No API restart was requested during this take.

The harness received an `httpx.RemoteProtocolError` on a status request and
entered cleanup, stopping recording at 70.804 seconds. The API listener remained
healthy afterward. This request failure is distinct from the earlier listener
loss. The planned 170-second duration was not achieved. Stop wall time for
analysis was derived from the journal's monotonic boundary because the failing
harness did not save the exact Stop RPC timestamp.

| Measurement | Speech fixture 1 | Speech fixture 2 |
| --- | ---: | ---: |
| PCM chunks / live checkpoint | 104 / 104 | 104 / 104 |
| PCM sample gaps / overlaps | 0 / 0 | 0 / 0 |
| Nonzero PCM chunks | 61 | 54 |
| PCM receipt age median / p95 | 16.245 / 33.210 s | 17.056 / 33.964 s |
| Live recognition request median / max | 1.938 / 14.234 s | 1.484 / 3.141 s |
| Live semaphore wait maximum | 0.000 s | 0.187 s |
| Latest chunk queue wait maximum | 3.547 s | 0.469 s |
| Visible frame audio age median / max | 11.151 / 23.123 s (9 samples) | 9.850 / 10.321 s (3 samples) |
| Any rendered row audio age median / max | 19.870 / 54.379 s | 28.777 / 35.402 s |

All 35 events reached the browser; 26 resulting row revisions were measured at
the frame boundary, 12 intersecting the viewport and 14 offscreen. Persistence
to browser receipt had median 0.485 seconds, p95 1.171 and maximum 1.283.
Receipt to frame had median 0.039 seconds, p95 0.115 and maximum 1.882.
These samples cover both recording and its catch-up tail and are too few for
a general latency guarantee or a same-load comparison with 12E.

Two concrete peak decompositions:

- Visible final revision 19 represented audio ending at 33.535 seconds and
  reached the frame boundary 23.123 seconds later: 14.886 seconds to the matching
  PCM receipt, 5.072 from receipt to event persistence, 1.283 to browser receipt,
  and 1.882 to the frame callback.
- Offscreen final revision 35 represented the Stop boundary and took 54.379
  seconds: 33.999 to PCM receipt, 19.369 to persistence, 0.976 to browser receipt
  and 0.035 to the frame callback. A recognition request in this tail lasted
  14.234 seconds despite the model cache remaining warm.

The dominant measured delay is before browser receipt. Browser render time
alone does not explain these peaks. PCM transport/persistence and recognizer
contention both remain relevant; this round did not isolate the slow ACK stage
or prove that browser polling caused the slower ingress. New Script rows also
fell below the list viewport. One manual End scroll was used; no automatic
follow behavior was added.

The final 2,036,378-byte MKA matched its journal hash and decoded two 48 kHz
stereo FLAC streams through Stop. Both live checkpoints reached sequence 104,
with zero error events and zero duplicate finals. Detailed STT published the
full 1,699,284/1,699,285 analysis frames. The spool drained to zero.

## Cleanup and next gate

Verification after restoring product source:

- `npm test`: exited 1 after 218 tests passed; 19 fork workers timed out during
  startup, so this run did not complete the suite.
- `npm test -- --maxWorkers=2`: 54 files, 455 tests passed, exit 0.
- `npm run typecheck` and `npm run build`: passed. Vite rebuilt the ordinary
  frontend without the timing probes.
- `.runtime/python/core/python.exe -m pytest services/api/tests/test_obs_livelink_runtime.py -q`:
  21 passed, with the existing Starlette/httpx and audioop deprecation warnings.
- `git diff --check`: passed; product source and `engines/OmniVoice` have no diff.

Restored the portable OBS scene, original recording directory and six original
visible-source Forward settings, verified no recording was active and released
the lease. Stopped the test OBS, controller, API and Studio processes. Rebuilt
the ordinary frontend after removing probes. No upstream engine was modified.

Exact next round: `LIVELINK-STT-12G` — profile native PCM HTTP ACK stages with
the browser workspace polling during a sustained two-track take, reduce the
measured bottleneck, then repeat ingress and caption timing. The unexpected
listener loss, cold-start timeout, workspace reset and Script follow behavior
remain explicitly open; the wider source/UI and clean-machine matrix stays in
`LIVELINK-08`.
