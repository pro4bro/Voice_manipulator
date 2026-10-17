# 0105 — Use the source clock for waveform bins and shared timed selections

Accepted 2026-10-17, stabilization round47.

## Evidence and decision

The owner reported a word box ending near its apparent acoustic onset. Two
waveform defects reproduce without changing STT: fixed ceil-sized peak groups
leave a short final bucket, while the plain Timeline paints point i at i/(N-1).
For4285seconds,1ms peaks and1500 requested display points, the last group has
2357peaks. Plain Timeline places its start2.357s late; imported i/N rendering
places it approximately0.499667s early because the groups were unequal.
Neither observation proves a particular model word boundary is wrong.

Partition detail peaks and overview source frames proportionally at floor(i*L/N).
Draw bucket starts at i/N. Preserve the existing min/max response shape, source
media and word timestamps. Version overview caches independently (version2)
so old cached geometry rebuilds; unchanged1ms peak caches remain reusable.
A coarse bin still bounds the accuracy of a visual onset; zoom for word review.

Plain Timeline uses an inset shadow instead of a layout-consuming border.
The pointer/ruler rectangle and waveform/subtitle rectangle therefore share
an origin and width (actual browser before1114vs1112px, after1114vs1114px).

## Selection contract

Registry enables range overlays for ordinary STT takes, not only generated
voice. Native Script text publishes mapped timed word indexes; channel Script
and imported Timeline use asset ID plus updatedAt revision to isolate clocks.
Show START/DURATION/END and selected subtitles for the same source. Keep
readouts within the visible imported lane. Disjoint imported selections do not
implicitly seek or scroll. Channel bulk row checkboxes remain their existing
cross-source list selection, not a fabricated combined audio clock.

Ctrl/Meta + left drag selects time on waveform and subtitle track. A plain
waveform drag scrubs. On plain Timeline's subtitle track, defer Ctrl-click text
insertion until release with no drag; a drag must never open the text editor.
Stretch handles retain their own Ctrl-drag behavior and generated-audio adapter.
Native Script mirroring preserves partial text and the editing caret; it must
not turn disjoint selections into a false contiguous text selection.

## Limits and verification

See docs/gates/timing-selection47-20261017.md for RED/GREEN tests, full regression
results, controlled actual-PCM browser evidence and remaining user-footage UAT.
No global word offset, forced alignment change, live OBS repair, model training,
new processor completion or phase advancement is implied.
