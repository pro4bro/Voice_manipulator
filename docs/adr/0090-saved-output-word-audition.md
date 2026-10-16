# 0090 — Inspect word anchors against saved output PCM

Accepted 2026-10-16, round31.

An explicit word-review plan pins the saved Voice Output's PCM and immutable
metadata. Words expose frame boundaries, owning Script segment and existing
trust/provenance. One player auditions the selected word with200ms context,
clamped to its owning segment. Untrusted words can be heard without being
promoted to measured or human-accepted timings. No ASR/TTS runs.

Every crop request checks the plan key, project containment, complete mono24k
PCM16 shape, metadata duration and word/segment ownership. Cached crops are
verified against the exact PCM. Unknown, overlapping or invalid intervals fail
closed rather than selecting a different source. A plan supports up to600s and
10000 words. Longer outputs need a bounded segment workflow.

The UI reads only on explicit request; changing word/output stops playback and
late plans cannot attach to another output. This inspection is distinct from
future explicit user review, and from model control of generated word timing.
