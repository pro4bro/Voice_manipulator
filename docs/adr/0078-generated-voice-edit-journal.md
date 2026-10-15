# ADR 0078 — Immutable generated audio with frame-based ripple history

Date: 2026-10-15. Scope: VM-RIPPLE-01 and VM-STRETCH-01.

Generated source audio and its output metadata remain immutable. Each output owns
`edits.json`, an optimistic-revision journal of commands in the current edited
frame clock. Undo/redo moves one cursor; editing after Undo discards the redo
branch. Source SHA256 is checked before reuse. No absolute media path is saved.

Each stretch replaces the entire chosen interval. Its left timeline boundary is
the reflow anchor; internal words scale monotonically and subsequent content
shifts by the duration difference. The right handle's positive drag increases
duration; the left handle's negative drag increases duration. For the left
handle, the pointer is a duration control, not a request to move or trim IN:
the block is reflowed to its original start. Both controls expose that policy.
This avoids moving earlier content or silently changing its pauses. Only the
active disjoint block changes. Unselected PCM is retained exactly.

Clip budgets and intersecting segment budgets/duration locks conflict rather
than silently unlocking or reallocating them. This first slice accepts generated
dialogue only; it does not move source footage, video or background tracks.
The public stretch control stays absent until real preview rendering is wired.

Mapped word intervals are estimates and are never promoted to reviewed acoustic
anchors. Ripple changes alone do not alter Script text/voice/settings, cache
identity or downstream synthesis state. Fix generation is a later round.

Initial stretch limits: PCM16 mono24kHz, .5–2x, output at most10 minutes,
at most128 commands. Larger and piecewise anchored operations are not claimed.
