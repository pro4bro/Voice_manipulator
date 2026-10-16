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
