# LIVELINK-STT-19A — Vietnamese speech baseline

## Frozen before inference — 2026-10-04

No recognition or stitching setting is tuned in this round. The corpus reuses
the 16 `self` utterances from `.runtime/smoke/rvc-gate/set/manifest.json`, whose
labels were curated as ground truth in the 2026-09-15 RVC gate. The `other`
utterances are excluded: their references were recognizer output. Original
audio is read only; derived timelines and projects live under an owned scratch
directory. Two tracks use alternating utterances from the same speaker; this
tests track ownership, not speaker diarization or cross-speaker generalization.

Each track starts after silence, has 1.5 seconds between utterances and trailing
silence. Track 2 starts four seconds after Track 1 to produce deliberate overlap.
Source sample placement is exact; utterance placement is **not** a reviewed
word-boundary annotation. Silence inside each original utterance is retained.

Frozen proposed acceptance budgets (not owner-approved quality targets):

| Dimension | Budget |
| --- | --- |
| Live CER / whitespace-syllable WER | <=15% / <=30% |
| Detailed CER / whitespace-syllable WER | <=10% / <=20% |
| Text on deliberately inserted silence | zero insertions |
| Reviewed word-boundary absolute error p95 | <=250 ms |
| Live final lag p95, when measured at real cadence | <=8 seconds |
| Detailed last available block to ready | <=30 seconds |
| Duplicate seam words / split due to other track starting | zero |
| Leading context | exactly 10 seconds, or all available when shorter |

NFC + casefold; Unicode letters/numbers retained, punctuation becomes spaces;
diacritics and numerals remain meaningful. CER excludes whitespace; WER uses
Vietnamese whitespace syllables, not dictionary-segmented lexical words. Report
micro-averaged edit counts and per-track errors. Empty references produce no
denominator and explicit silence insertions, never zero CER for hallucinations.
Repeated syllables in the source must not be automatically declared duplicates.

Structural word-time validity is distinct from acoustic accuracy. Missing
reviewed word anchors, real-cadence clocks or browser evidence leave those gates
unmeasured, even when text or structure passes. No inferred timestamp is used as
ground truth. Parent 19A remains open until all required evidence exists.

## Measured results — 2026-10-04

The baseline measurement slice is complete. **Full 19A acceptance remains open.**
No product recognizer, model, decoder, stitching or UI setting changed. Proposed
budgets were saved before inference and are not silently relaxed after results.

| Path | Cold CER / WER | Prewarmed CER / WER | Proposed text budget |
| --- | --- | --- | --- |
| LiveLink live, default medium with project Vietnamese | 25.31% / 28.90% | 22.97% / 26.62% | CER fails |
| LiveLink detailed, default large-v3 | 11.88% / 13.15% | 11.88% / 13.15% | CER fails |
| Growing MKV live, default tiny | Not scored: initial prefix cuts an utterance | 51.72% / 70.45% | Both fail |
| Growing MKV detailed, default large-v3 | 9.19% / 10.71% | 9.19% / 10.71% | Text passes only |

These are micro-averages over 2,003 reference characters / 616 whitespace
syllables. Two derived timelines each last 116.454 seconds; the 16 source clips
contain 172.745 seconds of audio. Cached real CUDA/float16 models were used via
an isolated Studio HTTP service, without recognizer stubs or downloads. Run 2
prewarmed medium with an actual source clip before capture as a measurement
control; it does not implement production prewarming. Cold LiveLink had one
60-second request timeout; warm LiveLink had none. The CER failure persists
without that timeout. Live cadence took 170.813 seconds cold and 117.391 seconds
warm. Those wall times are not sample-to-final latency percentiles.

LiveLink uses the real transcription adapter at 250 ms PCM cadence. Detailed
processing receives the initial 20 seconds, a subsequent 60-second block, then
the remaining Stop tail, with 10 seconds of leading context. MKV uses real
FFmpeg FLAC streams and complete-cluster decoding: the initial published prefix
materializes 20.064 / 19.968 seconds on the two tracks, then the rest is appended
to that same file before follower drain and Finish. Configured detailed blocks
are 60 seconds with 10 seconds of context. Source-frame ownership and padding
are recorded in the metrics; semantic seam duplication still needs review.
The additional full-corpus MKV live run measures initial backlog recognition,
not live capture latency. Defaults differ between LiveLink and MKV; this is a
product-path baseline, not a controlled comparison of model quality.

## Artifacts and provenance

Raw frozen references, recognizer results, requests and derived media are in
ignored `.scratch/livelink-stt-19a/run-1/` and `run-2/`. The committed companion
`livelink-stt-19a-metrics.json` retains scores, block boundaries, cached model
revisions, browser observations and artifact checks. Historical label provenance
is `docs/gates/2026-09-15-rvc-vietnamese-gate.md`. All 16 original clip hashes
remain unchanged after both runs. Original audio is preserved.

Both final MKV analyses are mono PCM16, 24 kHz, 2,794,896 frames, 116.454 seconds.
Decoded PCM matches the constructed source timelines exactly (lossless FLAC),
with zero clipped samples. Peak absolute samples are 21,304 and 30,262. PCM SHA256:

- Track 1: `25f3a77bb546bcf512a553731cc7941a3e8fd7a017745008db1caa9573a7b9aa`.
- Track 2: `a8825b806e6ee0f4481ad9308cd45aa07c4e2a888c4a8dff5ca5b7fa27c9b43d`.

The first isolated Studio resolved its packaged runtime copy; its server and
local-agreement module bytes were checked equal to current product source.
Gate runners require an available project Python, local curated corpus, cached
models, FFmpeg and an isolated Studio. They do not install those dependencies.
With an isolated Studio already healthy at the supplied loopback URL and local
FFmpeg on PATH, reproduce from the repository root using a new output folder:

```powershell
.venv/Scripts/python.exe scripts/profiling/livelink_stt_19a_run.py --studio http://127.0.0.1:18091 --output .scratch/livelink-stt-19a/replay-new --real-cadence
.venv/Scripts/python.exe -m pytest services/api/tests/test_livelink_stt_quality_score.py -q
```

## Browser and remaining acceptance

An owned project copy was opened through the real API/controller and web UI on
private ports. The original owner project and browser tab were untouched.
Two Timeline instances, detailed words and shared playhead are visible. Clicking
a Script overlap seeks both audio tracks to 17.628 seconds and leaves both
paused. Browser console has no warning/error after the archive interaction.
Screenshots: `.scratch/livelink-stt-19a/browser.jpg` and `timeline.jpg`.

Observed gaps retained for follow-up:

- Script has nine rows for 16 deliberately separated source utterances; some
  rows span inserted silence. This does not prove correct utterance ownership.
- Detailed overlap survives in Script, but 14 buttons represent seven small
  paired ranges rather than the full deliberate overlap. Imported MKV Timeline
  has no observed corresponding overlap range highlight; seek alone passes.
- Detailed words are structurally bounded (591 LiveLink / 602 MKV words), but
  some words still receive timing trust warnings. Structural validity permits
  adjacent-word overlap and is not acoustic accuracy. Reviewed word-boundary
  p95, existing stabilization timing-trust/snap gates and bidirectional range
  highlighting are not accepted here.
- Full-track CER/WER cannot localize insertions to silent intervals. The scorer's
  zero `silenceInsertions` for nonempty full-track references is not proof of
  silence suppression. Inserted-silence and semantic seam review remain open.
- Real OBS speech, capture/ingress clocks, live-final lag p95, complete detailed
  block-ready lag and owner acceptance of proposed budgets remain open. Per-call
  duration cannot substitute for those clocks. No physical OBS gate was rerun.
- One historical speaker on two tracks does not prove multi-speaker accuracy
  or diarization. No independent reviewed word anchors were supplied this round.

Exact next bounded repair: **LIVELINK-STT-19B**, select LiveLink live recognition
accuracy as one failing dimension and compare one candidate against this frozen
corpus. Its measured-failure condition is now met; it must not claim to close
19A timing/physical gates. Growing-MKV live accuracy, cold timeout, row ownership
and overlap rendering require separately bounded scopes if pursued.

## Validation

- New scorer regressions: 11 passed; runner/scorer Python compilation passed.
- Full backend: 547 passed, two existing warnings, 173.96 seconds.
- Frontend: 55 files / 473 tests passed; typecheck and production build passed.
- Both real-model runs completed; original hashes, PCM format and final decoded
  source equivalence checked. Gate-owned services and tab are closed afterward.
- No production source or model configuration changed; no phase progress advances.
