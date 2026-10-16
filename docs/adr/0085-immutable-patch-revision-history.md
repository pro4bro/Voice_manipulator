# 0085 — Immutable accepted Patch revisions

Date: 2026-10-16. Status: accepted for VM-PATCH-02C.

Each explicit Apply commits a per-output journal receipt under its strategy's
project-owned job directory. Latest-source pointers remain rebuildable indexes.
Legacy valid pointer receipts are readable without migration; a later Apply
preserves the prior receipt before replacing its pointer. Repeating an already
accepted job returns its original output even after newer revisions exist.

History validates output metadata/audio hashes, PCM shape/frame count, lineage,
strategy, and report target geometry. Invalid entries are counted and excluded.
Historical playback is independent of the current mutable draft and Script;
it never grants a stale job Apply permission or triggers inference on reopen.

Comparison groups use source audio/metadata hashes, original target frames,
replacement text and duration policy. Trained-reference/context/hybrid variants
can share a group while retaining model and reference provenance. Group membership
is not a quality ranking. The UI lets users audition saved outputs and explicitly
open a chosen revision on Timeline and Script.

Journal publication precedes latest-pointer update. A pointer-write failure does
not discard an already accepted output; history recovers idempotence and latest.
Output deletion intentionally leaves a failed history integrity entry rather than
fabricating or regenerating the missing audio.
