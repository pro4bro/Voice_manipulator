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
