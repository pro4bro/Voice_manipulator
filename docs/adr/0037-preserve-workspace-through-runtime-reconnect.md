# ADR 0037: Preserve the workspace through runtime reconnect

## Status

Accepted — LIVELINK-STT-12M, 2026-10-03.

## Context

App rendered its boot/offline branches before the selected project's workspace.
An API outage or the loading state during restart therefore unmounted the
workspace, discarding selected footage, local Script state, scroll, zoom and
transcript polling cursors. A healthy replacement API could not restore that
review session. Timeline also retained transport errors after idle status or
recording-list polling recovered.

## Decision

- The selected project owns workspace lifetime. Keep its component and stable
  wrapper mounted across runtime availability and post-restart project refresh.
  Key by project ID so changing projects still starts a different workspace.
- During unavailable/busy runtime state, mark that wrapper `inert` and show a
  sibling recovery dialog with the existing runtime actions. Focus enters the
  dialog, Tab stays among enabled controls, workspace keyboard events are
  blocked, and previous connected focus is restored when the dialog disappears.
- Keep existing subscriptions mounted so recovered requests continue from
  their retained cursors. Existing transcript merge/revision semantics remain.
- Track status and recording-list errors separately from waveform/playback
  errors. Clear each polling error on success of its corresponding request;
  successful status alone must not dismiss a real waveform/playback failure.
  The internal waveform subscriber adds an optional status-error callback and
  preserves its existing fallback for callers that omit it.

## Consequences

Review can continue in the same browser document after services restart.
No new persistent workspace format, public API, audio processing, native plugin
or engine change is introduced. F5/new-tab restoration and ongoing physical
OBS capture through restart are separate acceptance boundaries. This does not
claim uninterrupted playback during the outage or solve historical natural
listener loss/disk stalls.

Regressions and two isolated real-browser API-exit/recovery cases are recorded
in `docs/gates/livelink-stt-12m-workspace-reconnect.md`.
