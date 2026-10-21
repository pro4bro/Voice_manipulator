# 0126 — Held scrub previews and Vietnamese subtitle typography

Accepted 2026-10-21, round77.

## Subtitle rendering

Use Arial with Segoe UI/sans-serif fallbacks for ordinary subtitles, imported/OBS
subtitle buttons and copy ghosts. On this Windows host, Georgia Pro adds advance
width to Vietnamese tone marks: `tuần` and `chắc` gain about 4.8 pixels at 9.6px,
producing the owner's visible gaps. Text normalization alone would not fix it.
Source text, including decomposed Unicode, stays unchanged.

The ordinary label uses a 1.5 line height with centered alignment and no vertical
button padding, so Vietnamese ink fits without clipping. Timestamp rectangles,
external trim grips, compact markers and speaker/state colors keep their roles.

## Audition window

Preferences → Timeline stores `scrubPreviewPosition`: `start`, `center` or `end`.
Old preference files default to `center`. This app-local setting is independent
of project manifests, word timing and audio processing. The clipping-highlight
preference and the audition preference preserve one another on save.

The existing preview grain remains 120ms at normal pitch/rate. Its unbounded
interval at pointer time t is respectively [t,t+0.12], [t−0.06,t+0.06] or
[t−0.12,t]. Trim the interval at source and kept-region boundaries; do not shift
it across removed audio to preserve its length. A pointer inside removed audio
stays silent. Empty endpoint windows never call play(), which could restart an
ended media element from zero.

Holding a plain left click or dragging the playhead repeats the current grain.
Movement updates the grain with the existing seek coalescing. A faint waveform
overlay uses the same source-time interval, clipped only for its visible viewport.
The logical playhead stays at t while media plays from the grain's beginning.
Release/cancel, Escape, window blur, source change and unmount stop previews,
clear pending work and remove the overlay. Release restores each media element
to the requested pointer position and its previous playback rate. Volume,
channel mute/solo and source bytes are retained.

Ordinary Timeline, imported multitrack and archived OBS share this scrubber,
including their focused-track editors. This round does not add an audition
transport to the separate LipSync composition editor or to live recording.

## Evidence

See `docs/gates/subtitle-scrub77-20261021.md` for the red/green typography probe,
real-media held-pointer browser checks, regression gates and preservation of
the existing uncommitted LipSync work. No acoustic/model inference is claimed.
