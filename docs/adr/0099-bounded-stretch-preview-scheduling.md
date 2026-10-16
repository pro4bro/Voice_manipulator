# 0099 — Bound scheduling delay during continuous stretch dragging

Accepted 2026-10-17, round42.

A trailing180ms timer reset on every pointermove can postpone preview forever
while the pointer keeps moving. Arm one40ms timer from the first changed
operation and let later moves replace its payload without postponing dispatch.
This bounds the scheduler delay when idle; the event loop and actual render,
network, waveform and audio readiness still contribute to observed latency.

Keep one preview active. On completion dispatch the newest changed operation
without another40ms wait. Equivalent frame operations, including repeated moves
past a clamp, do not trigger redundant previews. Returning to an older operation
after a different preview was dispatched still needs the correct audio restored.
Pointerup commits the final operation through the existing serialized lane;
Escape, pointercancel, unmount and owner changes retain their invalidation rules.

Use fake timers for sustained10ms pointer updates, newest-only followup,
equivalent-frame deduplication and A→B→A restoration. These deterministic tests
prove scheduling behavior; they do not establish the250ms end-to-end audio gate.
