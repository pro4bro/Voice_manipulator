# Voice Manipulator rounds21–25

Owner requested five further rounds on 2026-10-16. Starting point795a91e,
clean checkout. Current ledgers supersede stale memory about rounds6–10.

## Ordered scope

1. Round21 **VM-PATCH-HYBRID-01**: trained same-speaker checkpoint plus explicit
   surrounding context; separate jobs/lineage and visible strategy, no fallback.
2. Round22 **VM-PATCH-02A**: reviewed word/span boundaries shared by Patch
   strategies, explicit target/context preview and stale review protection.
3. Round23 **VM-PATCH-02B**: natural ripple versus source-duration generation,
   exact PCM budgets, capability/preflight and artifact quality checks.
4. Round24 **VM-PATCH-02C**: durable revision history and A/B/C comparison for
   the same source, including trained/reference/hybrid provenance and recovery.
5. Round25 **VM-CHECKPOINT-A-01**: reproducible integrated artifact, export,
   reopen/move and available UI verification; repair concrete defects and record
   remaining acceptance gaps without claiming the whole checkpoint passed.

Rounds22–24 are bounded implementation slices of the existing VM-PATCH-02 parent.
No new processor is started before Checkpoint A's outstanding gates are resolved.

## Checks held fixed

Source media and trained models remain immutable; upstream engine read-only.
Paths persist relative to project.json. Every preview/Apply needs current source,
metadata, Script/edit/draft and model/reference identities. No hidden strategy
fallback, transcript concat, spontaneous inference on reopen or success without
its actual artifact. Shared runtime/GPU ownership stays serial.

PCM16 mono24kHz, exact declared frames, no clipping and splice step<=0.05FS.
Outside-target PCM is identical except an explicitly declared verified boundary
operation. Estimates never become measured word anchors through frame mapping.
Human identity/delivery/listening, native Save/cancel, browser playback and
acoustic word alignment remain independent acceptance gates. A test fixture
with exact assembly boundaries does not prove naturally spoken word timing.

Each round is verified, documented and committed separately. Final broad tests
run against frozen source. No push, new training/model download or portable
publication is included.

## Results

### Round21 — VM-PATCH-HYBRID-01

API15/15 (hybrid8 + context6 + production source route1), the updated production
route1 separately, and affected UI76/76 pass. Typecheck/build pass167modules.
Original trained metadata/reference and exact weights are fingerprinted alongside
current contextual source/slice/transcript. Profile/base/type/weight/path failures
reject before inference. LoRA/full payload, owned cancellation/retry, stale input,
immutable output and idempotent Apply have fake-engine regressions. UI selects
context clone or trained+context explicitly; no runtime fallback.

Actual existing trained LoRA voice-ab44b6039111 used the same-profile contextual
human assembly from round20, in a private copied project. Source models are
read-only hardlinks; no training/model publication. Replacement65280frames;
composite487680frames/20.32s,0clip, splice0, outside PCM byte-identical. Source,
original model metadata and clean reference SHA unchanged; preview-before-Apply,
idempotence/latest/reopen and lease cleanup pass. Receipt
`.scratch/vm-rounds21-25/hybrid21-receipt.json`, `hybrid21-voice-patched.wav`.
Elapsed352.41s includes repeated complete model integrity reads and cold inference;
no interactive-latency pass is claimed. Assembly has known utterance boundaries,
not measured natural per-word alignment. Human A/B/C identity/delivery comparison
remains open and hybrid is not presumed best. Next VM-PATCH-02A reviewed spans.


### Round22 — VM-PATCH-02A

Reviewed whole-word target receipts pin source/metadata hashes, indices, PCM bounds
and Script revision; stale or missing review blocks all three media strategies.
Source playback remains available before review. STT transfers one qualified span
without leaking source indexes into generated-output selection. Strategy1 uses the
trained model's clean saved reference without context. API47 focused plus updated
production routes/raw processor11, affected UI81/typecheck/build pass. ADR0083.
Private natural Vietnamese fixture verifies exact source crop frames2524560–2716560
and25 persisted DTW words, provenance-linked imported speaker, target98880–150720.
No word times were invented; human review is false and the real fixture remains
blocked awaiting review. No human timing/identity or browser acceptance is claimed.
Next round23 VM-PATCH-02B native source-duration generation, then history and
Checkpoint-A verification. Phase03 remains60%.

### Round23 — VM-PATCH-02B

Patch now chooses natural ripple or native source-duration generation. Exact
sample budgets, conservative text feasibility, neutral-speed requirement and
strict artifact fitting apply across all three media strategies and trained
output Patch. Old ripple cache identity stays compatible. API44 focused,
affected UI13/typecheck/build pass. ADR0084 records limits and no speech cutting.
Actual context clone on natural Vietnamese words generated51840frames/2.16s
natively with0padding/trim/clip. Composite192000frames/8s, delta0, splice0.04114FS,
outside PCM/source/idempotence/lease pass; output-19c33d154a69, receipt
`.scratch/vm-rounds21-25/context23-receipt.json`. Fixture confirmation was an
automated test acknowledgement, not human listening. Replacement words remain
needs-alignment; exact span length is not exact word timing. Next round24
VM-PATCH-02C durable history/comparison, then Checkpoint-A verification.

### Round24 — VM-PATCH-02C

Immutable per-output history journals, cross-strategy comparison groups and
audition/open UI now retain accepted revisions independently of the current draft.
Legacy pointers remain readable; journal-first Apply recovers failed latest-pointer
writes and repeated older Apply without duplicate outputs. Hash/PCM/lineage/target
checks reject invalid history entries with a visible count. API48 focused plus
updated production-route1, affected UI25/typecheck/build pass. ADR0085.
Actual same-source/text/2.16s native comparison now contains context, trained LoRA
with clean reference and hybrid; all three composite8s192000frames,0clip, delta0,
no padding/trim and unchanged outside PCM/source. History returns3 valid entries
with one comparison key. Trained118.61s, hybrid131.31s include integrity reads;
no interactive latency or subjective identity ranking is claimed. Receipts under
`.scratch/vm-rounds21-25/`. Broader UI run888/890 exposed OBS caption failure and
one timeout; isolated68 rerun67 pass with the caption failure still reproducible.
Round25 diagnoses that failure and closes frozen regression/artifact/export/move
checks. Human listening, calibrated word timing and native/browser acceptance
remain separate open gates. Phase03 remains60%.

### Round25 — VM-CHECKPOINT-A-01

Checkpoint-A artifact integration verifies all three real natural-Vietnamese
variants in one comparison group: exact native2.16s replacement,8s composite,
0clip, unchanged outside PCM/source/model reference/metadata. Production HTTP
WAV/206 Range, line SRT, CSV, conservative word-cue omission and sentence rejection
pass before and after Unicode-folder move plus HTTP Open Existing/fresh API.
See `docs/gates/vm-checkpoint-a-artifacts-20261016.md` for hashes and manual steps.
Full frontend890/108files passes with maxWorkers2 after correcting a pre-existing
wall-clock-aged OBS caption fixture; no assertion, timeout or threshold relaxed.
Typecheck/build168modules/diff pass. Full frozen API1056 passes in690.63s with
3 warnings:2 existing deprecations and1 intentionally duplicate ZIP-entry warning.
The API Python snapshot remained unchanged while the frontend-only fixture was
corrected. Earlier UI888/890 failure remains in the gate evidence.
Five-round21–25 batch is delivered as separate commits. Checkpoint A as a whole
remains OPEN for human A/B/C identity/prosody/splice listening, acoustic word
anchors, browser playback/native Save-cancel and earlier expressive/performance
gates. Both UI tools failed kernel initialization os error3, so HTTP/component
checks are not called native UI acceptance. Next close those gates; do not begin
new VC/Isolator/Dubber processors. Phase03 stays60%; no portable or push included.
