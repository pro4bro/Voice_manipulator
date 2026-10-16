# ADR0079 — Incremental Fix clips before explicit output replacement

Date: 2026-10-16. Scope: VM-FIX-01/02 and later Patch integration.

The saved Script is desired intent; an immutable per-sentence WAV and its complete
generation fingerprint are completion evidence. Fix uses the existing speaker
planner/cache identity (text, selected voice and artifact hash, generator settings,
language/speed, native duration and timing template). A revision number alone is
not completion evidence. Gain, note, pauses and downstream offsets do not change
speech identity; those belong to composition/rendering.

Fix jobs persist relative clip references and per-unit outcomes in
`jobs/voice-fix/`. Valid completed artifacts survive Stop/failure and service
reopen. Cache pruning retains clips referenced by these receipts. A stopped
process cannot resume an old thread; a fresh plan resumes missing valid units.
Reopening never rerolls reference events or silently starts inference.

Whole-row stretch can supply a native duration budget after verifying the engine
supports it. A partial/cross-row stretch cannot be translated into precise word
anchors, so remains blocked. Gap-only stretch does not request TTS; it still
needs explicit timeline composition. Unsupported emotion, delivery and reference
conditioning block Fix instead of being ignored or converted into prompt tags.

The GPU lease, cancellation ownership, Script/edit/reference/timing snapshot and
model fingerprint are checked through publication. A stale answer cannot mark
the new desired state clean. A response may retain its historical job identity
in the UI for Stop/status while its old plan is invalid for Apply.

Generating clips and replacing the active take are separate actions. VM-FIX-01
publishes no replacement Voice Output. VM-FIX-02 must validate PCM, frame budgets,
boundaries, cue lineage and source hashes before publishing a new derivative.
Source audio is never overwritten; the existing output remains available for A/B.
Estimated word timing remains estimated after any sample-exact composition.

VM-FIX-02 retains adopted row targets in `parameters.fix.durationTargets` as
integer24k frame budgets when no explicit Script/timing target exists. New
explicit targets or further whole-row stretches override them. Returning to the
prior source/history restores the previous timing intent; opening a new output
does not silently switch its Fixed speech back to natural duration.

The applied artifact keeps raw speech for exact unaffected-PCM lineage. Requested
gain uses the existing separate renderer, and the Apply receipt points at the
verified rendered artifact for playback/download. Gain-only changes need no TTS
or duplicate raw output. Output JSON receives a canonical metadata checksum in
the receipt; audio bytes alone are insufficient to validate identity/provenance.
