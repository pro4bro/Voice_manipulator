# VM-TIMING-REF-01 — 2026-10-15

Script now offers Timing từ footage for reference, verified training snapshot,
explicit Dub source and explicit Patch source. These last two are source input
contracts; automatic Dub/Patch processing remains later work. Timing plans are
project-owned, revision checked and portable with source hash/span/alignment
revision, target text/voice/settings signature and unchanged target identity.
Training requires completed matching run/manifest hash and byte-equivalent PCM
against its retained audio segment. Missing historic snapshot blocks validation.

Templates retain duration, reliable adjacent-word pauses and usable boundaries.
Same text requires explicit reviewed mapping and all trusted words. Different
text/language stays unknown at word level, using only the phrase envelope.
Explicit sentence duration wins; ancestor budgets are handled by VM-DURATION-01.
A comparison function reports measured duration/anchor errors; estimated words
cannot be counted as alignment success. Anchor execution remains pending.

Evidence: backend15 passed including source kinds, same/different text, pauses,
untrusted anchors, missing/historic snapshot, stale revisions, move/reopen and
removal. Frontend TimingPlanEditor3 + WorkspaceShell/selection60 passed;
typecheck/build pass. Actual waveform/anchor comparison is included with duration
artifacts in the batch gate; native browser/human listening remains open.
Next VM-NAV-01.
