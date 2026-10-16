# Checkpoint A — rounds36–40 preview performance and transport

Five bounded rounds continue fromb6d6873. The250ms requirement remains unchanged.
This batch improves measured work and request ownership; it does not close the
independent browser/listening or delivery-conditioning gates. Phase03 stays60%.

## Delivered slices

| Round | Result | Verification |
| --- | --- | --- |
| 36 | Ephemeral preview cache/stage diagnostics and Server-Timing | API18; actual natural8s HTTP miss/cache and profiled1/3-operation renders |
| 37 | Native signed PCM clipping counts | API10;100 paired scans;10 before/after WAVs byte-identical |
| 38 | Longest checked exact-history prefix reuse | API32; native full/incremental WAV parity, corruption/fork/Undo cases;5 real paired renders |
| 39 | One request lane, coalesced latest preview, ordered commit and metadata-safe transport | UI30/typecheck/build172; Escape/output/unmount/late metadata regressions |
| 40 | Integrated artifact/reopen/move, counter-integrity repair, frozen regression and remaining-work update | Current snapshot and final suite results below |

ADRs0094–0097 describe the contracts. No training, engine/model download, TTS/ASR,
GPU inference, upstream engine edit, push or portable release occurs. The fixture
copies an existing real Vietnamese8s output into its own project with source SHA
and source output ID provenance. It does not claim a new trained or accepted voice.

## Measurement method and observations

The immutable input SHA256 is
`8df7b33eda41137d9a4e587d69cb225fb8a5687016867522eebd62ab6453e327`:
192000 PCM16 mono24k frames, from prior timing output `output-9a94a020fc2a`.
Three consecutive whole-clip stretches each add9600 frames, yielding220800
frames/9.2s. Frame and source checks run on the actual WAVs.

Direct renderer profiling repeats1/3-operation lists five times with fresh files.
Profile overhead is included in those direct totals. HTTP and the paired PCM scan
are separately measured without cProfile. Compare the same operations and fresh
artifacts; a cache hit is never reported as a cold-render improvement.

| Measurement | Before / full | After / reused | Limit |
| --- | --- | --- | --- |
| Unprofiled exact PCM clipping scan,100 pairs | median13.94ms | median7.54ms | Isolates CPU scan, not the request |
| Actual full3-operation vs checked-prefix2 + suffix1,5 pairs | median284.17ms | median214.37ms | Largest reuse555.96ms, so no SLA pass |
| Baseline HTTP miss/hit | 252.54 /41.44ms | — | Single request pair, not a latency distribution |
| Instrumented follow-up HTTP miss/hit | 221.96 /25.64ms | — | Runtime variance, not evidence instrumentation accelerates rendering |
| Scan-change HTTP miss/hit | 215.84 /36.82ms | — | Cannot attribute the whole delta to the scan |

All10 CPU before/after WAVs and all5 full/prefix WAV pairs are byte-identical.
Pitch-preserving FFmpeg, exact frame count, clipping rejection and boundary limit
are unchanged. Prefix reuse reduces newly rendered operations from3 to1. Cache
identity, expected frames and cumulative quality are verified on fresh reads.

The556ms reuse outlier spends389ms in artifact publication/validation. This
locates a remaining stage; it does not identify the OS/storage root cause.
Atomic report publication, fresh hashes and safety checks were retained. Future
profiling must distinguish write/fsync/verification costs before changing them.

Per-request `previewDiagnostics` separates cache/lock/check/prefix/render/artifact/
packet/handler time from persisted historical processingSeconds. The latter is
cumulative render provenance when a prefix is reused. It is not cache-hit latency.

## Scheduling and playback

The first pointer preview still has the180ms debounce. A newer operation waiting
for an older preview is now dispatched immediately when it can run, rather than
waiting another180ms. One active client request lane orders preview, commit,
history and source loading. Superseded pending work resolves false; cancellation,
unmount and output replacement invalidate ownership and never auto-commit.

Throttling and client invalidation do not cancel an already executing synchronous
FFmpeg request. The existing class-wide render lock still serializes server work.
An equal operation packet also no longer implies its audio is ready: mapped seek
and resume intent stay until the audio metadata is applied. Tests cover commit
before metadata and late gesture completion after unmount.

## Counter-integrity repair during final verification

A read-only review found that arbitrary signed padding could survive cache report
validation. Negative adjustments are legitimate silence removal, but their
magnitude cannot exceed1440frames per operation. Three RED regressions reproduced
impossible positive/negative values and a mismatched operation count.

Validation now checks declared operation count, matches it to the requested
prefix length when known, and bounds cumulative adjustment accordingly. Legacy
reports without a count use the known request length or the journal's128-operation
ceiling on standalone reads. Legitimate negative fits remain valid.

The first backend broad run was stopped before editing this guard; it has no pass
verdict. The repaired focused API32 pass. Final broad runs use the frozen586 API/
web tracked-input manifest in `.scratch/vm-rounds36-40/frozen-inputs.json`.
Only documentation and ignored scripts change while those runs execute.

## Real integrated recovery

Production API commits3 operations, then Undo/Redo restores the same preview SHA
`1344ad9463590f05526a53ea4f9a492cc67fc795cec7f2b286898af4d0940be5`.
A fourth draft preview reuses3 operations and renders1 without advancing journal
revision5. Source audio and original output metadata remain unchanged; only the
project-owned edit journal/cache evolve. The output store still contains one
original output, not a falsely published stretched take.

The checked private folder moves to
`.scratch/vm-rounds36-40/Preview kéo giãn đã kiểm tra`. HTTP Open Existing through
a fresh production app lifespan restores the same project ID, revision5/cursor3,
validated cache and exact9.2s WAV. Range206, waveform200 and stale revision409 pass.
Manifest projectPath/location stay`.`. Reopening after the counter guard preserves
the same hash and uses a full cache hit. GPU lease is free; no shared runtime is
started or stopped.

Scripts/receipts: `measure_stretch.py`, baseline/diagnostics/native-scan receipts
and cProfiles, `native-scan-paired.json`, `measure_reuse.py`, `reuse38-receipt.json`,
`checkpoint40.py`, `checkpoint40-receipt.json`, `reopen40.py` under the ignored
work folder. No speech or model bytes are committed to Git.

## Independent gates and remaining work

Both CUA and Windows Computer Use still fail initialization with
`failed to write kernel assets ... os error3`. No actual pointer-to-playback,
native Save/Cancel, sustained drag, seam listening or pitch/identity perception
is inferred from component tests, tone checks or HTTP WAVs.

The initial180ms debounce, artifact IO tail, class-wide lock and actual browser
waveform/audio load remain relevant to the250ms budget. Median server improvement
does not close that end-to-end gate. Delivery emotion/whisper/shout, reference
random audio execution, word-anchor model control and the13 downstream function
codes remain as listed in `docs/VOICE-MANIPULATOR-REMAINING-ROUNDS.md`.

## Regression evidence

Frontend frozen after43cbaa1: `npm test -- --maxWorkers=2` passes913 tests in112
files, exit0,128.81s. Typecheck and production build172 modules pass. These checks
do not constitute browser interaction or playback acceptance.

Final current backend: `.venv/Scripts/python.exe -m pytest services/api/tests -q`
passes1128, exit0,612.73s. Three warnings are existing Starlette/httpx and audioop
deprecations plus the deliberate duplicate ZIP-entry rejection fixture. No tests
are skipped or weakened. The586 frozen input hashes still match after both
suites. Final diff check passes. Logs remain `api-full.log` and `web-full.log`;
the interrupted pre-guard run is preserved separately and is not a pass result.
