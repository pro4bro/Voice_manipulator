# 0083 — Reviewed media Patch targets

Date: 2026-10-16. Status: accepted for VM-PATCH-02A.

Media Patch stores a server-derived review receipt over source/audio metadata
hashes, whole-word indices, exact PCM bounds and current Script revision. The user
listens and explicitly confirms the displayed bounds before generation. Changes
invalidate that confirmation. Context selection can retain the same target review.
Confirmation never promotes machine or estimated timestamps to measured truth.

STT selection transfer carries asset identity and revision separately from the
generated-output selection. One contiguous word span or one waveform range is
expanded to intersecting whole-word bounds. Disjoint, silence-only, stale and
foreign selections do not silently become a larger Patch.

Three media strategies share this target contract: trained full/LoRA with its
saved clean reference, temporary surrounding-context clone, and trained model with
surrounding context. They keep separate job namespaces and fingerprints. Strategy1
does not require a surrounding reference. No automatic fallback or model mutation.

Actual natural Vietnamese source has a verified byte-identical 8s reference crop
and persisted faster-whisper DTW word alignment. It is retained as a private
fixture with original-to-imported speaker provenance. Its preparation is not a
human timing acceptance or permission to mark an unheard boundary reviewed.
