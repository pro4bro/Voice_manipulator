# ADR 0028: One transient OBS overlap selection across Script and Timeline

Date: 2026-10-02
Status: Accepted at frontend regression level; physical OBS viewport gate open

## Decision

The workspace owns one in-memory overlap review selection: recording ID,
start/end seconds and participating source IDs. During LiveLink transcription,
source IDs are stable channel IDs. After detailed STT, they are archived track
asset IDs. The selection is review UI state; it is not persisted in project
media or treated as word alignment, diarization or speaker identity.

Clicking a Script overlap badge sets the selection and seeks its source. The
live path uses the channel ID; the archived parent Script uses the child asset
ID, which OBS Timeline resolves to its channel lane. This keeps all lanes
visible for comparison. Clicking within an overlap on a Timeline waveform
sets the same selection in Script. If the user was looking at one archived
child track, that action returns to the parent Script and all source lanes.
Neither action starts playback.

Timeline's small red overlap marks remain pointer-passive. The waveform itself
hit-tests the clicked time against its derived intervals, preserving drag to
scrub. The selected range is drawn only where a current overlap marker still
intersects it, so a revised realtime transcript cannot leave a stale range
painted on the waveform. Selection clears on recording changes and when
leaving the OBS Timeline source.

When any archived track has detailed STT text/words, Timeline derives overlap
markers from the same trusted word rows used by parent Channel Script. It does
not mix old realtime segment intersections into those reviewed markers. The
source timing quality rule and 0.4-second overlap floor remain as defined in
ADR 0024. Imported multitrack Script retains its existing playback seek path.

## Evidence and limits

Frontend tests cover selection from both Script forms, Timeline hit-testing,
range drawing on both lanes, passive marker dragging, no autoplay, asset
targeting before/after lane load, detailed-over-draft timing, parent return
from single-track view and recording-change reset. Full frontend suite,
typecheck and production build pass. Running OBS and the owner's viewport are
still needed to inspect marker hit areas and contrast in both Timeline layouts
and themes while transcript revisions arrive.
