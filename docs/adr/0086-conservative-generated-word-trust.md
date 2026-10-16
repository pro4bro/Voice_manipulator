# 0086 — Conservative generated-word timing trust

Date: 2026-10-16. Status: accepted for VM-WORD-TRUST-01.

Only matched recognizer tokens with valid acoustic intervals may become trusted
Script anchors. Splitting a recognizer interval or substituting different text
does not measure the expected Script word. Explicit untrusted flags, estimated
provenance, nonfinite/out-of-bounds and overlapping intervals cannot be promoted
by clamping or redistributing them. Original processor provenance is retained.

Valid short intervals are preserved without inventing a minimum word width.
Proportional estimates remain inside PCM duration and stay untrusted. Tiny
floating arithmetic noise is tolerated at1e-9s, below an audio sample.

One existing test intentionally changes: a one-for-one `pro`→`Pro4Bro`
substitution retains its displayed interval for review but loses measured trust.
Its unchanged neighboring words remain trusted. This tightens the contract.

New speech clip identities include wordTimingVersion2 so legacy annotations are
not silently reused under the corrected policy. This can invalidate old pending
generation jobs/cache identities once. Published outputs/audio remain immutable;
explicit timing repair will offer a path to update annotations without TTS.
Human acoustic review and precise individual-word constraints remain separate.
