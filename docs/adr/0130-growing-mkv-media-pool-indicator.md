# ADR0130 — Show followed-MKV recording state on Media Pool slots

2026-10-22, Round82. Status: implemented.

## Decision

Use the existing followed parent asset as the presentation authority:
`growingMkvFollow` and a source path not ending in `source-final.mkv` indicate the
provisional recording/final-import period. Round81 changes the parent path only
after the complete source and every selected final track WAV have been written.
No new persisted format, polling loop or independent track-state guess is needed.

Show a red pulsing circle in place of the Import checkmark and moving45-degree
diagonal stripes on the parent slot and every displayed child track. Add the
compact `MKV ĐANG GHI` label and a tooltip explaining that final import is pending.
The circle remains a native keyboard-operable checkbox: selected/mixed is filled,
withdrawn Import is hollow. Existing Import selection and STT choices stay intact.
Busy/description semantics expose the provisional state without relying on color.

All child tracks use their parent's completion signal, including withdrawn tracks;
their own analysis path and STT state cannot prematurely clear or prolong the
recording indicator. Recycled footage and ordinary imports do not get this state.
Once final import is published, stripes disappear and native Import checkboxes
return with their saved selection, even if STT is still running. Existing workspace
asset polling supplies this transition without a reload. Reduced-motion disables
both animations while retaining stripes, circles and text.

## Meaning and limits

The visual state covers live following and the short final-import phase. It is
not a claim that OBS is physically recording every instant: disconnected/error or
unknown-size MKV without a matching Stop may remain provisional until Finish.
Closure authority remains authenticated matching OBS Stop or a sealed Matroska
Segment, followed by verified full-source import; silence/file inactivity is not
used. This round changes presentation only, not media or recognition behavior.
