# Voice Manipulator rounds31–35

Starting point5973994, clean checkout. Owner requests five more rounds and a
current list of remaining work. Existing Checkpoint A acceptance remains open.

1. Round31 VM-WORD-AUDITION-01: explicit word-by-word audition of saved audio,
   including untrusted words, with checksum/bounds guards and no trust promotion.
2. Round32 VM-WORD-REVIEW-01: user-reviewed per-word boundaries saved as a new
   same-WAV output, preserving source and separate machine/human provenance.
3. Round33 VM-REVIEW-EXPORT-01: portable listening report of comparable accepted
   Patch variants and their actual current/stale/unreviewed assessments.
4. Round34 VM-TIMING-RECOVERY-01: explain source/model/policy/proposal invalidation
   correctly and make timing job/retry ownership explicit in the UI.
5. Round35 VM-CHECKPOINT-A-03: frozen suites, actual read/export/move/reopen,
   available UI verification and a reconciled remaining-round register.

Do not invent human review or acoustic truth; no actual listening checkbox is
set by automated artifact checks. Synthetic tests may exercise manual saves.
No new training/model downloads, upstream changes, push or portable release.
Each round has a verified commit. Phase03 stays60% pending independent gates.
New Changer/Isolator/Dubber processors wait for Checkpoint A.

### Round31 — VM-WORD-AUDITION-01

Saved Voice Outputs now have an explicit word inspector with source timing/trust,
START/END/DURATION and one player for200ms-context word crops. Untrusted words
remain listenable without trust promotion. Each request checks WAV/metadata key,
PCM format/frame count, project containment and segment bounds; no inference.
API7 (six new cases plus production integration), UI4/typecheck/build172 pass.
Actual private Vietnamese timing output serves25 exact PCM crops including its
two untrusted words; Range206/stale409 pass, original WAV/metadata unchanged.
Local word31-receipt.json records evidence, not human acceptance. ADR0090 explains
the contract. Next round32 adds explicit manual boundary review as a new output.

### Round32 — VM-WORD-REVIEW-01

Word inspection now accepts proposed boundaries and auditions them with context.
Save requires explicit listening/review confirmation and writes a new byte-identical
WAV output with user-reviewed provenance only on selected words. Segment/neighbor
bounds, unique indexes, optimistic source identity, checked idempotent receipts and
source immutability are enforced. Unselected annotations remain unchanged.
API13 and UI5 (plus VoicePatch2)/typecheck/build172 pass. Synthetic temporary
projects verify actual WAV copy, source preservation, batch confirmation, stale/
tamper/corrupt receipt/reopen and proposed crop behavior. No human review was
fabricated on private Vietnamese speech;23/25 machine anchors remain the baseline.
ADR0091 records the distinction between annotation review and acoustic timing control.
Next round33 exports current listening assessments for comparable accepted variants.

### Round33 — VM-REVIEW-EXPORT-01

Each accepted Patch comparison group can download a portable JSON report with
target/text, variant identity/audio/metadata checksums and exact user assessments.
Current/stale/unreviewed states remain explicit; no aggregate quality pass.
Concurrent assessment revision changes and corrupt notes reject export; reads
never fabricate a listening confirmation. ADR0092 documents the additive contract.
API11 (report3 plus reviews7 and production integration1), UI5/typecheck/build172
pass. Actual production HTTP exports all3 comparable Vietnamese variants with
matching hashes/unreviewed ratings, no private notes or inference writes.
Local comparison33-report.json/report33-receipt.json hold the result. Native
Save/cancel remains unverified. Next round34 makes timing invalidation/retry clear.

### Round34 — VM-TIMING-RECOVERY-01

Timing jobs persist structured invalidation reasons for audio, metadata, recognizer,
timing policy, proposal or legacy identity. Source changes take precedence, stale
states/reasons survive reopen, and interruption remains failed. UI explains the
reason/current ASR model and keeps Measure/Apply explicit. Start/Stop responses now
check request generations, including select-away-and-back races; Stop disables busy.
Two new UI regressions failed before correction. API14 (timing13 plus production
integration1) and affected UI10/typecheck/build172 pass. ADR0093 documents codes
and recovery. Tests use synthetic recognizers; no new ASR/TTS, model download or
human acceptance. Next round35 freezes source, runs full checks and closes the
owner's five-round batch with the reconciled remaining-work register.

### Round35 — VM-CHECKPOINT-A-03

Frozen f30b77d source passes all1107 API tests (554.78s, three existing/fixture
warnings), all905 frontend tests in112 files (178.02s), typecheck/build172 and
diff check. No assertions/thresholds/timeouts weakened or tests skipped.
Actual production HTTP validates25 exact word crops plus proposed-boundary crop,
Range206, explicit-review false rejected422 without new outputs, and3 comparable
Patch variants with matching checksums/unreviewed ratings. All checks repeat after
a guarded Unicode folder move and Open Existing. Four output WAV hashes/metadata,
original media and LoRA adapter/reference/metadata remain intact; report snapshot
key survives the move, manifest paths stay relative and GPU lease is free.
No real human review, training/download, ASR/TTS or shared runtime operation occurs.
CUA/Computer Use still fail initialization with kernel-assets os error3. Native
playback/Save/Cancel, human word/identity/seam listening, expressive conditioning,
random audio execution and preview250ms gates remain open. Phase03 stays60%.
The owner-facing remaining-round register is docs/VOICE-MANIPULATOR-REMAINING-ROUNDS.md:
prioritize preview profiling, delivery evidence then random execution, plus human/
native gates. After Checkpoint A remain13 function codes:3 Changer,3 Isolator,
2 Emotion,5 Dubber; not a promise that13 execution rounds suffice. Mobile/Convai/
Digital Human still need feasibility. NEXT-PLAN's stale exact-next pointer is fixed.
Detailed evidence/usage: docs/gates/vm-checkpoint-a-word-review-20261016.md; local
receipts/logs under .scratch/vm-rounds31-35. Five requested rounds complete.
