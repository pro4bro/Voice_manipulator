# 0089 — Explicit listening assessments for accepted Patch revisions

Status: Accepted, 2026-10-16 (round29).

Store user-declared listening, four independent ratings and notes in project-owned
`notes/voice-patch-reviews.json`. Default every rating to unassessed. Saving needs
explicit listening confirmation. A current saved review restores that confirmation;
a stale review preserves notes but requires listening again. No score, automatic
identity judgment, or checkpoint acceptance is inferred.

Pin each appended assessment to accepted output ID, audio SHA256, immutable output
metadata SHA256 and comparison key with policy version1. Optimistic file revision
and identity checks reject stale writes. Validate accepted artifacts again, lock
and atomically write; corrupt notes fail closed. Paths stay relative to the project.
Unknown, tampered or unaccepted derived outputs cannot receive an assessment.

The UI shares the explicitly selected history entry with the audition player;
late load/save responses cannot change another entry's form. Automated tests
create assessments only in synthetic temporary projects. Real test artifacts
remain unreviewed until a human listens and saves their own assessment.
