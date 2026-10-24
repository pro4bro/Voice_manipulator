# VM-SCRIPT-LAYER-UX-01

Approved scope, 2026-10-24: implement the Script and layered Timeline mockup in
one bounded round. The time ruler appears at the top only.

## Delivery slices

1. Make row Speaker assignment independent of explicit checkbox selection;
   unassign clears the Voice Model. Show generation tasks in the right settings
   column. Derive pending/fixed text highlights from successful Version snapshots.
2. Persist the Full baseline, keep captured Fix publication separate from newer
   Script edits, validate disjoint regions, and render persisted layer Solo with
   the same compositor used for playback/export. Lock horizontal clip movement.
3. Share Timeline viewport/zoom/playhead with stacked clip lanes. Draw upper-half
   waveforms from each clip's actual source IN/OUT, retain the symmetric Master,
   put subtitles immediately beneath it, and retain one bottom navigator/transport.
4. Verify focused regressions, complete frontend/backend gates, real PCM artifacts,
   and browser layout/interactions. Record evidence and remaining limitations.

## Acceptance

- Checkbox selection alone controls the bulk toolbar. Direct Speaker assignment,
  reassignment and Chưa gán Profile work without selecting a row.
- No blue before generation; strong blue for pending edits, faded blue for
  successfully fixed edits; successful Full resets marks and old Fix layers.
- Multiple disjoint Fix regions keep their own trusted coordinates. New edits
  during a run stay pending; failure/cancellation cannot mark edits fixed.
- Master, subtitles and footage-like layers use the same scale and playhead.
  Layer headers expose number/Mute/Solo. Clips use real upper-half PCM waveforms.
- A layer transfer preserves timeline/source coordinates; horizontal displacement
  is rejected. Existing cut/mark/trim/split tools remain available.
- Playback/export use the same Full/Fix composition and Mute/Solo decisions.
- Source media, portable paths, Version independence and output lifecycle remain
  intact. Training roadmap percentages do not change in this UI round.
