# ADR 0146 — Script text columns and frozen Timeline subtitles

Date: 2026-10-25
Status: Accepted

## Context

Text view previously projected each turn as `Speaker: dialogue` into one textarea,
so copying spoken text also copied identity labels. The layered Timeline used an
independent layer scroller, leaving Master and subtitles outside vertical scroll.
The owner requested column-sensitive selection/copy and a common vertical stack
whose subtitles freeze beneath the existing top ruler.

## Decision

Script remains an ordered collection of stable speaker-turn rows. Text view
renders separate aligned identity/dialogue columns. Plain-text clipboard output
uses selected dialogue fragments in row order; dialogue-to-dialogue selection
excludes intermediate identity labels. Selection across identity and dialogue
includes each row's speaker name. Multiline text retains its row boundary.

One editing host permits continuous native selection across turns. Speaker labels
inherit the selection host; input/cut/paste guards prevent label edits. An explicit
`contenteditable=false` label prevents Chromium drag selection from crossing into
dialogue, so it cannot implement the requested two-column copy behavior.
Dialogue DOM is synchronized by stable row ID, with composition
guarding and caret restoration for external updates. Cross-turn copy is allowed;
cross-turn destructive edits and text drops are blocked to retain speaker/turn
structure. Profile assignment remains in table view. Shared plain-text DOM
coordinates retain literal, block and break newlines for save, clipboard, Find
and caret placement. Enter and paste replace only the selected cell's literal
text, retaining leading/trailing/blank lines and treating HTML as text. Chromium's
`insertText` with newlines clones grid cells, and `insertHTML` at offset zero can
insert outside the cell, so neither command is used. A session-local history of
up to100 edits unifies typing, committed composition, paste and newline Undo/Redo
without replaying browser structural mutations. External text replacement or row
removal invalidates that history. It is not persisted across view switches/reload.
The final insertion/history path still requires browser UAT after access returns.

The layered Timeline uses one vertical scroll viewport containing the one ruler,
Master, subtitles and layer lanes. The ruler is sticky at the viewport top;
subtitles remain in normal order below Master until they reach the ruler, then
stick directly below it. The existing horizontal waveform viewport remains the
authority for zoom, visible time span and pan. Sticky strips and layer clips use
that exact width/offset. Navigator and transport stay outside vertical scrolling.

Vertical clip dragging scrolls the common viewport. Drop targets behind sticky
subtitles or outside its visible boundary cannot receive a clip. Transfers retain
source IN/OUT and locked timeline coordinates. Nonlayered Timeline layout remains
the existing waveform/subtitle arrangement.

## Consequences

No project format, engine or audio composition change is needed. Unit tests can
prove selection serialization, row stability, shared viewport values and drop
visibility; actual browser selection/IME/clipboard and sticky geometry require
browser verification. The common scroll/drag/copy paths were observed in Browser;
access was disabled again before the final text/history patch could be retested.
See the two-round completion gate for the exact observed results and remaining UAT.
