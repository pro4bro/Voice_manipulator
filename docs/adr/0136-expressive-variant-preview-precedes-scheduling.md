# ADR0136 — Preview expressive variants before scheduling training

Status: accepted for the preview slice. Owner requested another five expressive
engine rounds after91; the existing per-emotion LoRA/shared-anchor decision in
ADR0011 and Phase03-04 remains.

The current Dataset Manifest has emotion labels but no reviewed Vocal Effort.
Current speaker batches also do not represent independent emotion/effort runs.
Reusing either as though it did would silently mix performances or erase lineage.

Provide a read-only Training Variant Preview for one manifest, speaker and native
training descriptor. Explicit request-scoped effort labels, target segment IDs,
ordered neutral anchors and parameter overrides produce deterministic membership,
durations, manifest/config hashes and blockers. This introduces no manifest
migration and does not infer effort from gain, RMS or an emotion name.

Every cell receives the same ordered anchor and resolved native configuration.
Reject unknown IDs, mixed labels, absent train/dev data and source-time leakage.
The caller's base fingerprint remains an unverified declaration. `dryRun=true`
and `executable=false` are fixed facts even when a draft is ready for review.
The endpoint cannot create runs, change media, publish voices or activate blocked
trainers. Scheduling needs persistent reviewed labels and verified base lineage
in a later slice. Acoustic acceptance still requires actual listening evidence.

Private runtime provisioning and real model smoke tests are separate evidence:
decoded non-silent WAVs prove an integration path, not identity, pronunciation,
emotion, vocal-effort control or a successful training recipe.
