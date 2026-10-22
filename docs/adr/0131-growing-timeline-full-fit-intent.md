# ADR0131 — Retain full-fit intent while a Timeline grows

2026-10-22, Round83. Status: implemented.

## Decision

Zooming out completely means following the complete source extent as it changes,
not remembering the number of seconds visible at the button press. Imported
multitrack Timeline already starts with an Infinity window sentinel, but its
slider/minus handlers replaced it with a fixed duration. Retain that sentinel
when a user reaches full fit through either control; explicit zoom-in selects a
finite window and retains the existing playhead-centered navigation behavior.

Use the same sentinel for OBS. Its live viewport maximum grows beyond the old
120s cap with the recording duration. Keep the existing default60s view and120s
short-recording headroom;120s becomes an acquisition bound, not a hard maximum
for the time extent. The live clock continues updating even while a source-linked
seek suspends playhead following, so full fit still grows without moving that
chosen playhead. Changing zoom or recording identity retains existing defaults.

OBS waveform acquisition remains at most120s/600 points per request and follows
the tail of the visible interval. This keeps new audio visible while the ruler
can show the full recording. It does not create a new full-history live waveform
cache or certify older unrequested PCM coverage. No backend limits are relaxed.
Archived waveform loading continues to use its existing complete-window route.

Ordinary microphone/display Timeline uses a full-width canvas at zoom factor1,
which already adapts to recording duration. Add regression coverage; no product
change is needed there. Shared1,000px/s maximum density and zoom centering stay.

## Verification boundary

Regressions cover MKV layers/columns with slider/minus, growing maximum across
parent/tracks, OBS200→400→500s full fit with suspended playhead following and
bounded280→400s acquisition, later zoom-in retaining a finite250s window, and
ordinary60→300s recording fit. The prior test's live120s display expectation is
updated to200s for a200s source, with its120s acquisition assertion preserved.
No persistent project format, processor, media or engine change is required.
