# 0097 — Serialize stretch requests and retain playback transport until ready

Accepted2026-10-17, round39.

The editor needs one active request with a replaceable pending preview, and final
commit behind active work. Superseded operations must not publish an obsolete
packet. Cancel/output changes invalidate queued work and response ownership;
client cancellation does not imply stopping an already running synchronous
FFmpeg process. Keep server revision checks and do not auto-commit a preview.

After an older preview completes, dispatch the latest pending operation without
adding another trailing180ms delay. Initial pointer debounce can remain. Pointer
release must not race preview and commit requests against one another.

An operation matching a previously accepted preview is not proof the audio
element has loaded it. Preserve mapped seek/resume state until the actual audio
transport has consumed its metadata. Test response-before-metadata ordering,
not only cached responses that arrive after playback is already ready.

These safeguards reduce avoidable wait and prevent transport loss. They do not
establish audible continuity or the250ms browser gate without real interaction.
