# Voice Manipulator rounds26–30

Starting point3a158f4, clean checkout. Owner requests five further rounds.
These are Checkpoint A follow-ups, not a new VC/Isolator/Dubber processor.

1. Round26 VM-WORD-TRUST-01: preserve acoustic timing trust; never promote
   split/merged/substituted/invalid recognizer intervals to measured word anchors.
2. Round27 VM-TIMING-REPAIR-01: explicitly repair timing on existing generated
   audio with persisted jobs, Stop/retry and immutable same-PCM Apply; no TTS.
3. Round28 VM-PATCH-AUDITION-01: original/variant region and splice audition,
   source integrity guards and ownership-safe audio controls.
4. Round29 VM-PATCH-REVIEW-01: user listening assessments pinned to accepted
   audio/comparison identity, durable notes and stale/tamper protection.
5. Round30 VM-CHECKPOINT-A-02: actual timing/export/reopen/move and available UI
   verification, frozen regressions, honest remaining perceptual gates.

Keep source PCM/models/upstream immutable and persistent paths project-relative.
No success without its artifact. Machine measurements, structural trust and
human listening stay distinct. No new training/download, push or portable release.
Each round is tested and committed separately; phase progress stays60%.

### Round26 — VM-WORD-TRUST-01

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

### Round27 — VM-TIMING-REPAIR-01

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

### Round28 — VM-PATCH-AUDITION-01

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

### Round29 — VM-PATCH-REVIEW-01

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

### Round30 — VM-CHECKPOINT-A-02

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
