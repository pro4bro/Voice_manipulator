# VM-TIMELINE-DIRECT-EDIT-01 — 2026-10-25

Implement the owner's corrections in one bounded round:

1. Remove the selected-clip form beneath the Timeline. Select clips directly and
   perform Cut/Uncut/Delete/Reset and accessible layer moves from its toolbar.
   Drag vertically between layers, preserving timeline/source timecodes.
2. Allocate spare Timeline height to the Master waveform, matching the Input
   multitrack experience. Keep subtitles below Master and layers below subtitles.
   Show native vertical layer scrolling and shared horizontal navigation/zoom.
3. Preserve typed/pasted paragraphs, newlines and tables in their current Script
   row. Automatic transcript rows follow diarized speaker turns, not sentences or
   pauses. Keep existing saved rows and explicit Add Row operations intact.
4. Verify selected-clip operations on real PCM, reset to the last generated
   Full/Fix arrangement, persistence/clone independence and source immutability.
   Run focused and full gates, then browser UAT in owned fixtures and document.

Cut splits at playhead, or the marked IN/OUT boundaries inside the selected clip.
Uncut rejoins compatible neighboring source pieces. Reset restores the last
successful Full/Fix composition, including its clips; it does not discard Fix
history by reverting to Full alone. Horizontal clip placement remains locked.
