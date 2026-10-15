# Voice Manipulator rounds11–15 — source delivery and acceptance boundaries

Date: 2026-10-15. Owner requested five further rounds after rounds1–10.

## Source work

| Round | Implemented | Still open |
| --- | --- | --- |
| VM-RIPPLE-01 | Immutable-source frame mapping, downstream offsets, budget/lock guards, optimistic revisions and portable Undo/Redo journal | Piecewise locked acoustic anchors; linked video/background groups |
| VM-STRETCH-01 | Actual pitch-preserving WAV preview, Ctrl handles, waveform/words/audio packets, cache validation and late-response cancellation | Cold response250ms gate failed; real browser continuous drag/playback and listening |
| VM-DELIVERY-01 | Capability report and pre-inference refusal of unsupported whisper/shout/mood/emotion/intensity; baseline preserves current voice path | No real same-speaker expressive conditioning A/B; this is a partial round |
| VM-LOUDNESS-01 | Additive clip gain after segment/sentence gain, locks/headroom/RMS/peak reports, same artifact for preview/download, portable latest pointer | Browser/native Save and subjective mix/listening |
| VM-REF-RANDOM-01 | Independent value/time randomization, deterministic seed/events, preview/apply, portable frozen schedules, source/edit/lock freshness and event integrity, expanded Reference Detail UI | Applied audio conditioning, editable/locked events on main Timeline and Fix integration; this is a planner slice |

No engine source/model was changed or downloaded. No FastPitch integration,
new training, new TTS inference, push or portable package was performed. Actual
audio below processes speech produced in rounds1–10; two source/profile labels
do not establish distinct-human speaker quality. Phase03 stays60%; Phase05 is
not complete. Prior STT timing, OBS, native UI and source-library queues remain.

## Verification

- Full API:942 passed,3 warnings,380.31s. This run began before the final additive
  gain adjustment and latest schedule integrity/route tests; it is not claimed
  as an all-current final suite. Final loudness/render/delivery28 passed; final
  edit/preview/render/delivery/schedule38 passed before the production-route
  regression; latest schedule7 passed after that regression.
- Final current affected API suite:51 passed,2 deprecation warnings,12.82s
  across edits, preview, delivery, loudness, render and reference schedules.
- Frontend initial full:863 passed/2 failed across102 files. Failures were an
  unchanged ChannelScript timeout and OBS caption ordering; exact unchanged
  two-file rerun68 passed. No assertions/timeouts/skips were changed.
- Final frontend full run and final build: see closure below.
- Independent Worker reviews found incomplete/corrupt preview cache acceptance,
  cancel playback restoration, net-zero gain headroom and short gain boundary
  defects. All were repaired with relevant regressions. ADR0078 explicitly
  resolves left-handle duration-control/reflow semantics. A deliberately removed
  downstream delta was caught by the mapping regression and the file restored.
- CUA inventory returned apps[]/browsers[]. Real pointer geometry, browser Save,
  listening, identity and continuous playback remain unverified.

### Final automated closure

With source/test edits frozen, `npm test -- --maxWorkers=1` passed all866 tests
across102 files in280.61s. `npm run typecheck` and `npm run build` both passed;
Vite built163 modules. No test was skipped, removed or given a longer timeout.
An earlier serial attempt ended865 passed/1 failed after the selection helper
and its regression were edited while that run was active (the loaded module
did not expose the new helper). The fresh frozen-source run above resolves that
mixed-snapshot result; the earlier863/2 parallel result remains recorded above.
Final current API affected suite51/51 passed; full942/942 is the earlier snapshot
with the precise limits stated above. Automated green does not close the audio,
latency, browser or conditioning gates in the scope table.

## Actual artifacts

Stretch adapter: five earlier short speech renders49920frames,0clipped samples,
maximum boundary step0.00638, p95 renderer187ms (n=5, not end-to-end latency).
Actual ASGI integration on concatenated prior speech: source4.73s→edited5.15s,
123600frames,0clipping/boundary0, unchanged source hash. Draft does not commit,
stale409, audio/waveform, Undo/Redo and move/Open Existing pass. First request
observed812ms/renderer437ms; later replay312ms/renderer203ms. Both exceed250ms.
Current receipt: `.scratch/vm-rounds11-15/http/acceptance.json`.

Loudness: prior1.78s speech retains42720frames for±6dB requests; +6 limited to
+0.605dB with peak-1dBFS; -6 applied exactly. Integrated stretched5.15s output
uses clip-6dB and first row+3dB, giving row totals-3/-6dB,0clipping; preview and
download hashes match after move/Open Existing. Receipt and WAV:
`.scratch/vm-rounds11-15/render/acceptance.json` and `rendered-speech.wav`.
Original audio/output metadata stay intact. Stretch words remain unreviewed.

## Exact next work

Next planned implementation: **VM-FIX-01**, initially only capabilities actually
supported by the selected engine. Full acceptance retains dependencies on
VM-STRETCH-01 cold response/real browser transport, VM-DELIVERY-01 real expressive
conditioning/identity and VM-REF-RANDOM-01 actual schedule execution. VM-FIX-02
then applies verified replacements and revalidates exports. Accurate per-word
STT/alignment remains its own independent acoustic review; no new word-timing
accuracy claim comes from sample-exact audio composition.
