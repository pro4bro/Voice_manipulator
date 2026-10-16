# 0096 — Reuse only checked exact prefixes of a stretch edit history

Accepted2026-10-17, round38.

Each preview key already pins immutable source SHA, ordered active operations and
policy1. For an uncached new history, search backward for the longest exact
prefix. Its audio checksum, PCM geometry, expected frame count and cumulative
quality report must validate. Missing/corrupt/incomplete prefixes fall back to an
earlier valid prefix or full source. There is no unchecked in-memory PCM cache.

Render only remaining operations, using their existing edited-time coordinates
against the checked prefix WAV. The final result must match full ordered replay
PCM. Fork/Undo/Redo cannot borrow an unrelated cache just because duration matches.
Aggregate signed silence-fit adjustments and maximum boundary step across the
whole history. Original source SHA remains the provenance identity. The saved
processingSeconds is cumulative historical render work, distinct from current
request diagnostics. Report targetFrames is the final total, not the suffix size.

Keep existing policy1 keys compatible and validate files freshly. Source media,
output metadata and the edit journal are never changed by a preview. Class-wide
render serialization remains; a cache optimization is not a cancellation API or
a guarantee of browser pointer-to-playback latency.

Round40 verification additionally bounds signed cumulative silence adjustments
by1440frames per known operation and validates the cached operation count against
the exact prefix. Legacy reports can omit that count; the request supplies it,
or standalone reads use the existing128-operation journal ceiling.
