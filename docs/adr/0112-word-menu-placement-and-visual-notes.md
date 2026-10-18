# 0112 — Viewport word menus and visual notes

Accepted 2026-10-18, stabilization round55. Extends ADR0107/0111 and supersedes
ADR0110's manual subtitle Speaker body fill following owner feedback.

## Shared placement

Script and Subtitle word menus render in document.body, outside module overflow
and transformed containing blocks. Measure actual content, flip horizontally or
vertically, then constrain to the visible viewport with an eight pixel margin.
Reposition after resizing, content-size changes and visual viewport changes.
An oversized menu scrolls internally; all actions remain reachable. Preserve raw
client coordinates until placement so old estimates cannot clip the result.

Note is a horizontal submenu beside its trigger, opening right or left according
to available space. It follows parent movement and internal scrolling. Both
portals share ownership for outside-click dismissal. Pointer travel across the
small gap has a grace period. Escape closes Note before the parent; keyboard
arrows navigate. Opening a menu from native text editing preserves focus and
cannot itself blur, save or discard a draft. Existing commands retain their
selection snapshots and write boundaries; reference assignment is explicit.

## Paint and explanation

New/edited subtitle words use the normal surface, blue classification text and
the owning Speaker's bottom underline. Selection, playhead and collision keep
their semantic surfaces. Blue is resolved against each exact background in both
themes at a minimum 4.5:1 contrast. Keep profile inheritance and explicit null.
Unconfirmed timing warnings keep other edges but cannot replace the underline.

Each word menu offers Note with module-specific explanations and swatches:
Speaker identity, manual text, selection/playhead, timing warning, collision or
compact subtitles, Script STT/AI review layers, replaced text, B/I/U and emotion
formatting. Notes describe display states and do not claim acoustic alignment.

## Limits

No media, model, saved project schema or API implementation changes. Validation
also repaired launcher first-probe starvation when cold listener diagnostics
consumed the initial readiness budget; health criteria and timeouts stay intact. Synthetic browser QA
proves placement and paint, not acoustic timing quality or end-to-end processors.
See docs/gates/menu-note55-20261018.md for test and portable evidence.
