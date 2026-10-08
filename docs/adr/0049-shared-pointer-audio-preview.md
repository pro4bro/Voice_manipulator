# ADR 0049 — Shared pointer audio preview

Date: 2026-10-08. Status: accepted for USER-FEEDBACK-02.

## Context

Paused waveform/playhead drags only sought the HTML audio element. Promoted
middle-button word alignment repeatedly sought an ordinary playback stream.
Neither path provided a consistent short preview across Timeline instances.

Adobe documents audio scrubbing as hearing audio at the playhead while dragging
the waveform: [Source Monitor audio editing](https://helpx.adobe.com/premiere/desktop/add-audio-effects/basic-audio-editing/edit-audio-clips-in-the-source-monitor.html).
This describes the interaction; it does not specify Premiere's internal DSP.

## Decision

Use a product-owned shared `AudioScrubber` for ordinary Timeline, imported
multitrack and archived OBS playback, including promoted middle-button timing.
Reuse existing media elements and gain/mute graphs. Coalesce seeks to at most
one per 40ms and preview up to 120ms at normal playback rate. Pending seeks use
the newest pointer target. Stop at excluded-region boundaries; excluded targets
are silent. Release, cancellation, source change and unmount end previews and
restore rate. Preview clocks do not advance the pointer-controlled UI playhead.

Avoid decoding entire long recordings into a new AudioBuffer. This preview
uses the browser's media seek/decode path; startup latency depends on available
metadata and media buffering. Live OBS without archived media does not gain
playback from this change. Reverse pointer motion previews short forward audio
at its new location; reverse PCM playback and Premiere's DSP are not claimed.

## Evidence and remaining acceptance

DOM regression reproduced silent left drag before the change. Controller tests
cover coalescing, pending seeks/play, release, channel mute/rate, excluded audio
and boundary stops. Component tests cover normal, middle alignment, multitrack
and archived OBS interaction. Audible smoothness and browser playback policy
require real device listening; synthetic media-element tests do not prove them.
