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
