# ADR0148 — Shared Script text viewport and gesture ownership

Date: 2026-10-25
Status: Accepted implementation; native browser acceptance pending
Round: VM-SCRIPT-UNIFIED-01

## Context

Input used a textarea/overlay and Voice Manipulator used a two-column editing
host. The Input flex child did not fill the Script document; Voice Manipulator
relied on an OS scrollbar that could be hidden. Playback of long Input text
moved native selection to the current word. Its select event fed word selection
back to Timeline, seeking to the word start and recentering during held scrubs.

## Decision

Use `ScriptTextPane` for normal Script editing on both pages and per-source
transcripts. It owns one viewport, a visible custom vertical scrollbar, and the
existing two-column `ScriptTextView`. Keep one outer scroll authority for a
multi-source document. Specialized AI comparison/live/tag modes retain their
dedicated presentations. Script body/document/viewport fill the available flex
height without a nested fixed-height editor.

The Input adapter projects canonical speaker turns into exact text slices. It
preserves the current turn boundaries during local edits until reconciliation
returns updated words. Compare grouping inputs by value so equivalent arrays
from a parent render cannot erase the first edited turn or its local history.
No persistent Script format changes are needed. Source IDs/revisions remain
separate, and Find/word actions use transcript offsets independent of labels.

Use the existing serializer for both pages: dialogue endpoints omit speaker
labels; speaker endpoints copy only names; mixed endpoints retain row ordering.
Literal text editing, multiline paste and Alt+Enter stay inside a turn. Local
text Undo/Redo stays in the editing host; timed words reconcile on leaving it.

Paint playback words using CSS Highlight ranges, without moving focus/caret or
publishing a word selection. Read-only presentation does not become an editor
selection. Manual reading/typing pauses follow, and Timeline interaction resumes
it. Simultaneous sources share a chosen follow owner. Ignore selection-triggered
seek and viewport recenter effects while playhead/waveform/transport scrub owns
the clock; keep ordinary deliberate Script/subtitle selections operational.

Place a horizontal resize separator immediately above the bottom Timeline
module. Store per-page machine-local height in localStorage, clamp against board
height and keep editor access. Pointer cancel/blur/unmount removes listeners;
keyboard arrows resize, viewport changes re-clamp. Narrow stacked layout hides
the divider. Project data and media remain unchanged.

## Consequences

Existing textarea-specific tests must operate through real DOM Range/input and
test local editing history instead of triggering global timed-document history.
The gate records these contract changes and the earlier red repro. Browser
selection/IME, actual viewport geometry, both themes and listening remain
separate acceptance. Newline pauses, sentence endings and rich-text delivery
are tracked in `docs/VM-SCRIPT-UNIFICATION-DELIVERY-PLAN.md`; no audio change or
engine conditioning is implied by this UI round.
