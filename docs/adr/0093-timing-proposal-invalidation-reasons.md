# 0093 — Explain invalidated timing proposals and own request responses

Accepted 2026-10-16, round34.

Persist optional `staleReason` alongside existing job state: `source-audio`,
`source-metadata`, `recognizer`, `timing-policy`, `proposal`, or `identity`.
Changed source audio takes precedence, then metadata, recognizer and policy.
Missing/tampered proposals are distinct. Legacy stale records without a reason
receive `identity`; do not retroactively guess a more precise historical cause.
Interrupted jobs stay failed, not stale. A terminal stale record stays stale
across reopening even if a later configuration happens to match again.

The UI explains the reason and shows the current ASR model. Refresh/Measure is
explicit; no automatic inference is introduced. Apply requires a current complete
job and matching key. Reopening a model-specific proposal never silently applies
another recognizer's result. Already applied outputs remain independent immutable
artifacts. Source audio did not necessarily change when a proposal becomes stale.

Start and Stop responses now also check the request generation. Selecting away
and back to the same output cannot attach an older request. Existing poll cleanup,
terminal-state guards and late Apply handling remain in force. A busy Stop button
cannot enqueue repeated requests; only the selected job is stopped.
