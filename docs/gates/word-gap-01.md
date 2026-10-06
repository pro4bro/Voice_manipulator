# WORD-GAP-01 — editable recognized boundaries

2026-10-07. Newly recognized word intervals leave up to 10 ms before the next
onset, bounded to 20% of the available interval on tiny words. Onsets never
move; existing real silence remains. The original start/end/source live in
`sourceTiming`; repeated processing is idempotent. Media import timing validation
and finalized transcription publication both apply the policy. Historical stored
transcripts are not migrated. No speech recognition quality improvement claimed.

Regression reproduced structural timing inspection changing a user-interpolated
word from untrusted to trusted. Inspection now preserves its estimated provenance.
Word editing policy/timing/import tests: 20 passed. The persistent word dictionaries
accept the added sourceTiming metadata without a project schema migration.
