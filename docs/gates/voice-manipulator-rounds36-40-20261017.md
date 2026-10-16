# Voice Manipulator rounds36–40

Start b6d6873, clean checkout. Five requested rounds follow the current register.

1. Round36 VM-STRETCH-PROFILE-01: measure fresh/cache/history preview costs;
   expose per-request cache/stage metrics distinct from persisted render time.
2. Round37 VM-STRETCH-CPU-01: optimize measured Python PCM clipping scan while
   retaining exact clipping rejection, pitch/frame/boundary and source checks.
3. Round38 VM-STRETCH-REUSE-01: reuse only integrity-checked exact operation
   prefixes to avoid rendering the entire edit history for every added operation.
4. Round39 VM-STRETCH-QUEUE-01: remove avoidable repeated drag wait and harden
   latest-operation scheduling/ownership with focused UI checks.
5. Round40 VM-CHECKPOINT-A-04: compare real media with the same benchmark inputs,
   test source/artifacts/reopen/move, frozen suites, update remaining gates.

Keep the250ms requirement and independent browser/listening acceptance unchanged.
No training, new model/engine download, GPU inference, portable release or push.
No new Changer/Isolator/Dubber processor before Checkpoint A acceptance.
Each round is verified and committed; Phase03 stays60%.

### Round36 — VM-STRETCH-PROFILE-01

Preview packets now expose ephemeral per-request cache/lock/check/render/artifact/
packet timing, with candidate/handler Server-Timing on draft preview. The cached
render report remains immutable and is not confused with current cache latency.
API18 pass, including a RED-first cache diagnostics regression. ADR0094 records
units and measurement limits. Real8s natural speech baseline: HTTP miss252.54ms,
hit41.44ms; profiled fresh render median210ms one operation/375ms three operations.
Repeated instrumented run miss221.96ms/hit25.64ms shows runtime variance, not an
optimization claim. cProfile locates FFmpeg subprocess work and Python clipping
scan (over2.1m generator calls); timings under profiling include its overhead.
All runs preserve source hash, exact target frames,0clipping/boundary checks and
journal revision0. Receipts/profiles under .scratch/vm-rounds36-40.250ms browser/
continuous-playback gate stays open. Next optimize the measured PCM scan.

### Round37 — VM-STRETCH-CPU-01

The measured per-frame Python clipping generator is replaced by exact signed-array
endpoint counts. Clipping thresholds/rejection and audio processing stay identical.
Two RED-first scan cases plus existing pitch/source/frame/boundary checks pass10/10.
Paired100-run scan median13.94ms→7.54ms on the same PCM. All10 real rendered WAVs
(one/three operations, five runs each) remain byte-identical to baseline. Profile
generator calls fall from2.1m to native typed scans; this does not imply the whole
request improves by the profiled delta. Real HTTP miss215.84ms/hit36.82ms varies;
three-operation fresh renders still median347.69ms under cProfile. No250ms gate
closure or human listening claim. ADR0095 and local native-scan receipts record
method/results. Next reuse exact validated history prefixes to avoid repeated FFmpeg.

### Round38 — VM-STRETCH-REUSE-01

Preview cache now finds the longest exact operation prefix with valid source hash,
WAV/checksum/frames and cumulative quality report, then renders only the suffix.
Missing/corrupt/incomplete cache falls back safely; fork/Undo/Redo use exact keys.
Signed silence adjustments and max boundary/whole targetframes remain consistent.
Malformed/NaN cache diagnostics rebuild instead of leaking invalid HTTP reports.
Focused API32 pass, including native FFmpeg byte parity. Actual natural8s speech
with3operations: full median284.17ms vs prefix2+suffix1 median214.37ms over5paired
runs; all5 WAVs byte-identical and source/journal untouched. One reuse556ms outlier
spent389ms in artifact publication/verification, so250ms remains open. Measurements
do not include browser/debounce/playback. ADR0096 and reuse38-receipt.json record
the tradeoff. Next39 serializes drag preview/commit and retains playback metadata.

### Round39 — VM-STRETCH-QUEUE-01

Stretch requests now use one active lane with a replaceable pending task; newest
preview/commit/history/load owns publication. Superseded/cancelled/output-switched
tasks cannot publish or revive old work. Pointerup commit waits behind preview.
Latest queued drag operation dispatches immediately after older preview finishes,
without a second180ms wait; initial180ms debounce is retained and remains a budget
constraint. Late gesture completion cannot restore selection after unmount.
Mapped audio seek/resume state stays until the corresponding metadata is handled;
matching preview operations alone no longer clear transport prematurely.
Focused UI30/typecheck/build172 pass; ADR0097 records scope and lack of server
cancellation. Browser tools still fail kernel-assets initialization, so no audible
continuity or250ms end-to-end claim. Next40 finishes frozen regression/artifact gates.

### Round40 — VM-CHECKPOINT-A-04

Current frozen source passes all1128 API tests (612.73s, three existing/fixture
warnings), all913 frontend tests in112 files (128.81s), typecheck/build172 and
diff check. All586 tracked API/web input hashes match the frozen manifest; no
tests/assertions/thresholds/timeouts weakened or skipped. An earlier API run was
stopped before a review-driven counter integrity repair and is not claimed green.
Three RED regressions reproduce impossible signed padding/mismatched op counts;
current guard bounds silence fit1440frames per operation and preserves valid
negative adjustment/legacy reports. Repaired focused API32 and full suite pass.
Actual natural8s production API commits3stretches to9.2s, Undo/Redo restores exact
WAV SHA, fourth draft reuses3/render1 without journal commit, WAV/Range206/waveform/
stale409/move/Open Existing pass. Source/metadata unchanged, one original output,
revision5/cursor3 preserved after Unicode folder move, relative manifest and free
GPU lease. No new inference/model/training/download/shared runtime operation.
Performance:100 paired clipping scans13.94→7.54ms median;10before/after WAVs exact.
Five full3-op vs prefix2+suffix1 pairs median284→214ms, every WAV exact;556ms outlier
at artifact stage and initial180ms debounce keep250ms end-to-end gate open.
CUA/Computer Use still fail kernel-assets os error3; no browser/listening/native
export acceptance inferred. Expressive delivery/random/word-anchor and13downstream
codes remain open. Remaining register/NEXT-PLAN updated through40; prioritize
IO/debounce/lock/browser profiling without discarding integrity checks.
Detailed gate: docs/gates/vm-checkpoint-a-preview-performance-20261017.md. Local
receipts/profiles/logs: .scratch/vm-rounds36-40. Five requested rounds complete;
Phase03 remains60%, no push/portable release.
