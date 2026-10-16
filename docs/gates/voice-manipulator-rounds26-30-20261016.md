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
