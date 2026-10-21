# ADR0128 — Input subtitle refinement methods and read-only drift evidence

2026-10-22. Accepted for Round80 under STT-ALIGN-05/06; extends ADR0127.

The owner wants refinement in Input's right column and separate methods to try.
One heard Conviction reference establishes useful local evidence but cannot
establish universal offset or word-duration rules.

Add Tinh chỉnh subtitle to Input's right column, using existing selected footage
and track identity on any project. Keep eight explicit modes: common measured
translation, separate measured IN/OUT, group translation, individual CTC,
waveform-vector review, manual offsets, conservative combined and diagnosis.
Changing mode, scope or entered offsets clears the prior proposal. Reopening a
persisted proposal restores its method and offset controls. Training retains its
existing Script entry point. Existing source fingerprints, selected Apply,
manual locks, Restore and shared Undo/Redo govern every editing method.

Common/edge estimates need at least three qualified CTC anchors. Group mode
cannot fall through to individual CTC. CTC mode cannot silently use a group
translation. Vector mode searches directional PCM corners within80ms of a
high-score CTC edge, otherwise within300ms of the source edge. Valid pairs become
explicit proposals; all require listening and confirmation. Absent/ambiguous or
conflicting boundaries remain review. These corners reuse Timeline's numerical
peak vectors rather than rendered pixels. They do not prove word identity.

A Subtitle Drift Report inspects manual words as well as untouched STT. Qualified
CTC intervals require score>=0.8 and valid source-clock bounds. A maximum endpoint
displacement>=250ms is suspect;>=500ms is severe. Report signed offsets, source
and CTC coordinates, quiet/invalid spans and compared/unassessed counts. With no
qualified comparisons, or sparse comparisons without a detected discrepancy,
report insufficient evidence. A no-large-drift result requires three comparisons
and60% coverage and applies only to assessed words. CTC errors and overlapping
speech can produce false suspicions. Diagnosis cannot Apply, even through the API.
The displayed report describes input timing, not the predicted applied result.

Reuse completed acoustic evidence across trials only when the full semantic
snapshot, audio SHA, exact words/order/index scope, worker, weights, JSON model
configuration and relevant runtime identity match. Keep an acoustic-latest pointer
separate from latest proposal so a manual-offset trial does not discard model
evidence. Copy actual input/output/log into each proposal job. Manual offsets
never start inference; they can reuse existing matching evidence for diagnosis.
Missing/corrupt/mismatched evidence falls back to a fresh acoustic run where that
mode needs one, with the existing serialized CPU runtime and visible failure.

The real-media gate records every method separately, exact apply/restore,
read-only diagnosis, source preservation and current-versus-reviewed evidence.
The owner reference remains evaluator-only for proposed changes. Vector proposals
have no automatic quality acceptance. Held-out quality and actual browser/device
audition remain open; STT defaults and release status do not change.
