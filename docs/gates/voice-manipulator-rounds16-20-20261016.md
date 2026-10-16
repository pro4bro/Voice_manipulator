# Voice Manipulator rounds16–20

Owner requested five further rounds on 2026-10-16. Starting point: dc95fcd,
clean checkout. The current ledgers supersede older memory suggesting rounds6–10.

## Ordered scope

1. **VM-FIX-01**: inspect desired/completed sentence fingerprints, generate only
   missing valid clips, persist checkpoints, no-op replay, Stop/retry and stale
   revision protection. Initial duration edits support whole sentences; partial
   or cross-sentence acoustic anchors require review. No new conditioning claim.
2. **VM-FIX-02**: explicitly apply verified replacement clips to a new output;
   preserve immutable source and unaffected PCM, current gaps and downstream
   timing. Retain portable source/replacement lineage and undo/reopen identity.
3. **VM-FLOW-01**: pass an explicit output/selection/revision to Voice Patch;
   show missing prerequisites and reject late replies for another source.
4. **VM-PATCH-01**: use a selected trained voice (including its stored clean
   reference as required by the existing engine), preview replacement before
   explicit Apply, preserve original output and use actual-duration ripple.
5. **VM-PATCH-REF-01**: select surrounding same-speaker context with transcript,
   visible QC and provenance; generate context-only clone and explicitly Apply.
   No automatic same-speaker/noise/overlap certainty without supporting evidence.

## Frozen checks

- WAV PCM16 mono24kHz; source SHA256 unchanged; exact reported frame count.
- Fixed-duration requests must fit within one sample, with no audible truncation.
- Zero clipped samples; boundary step <=0.05 full scale, or refuse publication.
- Retry and replay must demonstrate inference invocation counts and artifact
  hashes; stale source/Script/edit/voice/reference replies cannot apply or clean
  newer changes. Failed/unsupported units remain pending or blocked.
- Browser/native Save, human identity/listening and calibrated word alignment
  are separate acceptance gates. Tests using generated tones cannot establish
  speech quality. Existing expressive/random conditioning and stretch latency
  gaps retain their meaning.
- Engine upstream read-only; local trained artifacts remain outside Git. No
  push or portable publication is included in this implementation request.

## Results

### Round16 — VM-FIX-01

API12/12 and affected UI18/18 pass, typecheck and build pass (164 modules).
Independent reviews repaired queued/latest-job/Start-after-edit/Stop races,
sequential row mapping, post-mapping native-duration preflight and the real
production TimingPlans canonical-row type boundary. Gap edits intentionally
request no TTS; no composition is claimed in this clips-only round.

Actual trained full voice produced64320frames (2.68s), mono24k PCM16,0clipped
samples. Source SHA256 unchanged, matching replay has0dirty units/no inference,
owned worker closed and GPU lease released. Receipt and audio:
`.scratch/vm-rounds16-20/fix-receipt.json`, `fix-full.wav`; elapsed293.67s includes
multiple complete model-content integrity reads, inference and cleanup.
Initial attempt to copy the 4.9GB training optimizer was interrupted; immutable
weights/optimizer now use local read-only hardlinks in the private fixture.
Older all-model cache failed current fingerprints and was not relabeled valid.
The actual gate therefore uses one real full-model source sentence; multi-unit
reuse/Stop/stale/failure invocation counts are established by API fake-engine
tests, not presented as a multi-human acoustic quality result.

This round publishes verified clips only. No new output is applied yet. Human
listening, identity, measured word anchors and browser/native UAT remain open;
CUA returned apps[]/browsers[]. Next: VM-FIX-02 composition/application.

### Round17 — VM-FIX-02

Current affected API48/48, UI75/75, typecheck/build pass. Explicit Apply produces
a separate output and portable receipt with source/preview/audio/metadata hashes.
Only mismatching desired generation identities are replaced; pause-only changes
compose without TTS. Reapplying returns the same artifact. Gain-only invokes the
existing loudness renderer without a new raw output or inference; GET only reads
its verified saved cache. Whole-row target budgets persist across opening Fix
outputs and reject engines without native duration. Go-source and saved-result
navigation preserve original audio. This is output navigation, not an accepted
per-word acoustic undo editor or evidence of human A/B.

Independent review fixes have red/green regressions for generation fingerprints,
output metadata corruption, normalized Script whitespace, inherited duration
capability and Windows transient receipt-read denial. Internal receipt IO is
serialized; a bounded310ms read retry preserves errors if access stays denied.
Only final natural segment endpoints within12frames (3-decimal precision) may
snap to the actual WAV end; larger errors fail and any snap is reported. A
zero-edit render now preserves existing timing trust without promoting estimates.

Actual composition from prior trained full speech and the round16 replacement:
137040frames/5.71s, mono24k PCM16,0clipped samples, splice step0. The unchanged
second sentence and0.35s pause are byte-identical. Source hash unchanged,
idempotence/new-output no-dirty/metadata integrity/move/Open Existing pass.
Current receipt: `.scratch/vm-rounds16-20/apply-receipt.json`; WAV:
`fixed-two-sentences.wav`; moved private project recorded in the receipt. No new
inference in this composition gate. Configured gain integration uses API PCM
fixtures; this actual speech gate has0dB gain. Human listening, identity,
calibrated word anchors and browser/native playback/export remain open.
Next: VM-FLOW-01, VM-PATCH-01, VM-PATCH-REF-01.

### Round18 — VM-FLOW-01

Current API11/11 and affected UI59/59, typecheck/build pass (165 modules).
Production application routes transfer/read/play source PCM without inference.
Whole-row source identity, hashes and mapped frame bounds persist portably;
waveform/subtitle/Script selections resolve only one sentence, explicitly labeled
as whole-sentence expansion. Multi-row/silence/other-source selection rejects.
Independent review repaired Script reassignment relabeling audible source identity.
Late transfer replies after switching output are ignored. GET only validates
existing preview artifacts and never runs generation/stretch. Processor is
truthfully disabled until next round. Actual prior full-model output transferred,
reopened and validated with unchanged SHA; receipt `.scratch/vm-rounds16-20/flow-receipt.json`.
No browser, listening or native Save acceptance is inferred from API/UI tests.
Next VM-PATCH-01 and VM-PATCH-REF-01 complete this five-round owner batch.

### Round19 — VM-PATCH-01

API20/20 (source11 + processor9) and affected UI73/73, typecheck/build pass
(166 modules). Same-speaker trained full/LoRA jobs produce hash-verified
replacement/composite previews and no accepted output before explicit Apply.
Owned cancel releases shared runtime lease; retry/reopen restore durable jobs.
Apply creates a separate immutable output, natural-duration ripple, original
PCM/gaps and timing trust; receipt replay is idempotent. UI loads replacement
Script rows with applied output; earlier audio/Script can be opened from history.
Models still use their saved clean reference; no model-only capability is claimed.
Explicit/locked timing, expressive/reference controls and nonzero gain fail before
inference. Gain render remains a separate prior capability, not silently ignored.

Root review repaired WAV-versus-raw-PCM hash comparison and ambiguous boundary
cues (two red/green regressions): half-open ownership and crossing-cue rejection.
Actual trained full inference: replacement48960frames, composite121680frames/5.07s,
mono24kPCM16,0clipping, splice step0, delta-15360frames. All suffix PCM including
second sentence and pause remains byte-identical; source hash unchanged.
Preview-before-Apply, repeat Apply, saved latest and lease cleanup pass.
Receipt `.scratch/vm-rounds16-20/patch-receipt.json`, audio `trained-voice-patched.wav`.
Elapsed260.34s includes repeated whole-model integrity reads and inference;
this is not an interactive latency pass. New word positions are estimates and
remain needs-alignment. Human speech/identity/listening/browser/native Save
acceptance remains open. Next VM-PATCH-REF-01 contextual clone from real media.
