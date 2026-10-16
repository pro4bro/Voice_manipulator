---
current_phase: 3
current_phase_name: Voice Training
total_phases: 7
current_plan: 3
total_plans_in_phase: 4
status: In progress
progress: 60%
last_activity: 2026-10-16 — Voice Manipulator round35 VM-CHECKPOINT-A-03.
last_activity_desc: Round35 delivered; see current ledger and rounds31–35 gate. Phase03 remains60%; independent quality acceptance gates remain open.
---

# Project State

## Voice Manipulator round35 — VM-CHECKPOINT-A-03 (2026-10-16)

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

## Voice Manipulator round34 — VM-TIMING-RECOVERY-01 (2026-10-16)

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

## Voice Manipulator round33 — VM-REVIEW-EXPORT-01 (2026-10-16)

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

## Voice Manipulator round32 — VM-WORD-REVIEW-01 (2026-10-16)

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

## Voice Manipulator round31 — VM-WORD-AUDITION-01 (2026-10-16)

Saved Voice Outputs now have an explicit word inspector with source timing/trust,
START/END/DURATION and one player for200ms-context word crops. Untrusted words
remain listenable without trust promotion. Each request checks WAV/metadata key,
PCM format/frame count, project containment and segment bounds; no inference.
API7 (six new cases plus production integration), UI4/typecheck/build172 pass.
Actual private Vietnamese timing output serves25 exact PCM crops including its
two untrusted words; Range206/stale409 pass, original WAV/metadata unchanged.
Local word31-receipt.json records evidence, not human acceptance. ADR0090 explains
the contract. Next round32 adds explicit manual boundary review as a new output.

## Voice Manipulator round30 — VM-CHECKPOINT-A-02 (2026-10-16)

Checkpoint A integration verified on the frozen48e737d source snapshot: all1085
API tests pass (657.11s, three existing/fixture warnings); all898 frontend tests
in111 files pass (144.13s, one Vitest fork shutdown warning), typecheck/build171
and diff check pass. Assertions/thresholds/timeouts remain intact; no tests skipped.
Actual production HTTP verifies four8s outputs, WAV/Range/line/word/table/sentence
exports, three accepted comparison entries and source/variant crops before and
after a guarded private project move to a Unicode folder plus Open Existing.
Source, model/adapter/reference, output hashes and metadata stay unchanged. Repaired
word SRT skips2 untrusted cues; repaired sentence SRT exports with1 skipped cue.
Changing medium to productionlarge-v3 correctly invalidates the prepared proposal,
while the already-applied same-WAV timing output stays valid. No inference on reopen.
Real reviews remain unreviewed; no fabricated listening or newTTS. GPU lease free.
CUA and Computer Use both fail initialization with kernel-assets os error3, so
browser playback/native Save and independent human identity/seam/word-timing gates
remain open, as do expressive conditioning/performance gates. Phase03 stays60%.
Read-only integration review found no actionable defect. Detailed report and
usage: docs/gates/vm-checkpoint-a-timing-audition-20261016.md; local receipts and
logs under .scratch/vm-rounds26-30. Five-round request complete; next work closes
remaining Checkpoint A gates before new Voice Changer/Isolator/Dubber processors.

## Voice Manipulator round29 — VM-PATCH-REVIEW-01 (2026-10-16)

Explicit listening assessments now accompany the selected accepted Patch variant:
clarity, identity, delivery, transitions, notes and a listening confirmation.
Every rating starts unassessed. Portable notes append immutable assessment snapshots
with accepted WAV/metadata/comparison fingerprints and optimistic revision guards;
stale notes remain visible, corrupt files are not overwritten. No automatic quality
pass or Checkpoint A promotion. UI ignores late saves for another output.
API8 (seven review cases plus production integration) and UI7/typecheck/build171
pass. ADR0089 records the contract. Automated writes use synthetic temporary
projects only; the three actual Vietnamese variants remain human-unreviewed.
Next round30 freezes source, checks integrated exports/move/reopen and whole suites,
and reports remaining perceptual/UI gates honestly.

## Voice Manipulator round28 — VM-PATCH-AUDITION-01 (2026-10-16)

Accepted Patch history now opens one shared source/variant player with region,
head, tail and full-clip views. Explicit selection starts playback; changing region
or output stops it. Saved source checksums and project containment guard original
audio; unavailable originals never substitute a current Timeline render.
Real three-strategy artifacts exposed a trained-media source-location difference;
a RED regression and immutable-output fallback fixed it. Actual HTTP verification
passes24 WAV crops across three accepted variants plus Range206, with source/output
unchanged and0TTS. API audition7 and production route1 pass; UI4/typecheck pass.
ADR0088 records the behavior. Local audition28-receipt.json contains artifact hashes.
The private ASR Studio was released and only its owned18085 server stopped.
Human listening/browser acceptance remain open. Next round29 records explicit
user assessments without automatically marking quality accepted.

## Voice Manipulator round27 — VM-TIMING-REPAIR-01 (2026-10-16)

Explicit persisted Timing Repair jobs now measure existing Voice Output segments
through Studio ASR, with model/policy/source fingerprints, owned Stop, interruption
recovery, checked proposal artifacts and separate immutable same-WAV Apply. No
TTS or source mutation. UI separates plan/measure/Apply and ignores late results.
API8 (seven service regressions plus production route), affected UI39 plus late
Apply test3/typecheck/build169 pass. ADR0087 describes ASR matching limits.
Actual cachedmedium Studio on a private port measured23/25 words in the natural
Vietnamese patched8s file; target2/3 words trusted, two total remain untrusted.
WAV SHA stays8df7b33eda41137d9a4e587d69cb225fb8a5687016867522eebd62ab6453e327;
source metadata unchanged, preview-before-Apply/idempotence/lease pass,0TTS.
New output output-9a94a020fc2a; local timing27-receipt.json records158.36s including
cold ASR startup. This is not a human word-timing acceptance. Next round28 audition.

## Voice Manipulator round26 — VM-WORD-TRUST-01 (2026-10-16)

Generated-word mapping no longer promotes recognizer splits, substituted text,
explicitly untrusted/estimated observations, overlaps or invalid bounds to trusted
Script anchors. Valid short intervals and processor provenance survive; estimates
never exceed PCM length. New clip identity includes timing policy2 to avoid reusing
legacy annotations. Published audio/history stay immutable. ADR0086 explains the
tightened old substitution test and the one-time pending-job/cache invalidation.
Eight new regressions failed before correction; affected API66 now pass. Existing
natural Vietnamese25-word DTW data preserves every boundary/trust/provenance with
unchanged source SHA in a private project copy; no new inference/human claim.
Next round27 adds explicit timing repair without TTS. Checkpoint A stays open.

## Voice Manipulator round25 — VM-CHECKPOINT-A-01 (2026-10-16)

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

## Voice Manipulator round24 — VM-PATCH-02C (2026-10-16)

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

## Voice Manipulator round23 — VM-PATCH-02B (2026-10-16)

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

## Voice Manipulator round22 — VM-PATCH-02A (2026-10-16)

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

## Voice Manipulator round21 — VM-PATCH-HYBRID-01 (2026-10-16)

Hybrid uses compatible same-speaker full/LoRA plus selected source context without
mutating trained Voice Model/reference or falling back to clone. Separate hybrid
jobs/receipts/UI preserve cancel/retry/revision checks. API15 + production-route1,
affected UI76/typecheck/build pass. Actual LoRA hybrid20.32s487680frames0clip,
splice0, outside PCM/source/model/reference/idempotence/reopen/lease pass. Same
known-utterance human assembly as round20; human A/B/C identity/delivery and word
alignment remain open. Next VM-PATCH-02A reviewed spans, then02B timing,02C history
and Checkpoint-A-01 verification in this requested21–25 batch. Phase03 stays60%.


## Voice Manipulator round20 — VM-PATCH-REF-01 (2026-10-16)

Context clone Patch now selects trusted same-speaker source spans from imported
or recorded Media Assets, previews reference transcript/audio, and uses a temporary
base-model clone without training or Voice Model publication. Explicit Apply
preserves source PCM outside the target and full usable transcript/speaker runs.
Actual human-speech assembly fixture:20.32s487680frames0clip, splice0, original/
reference/source invariance, idempotence, moved Open Existing and identical HTTP
WAV download pass. First clipped inference was rejected; explicit retry now
creates a fresh immutable clip. Frozen regression closure is recorded in the
combined gate. Source24kPCM only; acoustic noise/identity/listening/browser and
word anchors remain open. Five-round batch16–20 source work is delivered.
Next planned round: VM-PATCH-HYBRID-01 (trained model plus same-speaker context).


## Voice Manipulator round19 — VM-PATCH-01 (2026-10-16)

Trained same-speaker full/LoRA Patch now generates replacement/composite previews,
owned Stop/retry/reopen and explicit immutable Apply with natural-duration ripple.
UI opens replacement Script with the result and retains source/output history.
API20/UI73/typecheck/build pass; real full model result5.07s121680frames0clip,
source/outside PCM/idempotence/reopen/lease pass. Expressive/timing/gain requests
fail explicitly. Next VM-PATCH-REF-01 completes the five-round owner batch.
Human listening, identity and calibrated word timing remain open.


## Voice Manipulator round18 — VM-FLOW-01 (2026-10-16)

Whole-sentence output/selection transfer to Patch now preserves immutable source
voice/profile, frames, audio/metadata hashes and Script/edit revisions. Stale and
late replies cannot attach to another source. API11/UI59/typecheck/build pass;
actual trained-speech source transfer/reopen/hash invariance verified. Patch
processor remains visibly unavailable in this round. Next VM-PATCH-01 then
VM-PATCH-REF-01 to complete the owner batch. Browser/listening gates remain.


## Round17 — VM-FIX-02

Immutable Apply/gain/target carryover/reopen, API48/UI75/build and real speech
5.71s137040frames0clip/gap/row/hash/move pass. Next Flow01, Patch01, PatchRef01.

## Round16 — VM-FIX-01

Incremental clips/job receipts and UI verified: API12/UI18/build, actual full voice
2.68s64320frames,0clipping, no-op/source hash/lease pass. Apply/composition next
VM-FIX-02, then Flow/Patch/PatchRef under owner five-round request. Phase03 60%.

## Voice Manipulator rounds11–15 — 2026-10-15

Scope and evidence: `docs/gates/voice-manipulator-rounds11-15-20261015.md`.
Stretch is preview, not regenerated or reviewed speech timing. Delivery/random
conditioning remain unverified processors. Next planned VM-FIX-01 retains these
gates; STT acoustic review and original OBS/source-library queues remain.

## Project Reference

See: `.planning/PROJECT.md` (status reconciled 2026-09-22)

**Core value:** One portable project carries audio through transcription,
training, generation, conversion, and later LipSync with honest lineage.
**Current focus:** Phase 03 Voice Training — gated publication.

Detailed plan-vs-code evidence: `docs/PROJECT-STATUS.md`.

## Voice Manipulator — next five rounds completed in source (2026-10-15)

Owner-directed VM-REF-DETAIL-01, VM-REF-RESOLVE-01, VM-TIMING-REF-01,
VM-NAV-01 and VM-DURATION-01 delivered slots/navigation, property resolution,
portable timing templates, selection markers and native sample-budget synthesis.
Actual32-step GPU clone audio passed natural1.78s/short1.42s/long2.60s,
two-profile4.95s including.35s pause, timing-template override, replay2/2 and
move/Open Existing reuse2/2 with preserved hashes. No clipping; gap/boundaries0.
CPU attempt timed out; owned workers/lease closed. Live HTTP actual-speech
measurements/plans/revision/move passed. Full backend885 and affected53 pass;
frontend853/typecheck/build pass; exact history is in the combined gate. See ADR0077 and
`docs/gates/voice-manipulator-rounds6-10-20261015.md` for exact results/limits.
Human listening/identity, measured word anchors and native browser UAT remain
open. Delivery/loudness/random/Fix and audible stretch are later rounds.
Next **VM-RIPPLE-01**. Phase03 remains60%; no portable/push; prior queues retained.

## Voice Manipulator — first five rounds (2026-10-15)

Implemented main-source Script hierarchy/settings persistence, independent
reference footage roles/import, shared time/word/text selection/readouts and
frozen-scope multi-reference assignments. Live API actual PCM import, atomic
assignment, revision/idempotency, move/Open Existing and source hashes passed.
CPU/sandbox GPU attempts failed; native GPU execution created a real full-model
2.2s WAV, followed by actual full/clone/LoRA Script edit/reuse/Stop/retry/move UAT.
Two imported profiles retain provenance; words remain estimated. Frontend844 /
backend870/build and PCM/hash/boundary checks pass. Browser unavailable. Requests
for timing/delivery/gain/reference remain intent until later named processors.
Final automated results and commits are in the combined first-five gate; ADR0076
records persistence/selection/binding decisions. Next VM-REF-DETAIL-01 includes
clicking slot content to navigate both Timeline and Script. Phase03 remains60%,
no new portable. Existing source-library/Collection native-GPU UAT not completed.

## HUB-COLLECTION-01 — Hub and Collection feedback (2026-10-14)

Main-source hover/detail geometry, compact header, profile count, expandable
model rows and profile/model export selection delivered. Native ZIP selection /
folder export and archived-model >=15s PCM sample jobs preserve hashes/Script.
Verified Dataset Manifest snapshots provide duration for new archives; old
unknown metadata remains explicit. Frontend818, focused backend88, typecheck /
build and real browser evidence pass. Full backend848/3startup timeouts; exact
unchanged rerun3/0. Actual Anh Vũ CPU attempt stopped without WAV after583.06s.
HUB-COLLECTION-UAT-01 requires native dialogs and real trained GPU sample;
SOURCE-EXTERNAL-ASSETS-01 remains next implementation. No Phase03 advance or new
portable. See docs/gates/hub-collection-01-20261014.md.

## SOURCE-SYNC-01 — source publication and cleanup (2026-10-13)

Owner now prefers GitHub Desktop source sync for daily tests. Research notes
committed; redundant start/restart BATs removed; unique setup/upstream-update/
legacy pack BATs moved to scripts/maintenance. Root retains console/OBS install/
verify/update.7601temporary targets and2249empty directories removed; owner
projects/media/core/model/dependencies and issued packs retained. Final pass
0failures; Syncthing marker classification error recovered and protected.
Native focused63pass/2warnings, frontend menu4pass, typecheck/build pass.
Actual push of9a00345 to origin/feat/03-04-high-quality-training verified by SHA.
See docs/SOURCE-SYNC.md, ADR0074 and docs/gates/source-sync-01-20261013.md.
This configuration round does not advance Phase03 (60%) or issue a new portable.
Next SOURCE-EXTERNAL-ASSETS-01 implements full-source packaging and one local
core/model library path, verified Python/app/Studio origins and cross-drive
artifact parity. Current launchers still require the existing local runtime
layout; cloning alone is not runtime provisioning. Physical OBS/GPU and timing
acceptance remain open.

## PORT-FEEDBACK-03 — immediate media and voice slots (2026-10-13)

Main source emits slots before import/capture/generation awaits, with working
animation, static choice/error states and real receipt replacement. Mic/system/
HQ keeps capture identity and save retry; OBS Start ack refreshes/deduplicates
journals; separate OBS MKV import stays tracked across pages. Generate Voice
shows progress in the first Output row. No engine/model changes. Alpha0.5.13
ships identical154source/payload/installed entries; ZIP1,227,314bytes; native
root UPDATE33/0, base-layer manifest unchanged. Frontend814/84files, backend819,
typecheck/build/diff pass. Source/embedded portable held-import DOM/animation
match; real5s24kHz mono16-bit WAV source/cache hashes match, then pending clears.
See docs/gates/portable-feedback-03-20261013.md and ADR0073. Next exact round:
PORT-FEEDBACK-UAT-03 — D-drive0.5.13 apply and physical first-slot/working/error/
ready acceptance for import, mic/system/HQ, OBS and Generate, plus prior mixer/
bin/voice-transfer checks. Physical zero-PCM OBS cause and GPU/native acceptance
remain open; independent timing awaits Conviction. Phase03 stays60%.

## PORT-FEEDBACK-02 — source-first selection and voice transfer (2026-10-13)

Main source repaired before issuing alpha0.5.12. Only selected tracks own
players/Script; session Gain/Mute/Solo survives changing view/selection, S sits
below M and Mute wins. Failed stopped OBS journals now support menu/bin/restore
and confirmed deletion under processing/path guards. Voice Collection supports
verified external LoRA/full/RVC ZIPs retaining artifacts/lineage without base.
Frontend795/84files, backend819, typecheck/build pass; actual root UPDATE33/0,
154app byte/hash checks and1,223,639byte ZIP verified; model layer unchanged.
Source/embedded portable browser selection/mixer reports match; source export
imports into portable and native re-export retains payload/lineage. Evidence:
docs/gates/portable-feedback-02-20261013.md. Exact next PORT-FEEDBACK-UAT-02 is
D-drive0.5.12 apply, failed OBS menu/bin/restore, one/two-track/Mute/Solo and
actual trained voice ZIP/inference acceptance. Physical OBS zero-PCM cause
remains unconfirmed; independent timing awaits Conviction. Phase03 stays60%.

## PORT-REBUILD-01 — fresh portable and manual base copy (2026-10-13)

Alpha0.5.11 ships the current rebuilt app independently of twelve heavy base
components; VibeVoice stays listed without payload. Canonical Studio source,
atomic zero-failure readiness, shared OBS row actions and older versioned console
launcher migration verified. Frontend785/84files, backend799, installer33,
builder/completion9, typecheck/build pass. Actual hydrated root VERIFY33/0;
thin kit remains incomplete.151app hashes/1.17MiB ZIP verified; complete components
about35.6GiB.174routes/eightcatalogs match with intentional omissions/metadata
recorded; real PCM publishes MKA/analysis WAV and proper browser waveform.
No-PCM meter control matches error; owner D-take remains uninspected. Evidence:
docs/gates/portable-rebuild-20261013.md. Exact next PORT-FEEDBACK-UAT-01 uses new
D-folder/manual base copy/VERIFY/closed-OBS INSTALL, native Forward/durable PCM
capture, prior playback/STT/bin. Timing awaits Conviction; Phase03 stays60%.

## PORT-OBS-REPAIR-01 — default OBS installer recovery (2026-10-13)

Alpha0.5.9 changes the root BAT default to CLI auto mode: damaged or missing
installed files select Repair; healthy/fresh/older installs use Install.
WinPS native stderr capture now retains Python exit code and original reason.
Installer29pass, frontend785/84files, backend786pass, typecheck/build pass.
Actual received pack33/0,151 installed/ZIP hashes verified, models unchanged.
Embedded Python/real package probe repairs DLL/brand, preserves pairing and
refuses repair while simulated OBS runs. Real OBS/user profile untouched.
Evidence: docs/gates/portable-obs-repair-20261013.md. Exact next
PORT-FEEDBACK-UAT-01: owner applies0.5.9 on D-drive, closes OBS, runs root INSTALL,
reopens to confirm native plugin loading, then prior playback/bin acceptance.
UAC/OBS loading needs physical evidence; timing awaits Conviction. Phase03
stays60%.

## PORT-UPDATE-LOCK-01 — updater controller shutdown (2026-10-13)

Alpha0.5.8 detects/stops the whole portable stack before replacing services/api,
which the surviving controller held as its CWD. Verified free ports and real
process exit precede mutation; console reopening after update/rollback reloads
all roles. Native16pass, frontend785/785, backend779/779, typecheck/build pass.
Real embedded controller and installed pack33/0,151
payload/ZIP hashes verified, base/model unchanged, source PIDs survive final
isolated tests. Evidence: docs/gates/portable-update-lock-20261013.md. Exact next
PORT-FEEDBACK-UAT-01 is owner D-drive0.5.8 pack APPLY once, update retry and prior
playback/bin/native OBS checks. Native window/UAC/GPU evidence remains; Phase03
stays60%.

## PORT-FEEDBACK-01 — portable feedback repairs (2026-10-13)

Alpha0.5.7 includes Script/Timeline track identity after STT, Recycle Bin
content sizing/scrolling, native WinPS installer arguments/UTF-8/errors, OBS
pairing launcher migration and the four root BATs. Frontend785/785,
backend774/774, typecheck/build pass. Actual migration and final root UPDATE33/0,
151-file payload/ZIP verified, model inventory unchanged. Real embedded portable
UI and isolated installed BAT checks pass. Candidate0.5.6 is diagnostic-only
after integration found the OBS launcher gap. Evidence:
docs/gates/portable-feedback-20261013.md. Exact next round:
PORT-FEEDBACK-UAT-01 — owner applies0.5.7 on D-drive, retests parent/child
playback and bin, installs with OBS closed and verifies loading after restart.
Native target-machine/UAC/GPU behavior needs physical acceptance; Phase03 stays60%.

## PORT-STT-01 — portable STT catalog (2026-10-13)

The API catalog checked a development-only path, disabling all Whisper choices
and the STT button despite ticked footage. Resolve the bundled sidecar first;
production-endpoint/moved-root regressions and native Windows PowerShell probe
pass. Candidate0.5.4 was rejected and rollback confirmed before issuing0.5.5.
Actual alpha0.5.5 BAT31/0,153-file ZIP verified, base unchanged. Related
backend34/Media Pool56/typecheck/build pass; full755pass/3fail then those3pass
unchanged separately. Real portable CPU/int8 offline Largev3/Medium return21words,
4s PCM/source artifacts verified. See docs/gates/portable-stt-20261013.md.
Exact next round: owner's D-drive alpha0.5.5 update and Medium/Largev3 run.
Target-device performance and independent timing/recognition gates remain;
Phase03 stays60%.

## PORT-IMPORT-01 — native Media Pool connection (2026-10-12)

The real registry dropped selected native paths, confirmation/cancel, pending
work/errors and retry. The owner-reported silent import was reproduced before
the fix in tests and the installed portable UI. Four regressions now exercise
both real registry branches; affected frontend117/117, full784/784, related
backend9/9, typecheck/build pass. Source embedded-core UI imports real WAV.
Alpha 0.5.3 was allocated automatically and has a verified 153-file app-only
ZIP (1.16 MiB). Actual pack BAT passed30/0; updated portable UI imported WAV,
MP4 and two-track MKV, displayed errors/retry and retained media after reopen.
Six PCM24k mono artifacts and playback URLs passed; base manifest hash is
unchanged. See docs/gates/portable-media-import-20261012.md. Exact next round: owner's D-drive alpha
0.5.3 import retry and fixed-media STT benchmark. Phase03 stays60%.

## PORT-UPDATE-03 — numbered portable updates (2026-10-12)

Creating a pack increments patch automatically. The owner copies its original
numbered folder into `updates`; the portable discovers the newest compatible
version. The payload-root failure was reproduced and repaired; new pack
entrypoints apply alpha 0.5.1 to the actual portable with 30/0 gates.
Regression9/9 and UI build pass. Evidence:
docs/gates/portable-numbered-updates-20261012.md. The owner reported a successful
D-drive alpha 0.5.1 update with 30/0 gate. Startup and benchmark on that machine
remain; Phase03 stays60%.

## PORT-VERSION-01 — portable app release version (2026-10-12)

Source `APP-VERSION.json` defines alpha 0.5.0. The pack and installed app
manifests record it, and `VERSION.txt` labels the pack. Two BAT updates passed
30/0; same-version changed content and older version were rejected before
mutation. See docs/gates/portable-release-version-20261012.md. Physical
target-machine verification remains; Phase03 stays60%.

## PORT-UPDATE-02 — portable transfer handoff (2026-10-12)

UPDATE-PORTABLE.bat inside the development portable now creates a stable
updates/app-current pack after each successful app refresh. Repeated runs
and direct VERIFY-PORTABLE.bat passed 29/0. See
docs/gates/portable-update-handoff-20261012.md. The physical copy to
another machine and fixed-media benchmark remain; Phase03 stays60%.

## PORT-UPDATE-01 — app-only portable refresh (2026-10-12)

Source and portable BAT files create and apply a hashed app-only update.
The app and base runtime/model manifests are separate; the model payload is
untouched. Auto-discovered source update passed 29/0, tamper was rejected and
post-gate failure restored exact prior bytes. Evidence:
docs/gates/portable-app-update-20261012.md. Physical target-machine
verification and fixed-media benchmarking remain. Phase03 stays60%.

## USER-FEEDBACK-25 — Media cache choice and reveal (2026-10-12)

The primary host import and completed-container track dialogs offer “Cache
file”. The API now records original paths in the machine-local registry and
reveals original or project copy separately; project reveal is disabled when
uncached. Browser upload always creates a project-owned source. Focused API7/7,
frontend104/104, full frontend780/780, backend744/744, typecheck/build pass.
Native limits: `docs/gates/user-feedback-25-media-cache-reveal.md`. Phase03
stays60%.

## USER-FEEDBACK-24 — Script speaker turns (2026-10-12)

Ordinary and channel Script tables now show Speaker 1/2 labels before a Profile
is mapped. The selected-word menu reassigns a phrase to an existing
diarization speaker, deriving A–B–A or joining a neighboring matching row.
Word timing and raw speaker provenance remain unchanged. Focused70/70, full
frontend777/777, typecheck/build and backend742/742 pass. Native acceptance is in
`docs/gates/user-feedback-24-script-speaker-turns.md`. Phase03 stays60%.

## USER-FEEDBACK-23 — API readiness during project recovery (2026-10-12)

The incident's 23-project recovery scan took 41.657 seconds; API readiness
timed out at 61.067 seconds before Uvicorn bound its port. Slow recovery now
continues after the listener opens, with a one-second wait for fast projects.
Real Uvicorn regression and backend742/742 pass. Verify a source-launcher
restart on the owner's project set; rebuild the older portable bundle before
using it to test this source change. Evidence:
`docs/gates/user-feedback-23-api-readiness-recovery.md`. Phase03 stays60%.

## PORT-NOVIBE-01 — portable variant without VibeVoice (2026-10-12)

Built and locally verified the 35.98 GiB `NoVibeVoice` folder. VibeVoice model
choices remain listed as unavailable. Exact next portable round: copy the folder
to another machine, run its gate, and benchmark installed models against fixed
media. Evidence: `docs/gates/portable-no-vibevoice-20261012.md`. Phase03 stays
60%; STT-TIMING-ACCURACY-01 is still the next planned feature round.

## USER-FEEDBACK-22 — source-independent Script playback following (2026-10-10)

Product `6c2d714` fixes the missing archived/multitrack Script follow behavior.
ChannelScript previously highlighted source words but had no viewport-follow
effect. Ordinary footage, imported parent/child and archived OBS parent/child
now use shared source-aware playback following and virtual reveal. Deliberate
Timeline scrubbing resumes follow even within the same word; manual reading
still pauses it. Simultaneous tracks keep their highlights with one stable
scroll focus. Multitrack plain text follows/highlights without replacing native
editing selection, and VoiceScript tables share the follow policy. Audio and
word timings are unchanged. ADR0067 records the behavior contract.

Initial registry regressions failed5/6 before the correction. Final full frontend
772/84 passes in98.94s with two workers; typecheck/build/diff pass. Backend741
passes /2 existing warnings in192.19s. Default-worker validation initially had
an existing scroll timeout and live-caption assertion failure; the complete
bounded runs passed without changing assertions or timeouts. Evidence:
`docs/gates/user-feedback-22-script-playback-parity.md`.

Native browser acceptance remains: refresh OBS9 and an imported project, drag
to offscreen words, scroll Script manually, drag again within the same word and
switch parent/child or plain text. Controlled DOM geometry does not prove native
scroll/pixel behavior. Exact next planned round: **STT-TIMING-ACCURACY-01
independent anchor review** after the owner finishes the Conviction timing
reference, required for independent acoustic boundary measurement. Phase03
stays60%.

## USER-FEEDBACK-21 — canonical Script word spacing (2026-10-10)

Product `9faf5d3`: ChannelScript now uses the canonical `script-table__word-wrap` around each
word, as ordinary ScriptTable and VoiceScript already do. Inline spans had
allowed trailing spaces to contribute extra inter-word spacing in imported/OBS
channel transcripts. The existing inline-block wrapper gives these transcripts
the Conviction/screenshot1 spacing without a project-specific CSS adjustment.
Text, timestamps and commands are unchanged.

Two stylesheet regressions failed before the fix and pass after it. Focused38/4
passes, including editing, command routing and transcript-window tests. Full
frontend752/83 passes in97.32s; typecheck/build/diff pass. Backend741 passes /2 existing warnings in224.01s. Evidence:
`docs/gates/user-feedback-21-script-word-spacing.md`.

Refresh and compare Conviction and OBS9 at the same Script SIZE. Native glyph
geometry remains owner acceptance; computed-style/markup checks do not measure
it on the owner's device. Exact next: **STT-TIMING-ACCURACY-01 independent anchor
review** after the owner finishes the Conviction timing reference, needed for
independent acoustic boundary measurement. Phase03 stays60%.

## USER-FEEDBACK-20 — Script command parity (2026-10-10)

Product `c253313` removes row-selection/source-feed disabling of valid Script
controls. Row profile dropdowns always open, including an empty catalog, and
always offer Chưa gán Profile. Opening an unselected row selects it only when
there is no existing selection; assignment/unassignment touches selected rows.
The same control rule applies to ordinary footage, channels and VoiceScript.

Archived parents now supply real child documents to table/text, Find/Replace,
AUTO NHỊP, Clear Text, Export and AI fix. Each source retains its own offsets,
word timings and labels. Multi-document edits use one Undo/Redo step. AI
candidates remain choices; late replies preserve newer edits and removals.
Other shared-module routing was audited; matrix and limits are in
`docs/gates/user-feedback-20-script-actions.md`. ADR0066 supersedes ADR0065's
archived-aggregate action restriction. Pending live drafts still require an
archived word document for destructive/word-document operations.

Five original caller repros failed before the fix. Final frontend750/83 passes
in93.46s; typecheck/build/diff pass. Backend741 passes /2 existing warnings in189.09s.
No selection assertion or performance budget was removed or relaxed.

Native acceptance remains after refresh: try profile assign/unassign, selected
rows only, table/text, Find/Replace, pause formatting, Undo/Redo and parent
Export/AI fix in Conviction and OBS9. Automated evidence does not prove native
popup rendering. Exact next: **STT-TIMING-ACCURACY-01 independent anchor review**
after the owner finishes the Conviction reference, required for independent
acoustic boundary measurement. Phase03 stays60%.

## USER-FEEDBACK-19 — shared Script table (2026-10-10)

Product `278188d` makes ordinary footage, imported/archived channels, pending
OBS and VoiceScript use shared transcript table/header/row/speaker/selection
components. Separate channel cards are removed. Default columns and browser
column preferences now apply across projects and sources; legacy per-footage
keys are retained but no longer applied.

The profile dropdown is beside the16.8px checkbox (30% smaller), with its row
number underneath and channel name directly below the dropdown. Selected-only
assignment/unassignment remains; VoiceScript plain-click untick is repaired.
Text formatting and vertical scrollbar chrome are shared. Aggregate/live
export/clear/AI controls remain visible but disabled until a child document is
opened; live segment timing/profile readiness is not represented as archived
word data.

Focused92/7 and full frontend728/80 pass; typecheck/build/diff pass. Backend:
741 passed /2 existing warnings in206.62s. Full frontend preceded the final
code-tag timestamp/title polish, then all92 affected tests and typecheck/build
passed again. Evidence: `docs/gates/user-feedback-19-script-layout.md`;
shared presentation contract: ADR0065.

Native acceptance remains after refresh: compare Conviction and OBS9 parent/
child rows, checkbox/profile/track layout, long scroll and Voice Model selection.
DOM/CSS regressions establish structure and styles, not appearance on the owner's
device. Exact next: **STT-TIMING-ACCURACY-01 independent anchor review** after the
owner completes the Conviction benchmark. Phase03 stays60%; acoustic timing
accuracy, production defaults, media and model jobs are unchanged.

## USER-FEEDBACK-18 — subtitle text insertion (2026-10-10)

Product `3186a8e` adds **Add text** to subtitle context menus and an
inline multiword editor on double-clicking a timing gap. Ordinary, imported
multitrack and archived OBS lanes share the editor. Hidden words still edit by
source timestamp; Ctrl-click and existing word actions remain available.

Inserted tokens receive separate equal positive provisional spans with small
spacing, bounded by adjacent words/audio end. Exact old word identities and
timestamps survive, including repeated text and tiny gaps. A no-room insertion
shows an inline alert and commits nothing. Enter/blur commits once; Escape
cancels. The input remains inside the viewport and Script updates through the
existing asset callback/history path.

Focused102/5 and final frontend715/78 pass; typecheck/build/diff pass. The first
full run714/1 exposed hidden-word editing and was repaired without changing its
assertion or DOM budget. Full backend: 741 passed /2 existing warnings in227.20s.
Evidence: `docs/gates/user-feedback-18-subtitle-text-insertion.md`.

Native device acceptance remains after refreshing the built UI. Exact next:
**STT-TIMING-ACCURACY-01 independent anchor review** when the owner finishes
Conviction. That reference matters because provisional interpolation is not
acoustic truth. Phase03 stays60%; timing defaults/budgets remain unchanged.

## USER-FEEDBACK-17 — subtitle grips and word visibility (2026-10-10)

Product `3669099` / `05a5ce9` repairs subtitle rendering in one bounded round. Trim grips
sit outside and above readable word boxes; a separate clipped label keeps text inside.
Grip width reserves no layout/time space and selection changes no source words
or neighbouring timestamps. Compact overview stripes retain hidden grips.

The missing previous word was reproduced through Timeline audio-clock updates:
floating-point pixel collisions/search boundaries dropped a touching readable
box when the active neighbour changed. Shared density arithmetic now preserves
these boundaries at1e-6 pixel precision, with strict4px compact occupancy and
visual overshoot clipping. Ordinary, imported and archived OBS views use the
same helper; focused editors share the Timeline label/grips.

Original-product replay has3 regression failures (5px grip intrusion, density
omission, missing DOM word). Repaired focused36/4 and full frontend704/78 pass;
typecheck/build/diff pass. The full pass uses two workers with original test
budgets retained, after a loaded default run failed Script wheel/live-caption
checks; affected files also pass separately58/2. Full backend: 741 passed / two existing warnings in223.39s.
Gate `docs/gates/user-feedback-17-subtitle-grips-visibility.md` records evidence
and resolved test-setup failures. No owner runtime restart/model job/media edit.

Native screenshot/audio acceptance remains after reloading the built UI; the
prior automatic browser approval rejection is respected without a workaround.
The owner will carefully review timing in Conviction. Exact next remains
**STT-TIMING-ACCURACY-01 independent anchor review**: after owner confirmation,
freeze the reviewed regions/PCM/word identities as a separate benchmark copy.
That project can supply anchors without repeating the offline worksheet. Human
IN/OUT accuracy remains unmeasured, timing defaults unchanged; Phase03 stays60%.

## STT-TIMING-ACCURACY-01 — isolated screen and anchor tooling (2026-10-10)

Measurement/tooling `08918b7` retains three exact mono PCM16/24kHz crops
(OBS9 236–272s; speech-2 55–66s and 75–82s), 148 native and edge-refined words
from the same private CPU/int8 Studio passes, and a separate cached Vietnamese
250h CPU alignment. Production timing defaults and owner runtimes are unchanged.

Candidate has 150/150 raw timed words. OBS confidence >0.3 is 97/104 =93.27%,
below the unchanged95% gate. Two cases contain leading transcript words absent
from the native timed-word lists; safe identity mapping is withheld rather than
shifted. Safe comparison coverage is104/148 =70.27%, below98%. Pooled candidate
VAD-proxy onset mean142.53ms also exceeds80ms; this is not human IN/OUT truth.
Short-crop intervals have no invalid/zero/overlap cases; prior zero-PCM timing
remains unresolved because decode context changed.

The blind offline worksheet has24 targets, exact audio and empty manual IN/OUT.
The scorer binds protocol/audio/word identity, reports missing/lexically corrected
words and checks IN/OUT p95 separately against250ms. Human anchors are absent:
errors and acceptance remain unmeasured. No timing winner/default is accepted.

Focused23 and full API741/two existing warnings pass; compile/JS syntax/diff
checks pass. Prior frontend701/77/typecheck/build is carried, not rerun. Closure
rehashes23 previous read-only sources, both current PCMs and all3 crops unchanged.
Recognition RSS is unavailable; alignment RSS is measured. First NLTK path denial,
protocol amendment and derived clock repair are retained transparently in the
gate. Browser/audible acceptance remains unverified; no automation workaround.

Gate `docs/gates/stt-timing-accuracy-01.md` and aggregate JSON document evidence.
The bounded profiling/tooling slice is complete; Phase03 remains60%. Exact next
**STT-TIMING-ACCURACY-01 independent anchor review**: receive the matching
`reviewed-anchors.json` from the worksheet, measure paired errors, and resolve
untimed leading-word identity before a bounded correction or default change.
Broader speaker coverage and native Script/Timeline acceptance remain open.

## STT-GAP-02 — retained gap review and common-context screen (2026-10-10)

Measurement `cd86683` freezes reference PCM/protocol and retains real Studio
responses plus publication artifacts. Serial cached large-v3 A/B uses two
116.454s curated speech tracks and125s zero PCM:10 requests. Common60s owned
blocks +2s context improve micro CER11.2831 ->7.8382% and WER13.6364 ->9.5779%;
bounded text passes the inherited10%/20% screen. Pure silence emits zero words
in both modes. Publication handoff keeps the same text/counts, resolves one
raw seam overlap and has zero final overlaps; timing provenance stays partial.

Owner supplied independently heard/reference OBS9 text. The corresponding
expanded101-word passage scores CER30/310=9.6774%, WER13/101=12.8713%; this is
post hoc lexical review with context, not a77-word-only or acoustic timing gate.
All1,177 retained OBS words map one-to-one to owning raw records; starts are
unchanged and ends shorten at most20ms. No owner word data was replaced.

One bounded word interval remains wholly inside inserted zero PCM; lexical
hallucination versus neighboring-word displacement is unresolved. Independent
word anchors are absent, so <=250ms IN/OUT p95 is unmeasured. Focused API34
passed5.60s, profiler compile/reanalysis/diff pass,23 source hashes unchanged.
Full API718 and frontend701/77/typecheck/build are carried, not rerun. Studio
health ok/controller running; no restart/browser automation/source mutation.
Gate `docs/gates/stt-gap-02-context-screen.md` and aggregate JSON retain evidence.

Bounded STT-GAP-02 review/screen is complete; Phase03 stays60%, no acceptance
budget changes. Exact next **STT-TIMING-ACCURACY-01** independently anchors OBS
and boundary/zero-PCM words, measures timing, and screens a bounded correction.
Native Script/Timeline audio acceptance and broader speaker coverage remain.

## USER-FEEDBACK-16 — profile nesting and OBS word sync (2026-10-10)

Product `cc1a8fa` nests trained ProjectVoice models inside independently
expandable Speaker Profile slots, initially collapsed, with accessible counts
and retained selection/context/Collection controls. Imported models still hide
Add to Collection. Properties stays in its header column even without models.

Archived OBS now publishes per-asset active word indexes and accepts Script
seeks through the shared playback store. Subtitle clicks seek audio as well as
the playhead; single-track Script selection and repeat clicks seek correctly.
Silence clears highlights; asset refresh does not rewind. The focused standard
Timeline owns its clock and has local selection when opened from multitrack.

Real ModuleRegistry regressions fail before the repair and pass afterward;
review caught and repaired the multitrack focused-selection gap. Final frontend
701/77 files, typecheck/build/diff checks pass. API718/twoexistingwarnings is
carried from STT-GAP-01, not rerun. Read-only OBS9 confirms two stem/asset/parent
identities and original1094/42 word arrays; six metadata hashes are unchanged.
Gate user-feedback-16-profile-obs-sync; ADR0064. No source/model/data mutation
or runtime restart. Reload the built UI for the new frontend.

Native layout/audio interaction still needs owner acceptance because repository
jsdom tests cannot prove playback on the device; prior automatic browser review
rejection remains respected. Phase03 stays60% and recognition/timing budgets
remain open. Exact next development round **STT-GAP-02** reviews recovered gap
text and other long/boundary/silence samples; STT-TIMING-ACCURACY-01 remains open.

## STT-GAP-01 — OBS recognizer context repair (2026-10-10)

Product `2ebada4` repairs a reproduced recognition-context omission on real
OBS9 audio. Full406s input returns1,094 words and none in240.352–269.020s
before merging; raw recognizer segments also omit the region. VAD retains
speech there and a guard-off candidate is identical/rejected. Common Studio
requests now use60s owned intervals with2s context; initial frozen OBS snapshot
semantics remain. Both detailed and ordinary archive production copies retain
1,177 words, including77 in the gap. Each submitted PCM slice matches source;
1,325 source hashes stay unchanged and the owner still has its original words.

Merge recovers nonconflicting padding words, gives owning intervals priority,
sorts final output and rejects untimed segment text instead of hiding it.
Final retained real-response merge is unchanged; stored intervals have no
overlap/reversal. Source timing warnings remain. Full API718/twoexistingwarnings,
focused31, script compile/diff pass. Frontend696/77/typecheck/build is the
unchanged carried baseline. Gate stt-gap-01-obs-recognizer-context; ADR0063.

Normal controller/API/Studio health is ok; no service restart or browser
workaround. Restart loads the changed API, then explicitly rerun the selected
footage for new STT. Phase03 stays60%; word accuracy and reviewed IN/OUT budgets
are not satisfied by restored coverage. Exact next **STT-GAP-02** reviews77
recovered words and screens other long/boundary/silence samples; existing
STT-TIMING-ACCURACY-01 and native UX acceptance remain open.


## USER-FEEDBACK-15 — Collection profile/model import selection (2026-10-09)

Product `a06c2f8` groups Collection models by exact source project and Speaker ID.
Parent checks select all archived models in that Collection; expanded child
checks select a subset, with mixed parent state. Fixed import action adds no
selection toolbar. Imports run serially with catalog flush before every request;
confirmed models leave selection, failed/unprocessed models remain for retry.
Workspace publishes its changed catalog snapshot synchronously to the transfer
ref, preventing pre-render flush from dropping confirmed profiles.

API imports reuse one destination profile for the same archived origin, retain
manual edits and recover legacy markers/catalogs. Profile consent proof has
independent project ownership; each model retains its archived evidence/hash
snapshot. Copy/save failures roll back new artifacts. Lead review repaired header
CSS specificity and a reproduced child-folder containment gap. Existing artifact,
checkpoint and publication gates remain; unrelated equal names never merge.

Final frontend696/77, API712/twoexistingwarnings, typecheck/build/diff pass.
Focused UI8, Workspace44, Collection API22; isolated legacy proof/manual-edit/
actual-deletion check1 pass. Gate user-feedback-15-profile-model-import, ADR0062.
Native grouped-checkbox layout and audible owner-model output remain acceptance
after restart: fixtures prove transfers, not inference quality. Owner projects,
models and normal runtimes remain untouched; Phase03 stays60%. Exact next
STT-GAP-01 retains isolated OBS recognizer/merge evidence before missing-word repair.


## USER-FEEDBACK-14 — Library menus and imported generation (2026-10-09)

Product `99dc301` moves profile color/apply/delete/deselect and model bulk
delete/deselect into right-click menus. Tick selection inserts no toolbar.
Selected ranges, nested model scope, keyboard navigation and focus are retained.
Labels distinguish Speaker Profile identity from the trained ProjectVoice model.
Optional Collection origin persists on new imports and projects from bounded
legacy markers without rewriting owner records; imported models hide Add to
Collection. A generation category override makes imported trained voices available
immediately and on reopen without changing Training settings; a compact selector
permits manual category choice. Existing publication/engine gates remain.

Final frontend690/77, API706/twoexistingwarnings, typecheck/build/diff checks pass.
Gate user-feedback-14-context-menu-collection-generation and ADR0061 retain
red/green evidence and the old-toolbar caller test update rationale. Read-only
OBS9 confirms its existing full model is imported. Native narrow-menu layout and
audible generation remain device acceptance after restart; mocks prove request
routing, not model quality. Phase03 stays60%; owner media/model/runtime unchanged.
Exact next STT-GAP-01 retains isolated recognizer/merge evidence before repairing
missing OBS words, so existing text is not replaced without recognition evidence.


## USER-FEEDBACK-13 — contained Sound Library and Script row controls (2026-10-09)

Product `1532c47` contains profile/voice controls in compact Sound Library slots,
with fixed selection boxes, separate voice actions and explicit Properties.
Shared list bounds cover Input, standalone and Voice Manipulator. Channel Script
places profile choice with leading row controls. Plain ticks toggle membership;
Shift/Ctrl+A and selected-row-only assignment remain. Explicit null word speaker
IDs survive Script/Workspace/Timeline and compiler ownership, preventing cleared
rows from inheriting the footage default. Raw diarization remains provenance.

Frontend682/77, focused Script56/3 and compiler34 pass; typecheck/build pass.
Full API704/twoexistingwarnings and diff checks pass. Gate user-feedback-13-library-slots-script-profile,
ADR0060. Owner restart/reload and narrow-panel containment, clear/reopen and long
Script-end acceptance remain device gates. Native rendering cannot be proven by
source/jsdom checks. Phase03 stays60%; no owner media/model/runtime mutations.
Exact next STT-GAP-01 retains isolated OBS recognizer/merge evidence before repair.


## USER-FEEDBACK-12 — shared Timeline scale and Voice Collection (2026-10-09)

Product commit `23e6494` aligns standard/imported/OBS Timeline zoom and absolute
rulers at1,000px/s, including positive sub10ms fit, while retaining120s live feed
limits. Consent form spans the shared Sound Library, uses14px checkboxes and
Browse for project-owned evidence, with separate uploadAllowed permission.
Project Library Voice Collection and all Sound Library routes share create/list,
Add to Collection and Import from Collection, common classification properties,
portable copied artifacts and source provenance. Completed retained checkpoints
and published/passed linked-set gates are enforced; copy/retry/re-export hashes
stream and Windows checkpoint separators normalize without relaxing containment.
Catalog writes serialize; an independently reviewed350ms debounce race has a
red/green Workspace caller test and explicit synchronous timer cancellation.

Final frontend672/77, API703/twoexistingwarnings, typecheck/build/diff checks pass.
Focused Timeline88/5, backend35/4 pass; initial API699/oneWindows Stop confirmation
failure is retained, isolated1 and final full703 pass without Stop code changes.
Real retained LoRA fixture reaches its pending gate rejection; five source hashes
match and no entry publishes. Synthetic bytes verify transfer, not model quality.
Gate `docs/gates/user-feedback-12-zoom-consent-collections.md`, ADR0059. Owner must
restart to load new API/UI and accept max zoom, consent layout and collection
reopen/import on the device. Earlier browser policy rejection remains respected.
Normal runtimes/models, owner media/transcript and upstream are untouched. Phase03
stays60%; quality/calibration budgets remain open. Exact next STT-GAP-01 retains
isolated recognizer/merge evidence before replacing missing OBS word text.

## USER-FEEDBACK-11 — 2026-10-09

Commit `9c6c696` repairs React185 at an archived Script boundary. Row minimum
height changed with a one-word continuation; measured offsets updated while
viewport still held the previous position, alternating windows/corrections.
Publish matching corrected viewport and measurements in one batch, retaining
postcommit browser clamp/readback and existing presentation/scrollbar. Minimal
65+600-word hook and OBS9-shaped ChannelScript caller both reproduce the exact
maximum-update-depth error on baseline and pass after repair. Full frontend659/75,
focused20/4, typecheck/build/diff pass; API687 remains carried08 baseline.
Owner confirms jitter/runaway ceased and scrollbar present after10; end error
acceptance is now UX-SCRIPT-END-DEVICE-01 after reload. Gate
`docs/gates/user-feedback-11-script-end-react-depth.md`, ADR0058. Exact next
executable STT-GAP-01 retains isolated recognizer/merge results before replacing
owner text. No source media/transcript, services/models, schema/upstream or
Phase03-budget changes; stays60%. Native all-route/audible/device gates remain.

## USER-FEEDBACK-10 — 2026-10-09

Commit `9fcd554` stabilizes shared Script scrolling: semantic measurement caches,
anchor-preserving height changes, logical-row chrome and header offsets, and
manual browsing priority over playback/data-refresh follow. Table, prose,
archived channels and OBS realtime now share an explicit keyboard/pointer
scrollbar. Table toolbar no longer expands the scrollbar's region. Read-only
owner topology explains different routes: OBS1,136 words/10 turns/25 fragments;
Conviction665/15/19; PDCA42,107/3/659. Three red regressions reproduce anchor
movement, refresh cache churn and Script refresh returning5,000->0; green now.
Full frontend654/75 before final toolbar containment refinement; final focused
53/4, typecheck/build pass. Backend unchanged; API687 is carried08 baseline.
Gate `docs/gates/user-feedback-10-script-scroll.md`, ADR0057. Natural wheel
smoothness, end reachability and visible OBS scrollbar on the owner device still
need UX-EDITING-DEVICE-01 after reload; source/jsdom is not that acceptance.
Exact next executable STT-GAP-01 retains recognizer/merge artifacts on an isolated
copy; native Script acceptance can proceed alongside. No owner media/transcript,
normal service/model, schema/upstream or Phase03-budget change. Phase03 stays60%.

## USER-FEEDBACK-09 — 2026-10-09

Commit4568e3f repairs paused zoom/metadata/drag-release view movement, archived
playback follow and standard PCM detail after Stop. Repeated status/journal refresh
regression preserves the04:00 window. Actual owner media verifies normalized1ms
peaks and unchanged source hashes. Final realtime segment notes expose gaps in
trusted detailed-word coverage without changing word data or STT completion.
Frontend646/74, typecheck/build and relevant API waveform2 pass; full API687 is
carried08 baseline. Gate `docs/gates/user-feedback-09-obs-archive-view.md`, ADR0056.
Exact next STT-GAP-01 reproduces missing words on an isolated copy with retained
recognizer/merge artifacts: actual28.668s gap has audio/realtime text but no raw
segment checkpoints. UX-EDITING-DEVICE-01 natural scrolling, Stop waveform and
audible playback acceptance remains; original rapid jumping is not device-proven.
No services/inference/owner media or transcripts/schema/upstream changed. Read-only
normal closure status is API stopped/Studio running/busyfalse; restore normal
service operation before owner acceptance. Startup/device/LAN/word-truth and
Phase03-budget requirements remain.

## USER-FEEDBACK-08 — 2026-10-09

Removed unnecessary CA/proxy work for controller HTTP loopback clients. Controlled
Uvicorn/environment/early-import regressions pass; CLI captures bounded startup
frames and launchers preserve previous nonempty output. API687/two existing
warnings passes with E temp storage; initial C full fixture errors are recorded,
no owner files deleted. Actual normal controller1.897s/Studio4.354s/API11.393s
readiness passes; runtime/health running/ok and normal stack left up.
Gate `docs/gates/user-feedback-08-controller-readiness.md`, ADR0055.
Original PID25916 stack and idle/cold reliability remain unproven. Exact next
RUNTIME-READINESS-DEVICE-01 records normal idle/cold starts; then UX-EDITING-DEVICE-01
native OBS Stop/waveform/playback/editing acceptance. Frontend07 evidence carried.
No manual inference dispatch, schema/upstream or Phase03-budget change; stays60%.

## USER-FEEDBACK-07 — 2026-10-09

Owner confirms Record signal/overlap detection. Logged406-second stopped overview
exceeded the backend live120-second cap. Stopped full snapshots now permit bounded
recording duration with incremental600-bin extrema; live/cursor120 caps remain.
Immediate journal refresh and same-take overlapping bins retain Stop waveform.
Actual copied owner envelopes pass with600 audio points/channel; baseline adapter
reproduces422. Original MKA/two WAV hashes unchanged. Frontend639/73, API682/two
existing warnings, typecheck/build pass; gate:
`docs/gates/user-feedback-07-obs-stop-waveform.md`, ADR0054.
Exact next UX-EDITING-DEVICE-01: reload, existing take overview and native >120s
Record -> Stop -> waveform/zoom/playback, plus prior editing/scroll acceptance.
Reviewed STT word truth and browser/physical/quality/LAN prerequisites remain.
No normal service/model, owner media or schema mutation; Phase03 stays60%.

## USER-FEEDBACK-06 — 2026-10-09

One-pass deletion preserves surviving word identity and commits once. Large Script
deletion runs in a Worker with cancellation/fences; pending/error feedback retains
UI control and source data. Changed-text history skips full snapshot serialization.
Table/prose timing notices scroll outside the transcript value with measured
virtual/overlay offsets. Logged historical-owner KeyError no longer blocks current
OBS journal writes; missing completed journals retain explicit errors. Fresh PCM,
waveform/transcript fixture and actual Worker bundle pass. Frontend637/73,
API680/two existing warnings, typecheck/build pass; gate:
`docs/gates/user-feedback-06-script-deletion-and-obs-journal.md`, ADR0053.
Next UX-EDITING-DEVICE-01 real long-footage deletion/scroll and native OBS acceptance
needs permitted device checks after reload. STT-TIMING-ACCURACY-01 word truth remains.
No normal service/model, owner media or schema mutation; Phase03 stays60%.

## USER-FEEDBACK-05 — 2026-10-09

Timeline word edits route shared30-step history across overview/focused editors;
live drags cancel before undo. Per-word4px spatial filtering preserves source
identity with zoom detail. Atomic IN/OUT and direct drags warn at actual collisions,
retaining10%; tiny words/noncontiguous selections remain valid. Positive estimates
retain original timing and remain untrusted. Promotion guidance is a2s hover portal.
Studio phrase-edge fences prevent cross-word/adjacent-gap overlap. Frontend627/71,
API679/two existing warnings, typecheck/build pass; gate:
`docs/gates/user-feedback-05-timeline-word-timing.md`, ADR0052.
Next STT-TIMING-ACCURACY-01 needs reviewed word truth and isolated comparison;
`docs/STT-TIMING-ACCURACY-PLAN.md` records previous aligner tail regression.
UX-EDITING-DEVICE-01 visual/audio and older prerequisites remain. No normal
service/model, owner-media or schema change; Phase03 stays60% and R5/R6 gates hold.

## USER-FEEDBACK-04 — 2026-10-09

Fragments remain bounded inside one speaker row; explicit/inherited same profiles
merge. Fixed selection controls and ordinals, checked-row-only attribution,
pointer/focus Ctrl+A and thirty-step project-session undo/redo are delivered.
Cross-track speaker assignments undo as one action. Dense subtitle summaries
restore readable overview text with zoom detail and original source timing.
Frontend611/70, API677/two existing warnings, typecheck/build pass; current gate:
`docs/gates/user-feedback-04-script-rows-subtitles-and-history.md`, ADR0051.
Owner confirms responsiveness from03. Next UX-EDITING-DEVICE-01 needs permitted
visual/theme/ordinal/subtitle/history/scroll and audible evidence. Existing tool
restriction and older physical/quality/download/LAN gates remain. Phase03 stays60%.

## USER-FEEDBACK-03 — 2026-10-08

Animated import placeholders precede metadata/cache choices and retain same-name
feedback. Expandable folder slots replace breadcrumb navigation. Multi-select
retains list IDs without loading Script/Timeline; bulk ticks change immediately
and save in order, fenced against stale opens/reads. Long Script fragments and
dense subtitle overviews bound mounted DOM while retaining full source indexes.
Frontend602/69, API677/two existing warnings, typecheck/build pass; limits in
`docs/gates/user-feedback-03-media-tree-and-responsive-selection.md`, ADR0050.
Next UX-EDITING-DEVICE-01 requires allowed real browser/native, real-STT selection
and scroll, and audible checks. Existing tool restriction and older physical/
quality/download/LAN gates remain. Phase03 stays60%; Queue is still proposed.

## USER-FEEDBACK-02 — 2026-10-08

Larger device Import and separate Host chooser, corrected root breadcrumb,
stale-read lifecycle fence and STT/DIA/Training activity implemented. Shared
pointer preview covers ordinary, middle alignment, multitrack and archived OBS,
preserving gain/mute, excluded boundaries and release/source cancellation.
Frontend593/68, API677 and typecheck/build pass; API results/timing caveat are in
`docs/gates/user-feedback-02-media-and-audio-scrubbing.md`. Queue tabs/hierarchy
and durable GPU dispatcher are proposed, not implemented. Exact next
UX-EDITING-DEVICE-01 still needs allowed visual/native, real-load and audible
checks; browser tool restriction and older device/quality/LAN gates remain.
Phase03 stays60%.

## USER-FEEDBACK-01 — 2026-10-08

Startup/Open Existing reconcile orphan STT/DIA; dedicated checkpoint ownership
is validated and removal fences all affected workers. Shared all/missing choice
dispatches only confirmed targets. Generate force uses new clips and hands over
GPU before terminal status; eligibility verifies WAVs and effective settings.
Icon Import/folder-plus, independent media loading, deferred selection feedback
and shared compact subtitles are implemented. Frontend580/67, typecheck/build
and API677/two existing warnings pass. Actual recycled PDCA MP3 flag
repaired; completed results preserved, Test_OBS_05 valid resumes retained.
Exact next UX-EDITING-DEVICE-01 needs allowed UI/device and real-load evidence;
older quality/identity/physical/download/LAN gates remain. Phase03 stays60%.

## TASK-STOP-DEVICE-01D1–01D3 — 2026-10-07

Resume dev-token cache and Windows tokenizer process pressure repaired. Actual
Generate queue/hard Stop/rerun retains WAVs. Actual Training Stop reaps four
processes and retains11 checkpoint hashes; same-run checkpoint5 Resume completes
20, publishes LoRA and generates WAV.19 retained source/reference hashes agree.
API658, frontend560/63, typecheck/build pass; fixture services cleaned. See the
four01D gates. Next UX-EDITING-DEVICE-01 needs native/audio/load evidence; older
physical/download/LAN and trusted recognition/speaker labels stay open. API
checkpoint-list freshness and unfinished-save recovery remain separate notes.

## TASK-STOP-DEVICE-01C — 2026-10-07

Cancellation settles STT/diarization activity instead of leaving a running
footer. Failed acknowledgement remains failed; first Stop stays running.
Real GPU/new-API and focused regression proof in the01C gate. Exact next01D:
Training checkpoint Resume/Generate Stop using compatible project artifacts.
Owner selection is pending; fixture services/token copy are cleaned.

## TASK-STOP-DEVICE-01B — 2026-10-07

Real community-1 No/Yes/rerun preserves completed spans and all seven WAVs.
See `docs/gates/task-stop-device-01b-diarization.md`. Exact next01C repairs
the observed stale Activity Center task after STT/diarization cancellation.
Training/generation and physical acceptance retain their prerequisites.

## TASK-STOP-DEVICE-01A — 2026-10-07

Real Medium/CUDA No/Yes/rerun passes with actual worker reaping and stable
cancelled records/source PCM. Gate: `docs/gates/task-stop-device-01a-stt.md`.
Next01B runs community-1 diarization. Training Resume and generation need their
compatible project artifacts; physical OBS/native evidence remains separate.

## TASK-STOP-01 — 2026-10-07

STT, diarization, training and generation share queue Stop with a repeated-click
Yes/No dialog for active cancellation. Owned subprocess control and result
fences preserve completed artifacts/PCM/checkpoints. See the task-stop gate and
ADR0047. Next: TASK-STOP-DEVICE-01, real-model Stop then rerun/Training Resume
after normal app/Studio restart. UX-EDITING-DEVICE-01 remains open.

## UX-INTEGRATION-01 — 2026-10-07

Nine requested UX rounds execute under the owner's all-round override. Portable
organization, concurrent multi-file import, shared Script/subtitle edits,
provisional timing and effective working/cut intervals are integrated.
The real PCM and browser fixtures retain source hashes; interpolation never
claims verified recognition. See `docs/gates/ux-editing-2026-10-07.md`.
Next: UX-EDITING-DEVICE-01 — the four owner checks after normal app restart.
Older near-term parents and Phase03-04 retain their documented prerequisites.

## Current Position

Phase: 3 of 7 (Voice Training)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-10-07 — Real Training Stop/Resume and Generate artifacts checked.

Progress: [████████████░░░░░░░░] 60% artifact count (product phases: 1/7 complete)

The 60% figure is GSD's 6/10 plan-summary artifact count. It is not product
completion: historical Phase 02 summaries and a seam-only Phase 07 plan count,
while user-visible success criteria in Phases 2-7 remain open.

## LIVELINK-STT-19B6 — corrected latency attribution (2026-10-05)

Completed paced replay with in-memory timing probes: post-last-offer p95
6.734s, intended source-end p95 6.891s, semaphore wait/session p95 1.578s,
HTTP/session p95 4.610s, event persistence p95 0.188s. CER19.62% still fails
15%; WER24.19% passes30%. Zero errors,29 final spans/input lengths agree,
16 source hashes unchanged. Run1 timing invalid; interrupted run2 retained,
cause unknown. Cachedmedium CUDA inference; no product setting change or
physical OBS timing claim. See `docs/gates/livelink-stt-19b6-timed.md`.
Nine near-term parent rounds remain. Next19B7 isolates1.1s boundary with
preserved quiet PCM; 03-04A durable-session implementation proceeds separately.

## LIVELINK-STT-19B7 — preserved-context boundary rejected (2026-10-05)

One1.1s boundary candidate with repaired quiet PCM reduces final spans29->16,
but CER19.62->20.92% and WER24.19->26.14%; reject, retain0.5s default.
16/16 source spans and hashes match, no errors. Timing is confounded by the
concurrent fullbackend suite and additional Studio model load; no causal speed
claim or repeat. See `docs/gates/livelink-stt-19b7-1s-pcm.md`.
Full19A/19B CER, reviewed word anchors and physical OBS timing remain open.
Nine near-term parent rounds remain; no phase advance or budget relaxation.

## 03-04A — durable Reading Session recovery (2026-10-05)

Server-owned pack/Speaker/card snapshot, revisions, take receipts, measured
coverage, skip/end and reopen now persist with the project. Stable capture IDs
recover lost upload results without duplicate assets; unpublished intents retire
without trapping the card. UI restores HQ in IDLE, requires explicit Speaker,
holds uncertain takes for exact retry and keeps card text instead of live ASR.
Real synthetic3s WAV/API and browser proof survives Unicode folder move,
Open Existing and official API restart with identical source/audio hashes.
Frontend507/58 files, backend570/twoexistingwarnings, typecheck/build/diff pass.
See `docs/gates/03-04a-durable-session.md` and ADR0045.
03-04 remains open for QC, flow segmentation, emotion blocks, references, tier
policy and identity acceptance; per-take Media Pool receipts are intermediate.
Nine near-term parents remain. Exact next acceptance requires reviewed19A
word/video anchors and physical OBS clocks, or trusted03-03C speaker labels
(owner question pending); no phase or budget advance is claimed.

## Verification Baseline

## LIVELINK-CONNECT-01 — Preferences transport recovery (2026-10-04)

Owner reported Failed to fetch and native Disconnected. On inspection both API
and controller proxy answered installation/status requests normally, but OBS
was closed. Opened installed OBS through the existing API action; its real
hello/heartbeats returned 200 and connection became connected. Pairing remained
valid; no token reset, binary update or source media mutation was necessary.
The original outage trigger was not captured and is not attributed to pairing.

Preferences had a reproducible separate defect: an initial transport rejection
left its checking/error state indefinitely. It now retries only status GETs
every three seconds after fetch TypeError, clears errors on recovery, cancels
retries on unmount and suspends them during manual actions. Install/Repair are
never automatically repeated after an uncertain result. Removed obsolete text
claiming native Tools integration was still planned.

Regression baseline: 2 failed / 3 passed. Fixed: 5 passed. Full frontend 468
passed / 55 files; typecheck/build pass. Portable backend installation/connection
suite: 17 passed. Browser at the controller URL shows Preferences installation
status, actual OBS path and running state without Failed to fetch. Test_OBS 7
mixer shows Connected and six currently available source rows; API inventory
also retains missing source identities (22 total), not 22 currently active rows.

Installed binary differs from the current package but connects correctly; an
update requires OBS closed and is not claimed performed. API startup/native
failure acceptance and sustained capture/STT quality remain open. Exact next:
LIVELINK-INGEST-18A, profile six-source spool and Stop tail.

## RUNTIME-READY-01B — Recovery storage waits (2026-10-04)

Resumed MKV STT could block Uvicorn before socket binding while reading project,
checkpoint or track metadata. Real Uvicorn regressions independently hold each
storage seam: baseline **3 fail**, repaired **3 pass**, with health available
while the read still waits and checkpoint bytes unchanged. Worker project reads
and MKV metadata reads now use threads under existing locks. A bounded Python
startup observer logs frame locations at 15/30/45 seconds if binding has not
completed; no faulthandler timer is installed and readiness budgets are unchanged.

Six full-console launches after the storage repair passed (API **3.184–5.023 s**)
and **306 HTTP checks**, including a 63.750-second final monitor. Final backend
**516**, portable media/readiness regressions **23** and diagnostics **4**,
frontend **465 / 55 files**, typecheck/build pass. Final entrypoint and full-suite
results: `docs/gates/runtime-ready-01b-recovery-storage.md`.

The historical intermittent timeout/native crash did not naturally recur;
its complete cause remains unconfirmed. RUNTIME-READY-01B completes the bounded
storage mitigation/diagnostics slice, not native-failure acceptance. Exact next:
**LIVELINK-INGEST-18A**, profile sustained six-source spool and Stop tail while
retaining the runtime gate. New runtime failure must be repaired from captured
evidence; the approximately five-minute Stop-to-archive gap remains open.

## RUNTIME-READY-01 — Owner startup timeout follow-up (2026-10-03)

Owner PID 35832 timed out before its API listener existed; recovery scanning had
finished in 2.721 s. The full intermittent failure did not reproduce on profiled
retries. A regression independently proved cold PCM checkpoint scans in resumed
detailed STT block the API event loop. Those reads now run through `to_thread`,
with existing prefix validation and locks preserved; launcher deadlines unchanged.

Actual production restart passed API readiness in **3.094 s**; health and the
**38-project** catalog returned 200 in **15/78 ms**. Focused **6**, backend **509**,
frontend **465 / 55 files**, typecheck/build pass. Evidence and the unresolved
original-cause boundary: `docs/gates/runtime-ready-01-checkpoint-io.md`.

This is an unplanned bounded repair, not completion of ingestion profiling.
The full-console path still reproduced a timeout after this mitigation; a
diagnostic launch also had a native Python access violation. Final ordinary
console startup passed at **3.108 s**. Exact next repair is
**RUNTIME-READY-01B**, capture these intermittent failures and verify repeated
ordinary starts before **LIVELINK-INGEST-18A**. Six-source spool/backlog and the
approximately five-minute Stop-to-archive delay remain open.

Previous bounded round: `RUNTIME-VOICE-01` (2026-10-03).
`RUNTIME-VOICE-01` completed bundled Voice Changer worker sibling imports.
Actual EngineWorkerProcess failed because embedded Python `_pth` isolation
omits the script directory. The worker now resolves its siblings from `__file__`.
Original and copied runtimes enumerate **66 devices**, return idle status and
reject a missing named device before opening an audio stream; actual RVC runtime
also returns harmless protocol replies without loading a model.

Evidence: Voice Changer **12 passed**, backend **508 passed**, frontend **465 /
55 files**, typecheck/build passed; current checkout portability audit **24/0**.
See `docs/gates/runtime-voice-01-worker-import.md` for reproduction, moved-runtime
proof and boundaries. Previous PROJECT-WRITE-01 persistence evidence remains in
`docs/gates/project-write-01-persistence.md`.

There are **11 scheduled rounds + 2 conditional repairs remaining** in
`docs/GAP-PLAN-2026-10-03.md`. Exact next: **LIVELINK-INGEST-18A**, profile the
six-source spool and Stop tail before tuning. The approximately five-minute
archive delay remains; real conversion/model quality, STT accuracy, physical DPI,
clean-machine transfer and speaker publication gates remain open.


Previous UI-CONTRAST-01B observed browser acceptance remains historical evidence.

Previous UX-11B recording-name gate remains historical evidence.

Existing UX-08B footage lifecycle, CAPTURE-10B and 12L/12M gates remain
historical evidence.
The historical phase baseline below remains distinct from these focused checks.

- Backend: 364 passed.
- Frontend: 288 passed.
- TypeScript/Vite production build: passed.
- `git diff --check`: passed.
- `engines/OmniVoice`: no tracked modification.

## Accumulated Context

## Decisions Made

| Phase | Summary | Rationale |
| --- | --- | --- |
| 03 | Keep `ProjectVoice` and Voice Model Set distinct | One usable artifact cannot carry a coordinated set's identity, lineage, and gate guarantees. |
| 03 | Dataset Manifest remains engine-free | Exporters may change engine shape without changing portable project truth. |
| 05 | RVC gate remains failed/partial | Speed and pitch evidence cannot override failed cross-speaker CER or missing measurements. |

## Completed Contracts

- Stabilization W0-W4; R5 declined and R6 intentionally skipped.
- Phase 01, plans 03-01 and 03-02, and seam-only plan 07-01.
- 03-03 runtime/run/export/process/GPU/progress/cancel/resume foundation.
- Individual project voices, generation/output, and an RVC live-conversion slice.

## Pending Todos

No GSD todo files. Planned work remains in ROADMAP and PROJECT-STATUS.

## Blockers

- 03-03 still lacks backend-specific threshold calibration and one real gated publish run.
- 03-04 lacks durable sessions, measured capture/QC, finalization, tier policy, and identity lock.
- No checked-in sample project supplies consented, ready audio for the real training acceptance run.
- RVC similarity, cross-gender, loopback latency, and owner blind A/B are unmeasured.
- `audioop` blocks a clean Python 3.13 upgrade; Starlette test client emits an `httpx` deprecation warning.

## Deferred Items

| Category | Item | Status | Deferred At |
| --- | --- | --- | --- |
| STT review | Final per-word candidate reconciliation | Open | Phase 02 |
| Workspace | Six-zone docking and `WorkspaceSession` | Planned | Phase 04 |
| Manipulation | Isolation, dubbing, production patch/file workflows | Planned | Phase 05 |
| Video | LipSync implementation | Planned | Phase 06 |
| Distribution | Model delivery, security adapters, installer/updater | Planned | Phase 07 |

## Session

**Last Date:** 2026-09-22
**Stopped At:** Round 03-03B complete; the gate works and fails closed while thresholds are uncalibrated. Round 03-03C is next.
**Resume File:** None

## VM-REF-DETAIL-01 — 2026-10-15

First of the explicitly requested next five rounds: Reference Detail slots,
independent expansion, revision-checked removal and explicit Timeline+Script
reveal. See docs/gates/vm-ref-detail-01-20261015.md. Next VM-REF-RESOLVE-01.

## VM-REF-RESOLVE-01 — 2026-10-15

Second of five: deterministic property resolution/identity/locks/conflicts,
actual PCM feature cache and explicit unsupported outcomes. See the round gate.
Conditioning A/B waits for delivery/loudness processors. Next VM-TIMING-REF-01.

## VM-TIMING-REF-01 — 2026-10-15

Third of five: portable timing source/template plans, reviewed same-text mapping,
unknown different-text anchors, verified training snapshot checks. See round gate.
Word-anchor execution remains pending; next VM-NAV-01.

## VM-NAV-01 — 2026-10-15

Fourth of five: content/time selection markers, collision menus and playback
follow guards. Marker/selection/scrollbar9 pass; see round gate. Next VM-DURATION-01.
