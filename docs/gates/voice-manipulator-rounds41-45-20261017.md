# Voice Manipulator rounds41–45 — 2026-10-17

Five serial bounded rounds; source and actual artifacts are evidence.
Checkpoint A and Phase03 remain open.

### Round41 — VM-STRETCH-IO-01

Preview request diagnostics now split artifact hashing, report publication and
final verification; the atomic writer optionally measures create/write/flush/
fsync/close/replace/retry without changing durability or two-argument callers.
Measurements remain ephemeral and reset to zero on cache hits. Twelve actual
prefix3+suffix1 renders of the private natural8s fixture produce identical WAVs,
230400frames, no clipping/unsafe boundary and unchanged source/journal revision5.
Render-call median336.98ms, range173.49–536.24ms; fsync median127.41ms and no retry.
This measures current storage variance, not a speedup;250ms remains open.
Focused API checks and ADR0098 document preservation of integrity and cleanup.
Evidence: .scratch/vm-rounds41-45/artifact41-receipt.json. Next round42 removes
starvation caused by resetting the initial180ms timer during sustained dragging.

### Round42 — VM-STRETCH-SCHEDULE-01

Initial preview scheduling now arms one40ms timer from the first changed frame
operation; sustained pointer moves update its payload without postponing it.
One active preview coalesces newer moves and immediately follows the latest on
completion. Equivalent/clamped moves do not create redundant requests. Accepted
audio ownership is tracked even when selection has moved onward; A→B→A and
pointerup-before-followup cannot mistake B audio for an accepted A preview.
RED-first sustained10ms stream and restoration regressions pass; focused UI34
in3files, typecheck and build172 pass. ADR0099 records the contract. Previous
trailing180ms timer could starve under continuous motion;40ms is the scheduler
target, not a browser/audio latency claim.250ms and listening gates remain open.
Next43 removes unrelated-output contention while serializing same-output writes.

### Round43 — VM-STRETCH-LOCK-01

Preview publication now locks by canonical output folder, shared across service
instances. All same-output variants/prefixes serialize; unrelated outputs proceed
independently. A guarded weak registry releases unused entries and resolves path
aliases/Windows casing. Hash/PCM/durability and journal semantics stay intact.
RED-first concurrency/failure/alias/collection tests pass; focused API39 pass.
Controlled actual-speech fixture: cached other output previously remained blocked
through a200ms held renderer (404.07ms total lock wait); now completes8.90ms while
that renderer is still held, lock wait0.175ms. This uses an artificial hold and
does not claim normal latency. Native rendered WAV remains byte-identical; source
SHA and journal revision5 unchanged. ADR0100 and contention receipts record scope;
cross-process editing/actively moved folders are not newly supported. Next44
repairs malformed cached WAV reads that currently leak HTTP500 from both routes.

### Round44 — VM-PREVIEW-RECOVERY-01

Malformed preview containers now become the shared PCM validation error instead
of leaking wave.Error/EOFError as HTTP500. Audio reports unavailable404; waveform
uses its existing400 validation contract. Draft regeneration safely repairs the
cache without changing journal/source. Two RED cases reproduced500 before the
fix, then passed error/rebuild/read checks. Focused API33 pass; actual private
cache corruption confirms500/500→404/400 with original bytes restored afterward.
ADR0101 records the compatible error contract. Hash, frame and quality gates
remain intact. Next45 freezes source, checks production artifacts/move/reopen,
real browser behavior where supported, and full regression plus remaining work.
