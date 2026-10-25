# ADR0152 — Training journal scope and shared Timeline transport

Date: 2026-10-26
Round: TRAIN-TIMELINE-UI-01
Status: Implemented; native visual acceptance pending

## Context

The owner needs the Training page log to explain its own training progress and
failures. Mixing the application activity stream into it buried engine output
under API polling and unrelated STT/TTS activity. The Training history screenshot
also confirms two completed OmniVoice runs and a failed RVC run; see ADR0151 for
the diagnosis and actual model artifacts.

Timeline controls must have the same arrangement on every page. Current time
and total duration belong together to the left of the bottom scrubber, right
aligned and vertically stacked. Playback rate, gain and clipping information
belong at the far right of the header after editing and zoom controls. The
scrubber's physical extent must match the visible waveform region.

## Decision

- Training log rows come only from progress journals of runs in the displayed
  batch. Engine preparation, commands, metrics, checkpoints, warnings and errors
  stay in chronological order, with speaker labels for multi-target batches.
  ModuleRegistry no longer supplies global activity events to TrainingJob.
  The legacy optional prop is accepted but ignored, and a regression test proves
  that even stale callers cannot inject app activity into the training log.
- Existing full-run logs and history remain available. The separate status list
  of other live tasks is not a training log source.
- TimelineTransport owns presentation of the play button, stacked clocks and
  scrubber slot for ordinary audio, imported multitrack, OBS and LipSync alignment.
  It does not own the playback clock or pointer gesture state. Each caller keeps
  its existing handlers, progress ref, rate choices and playback semantics.
- TimelinePlaybackSettings groups rate and existing readouts/actions in the
  header. Ordinary audio retains its existing 0.25–8x rate options; multitrack
  retains 0.5–2x. LipSync alignment has no rate/gain control to invent.
- Measure the visible viewport boundaries, including its label rail and vertical
  scrollbar, instead of assigning the scrubber a percentage of remaining footer
  space. ResizeObserver updates the layout when the module changes size. Scrolling
  updates the visible layer-label boundary. Global resize is a fallback where the
  observer API is unavailable. Measurements do not depend on clock updates.
- A column view whose waveform occupies the full width has no left label rail.
  In that view, play/clocks occupy a row above the full-width scrubber so controls
  cannot overlap it. The normal and layer views keep the left cluster beside it.
- Top navigation retains its workflow numbers and page names, without decorative
  page icons.

## Boundaries

No backend, engine, persistent project data, audio timing, media or model changes.
Native browser inspection is blocked at inventory by the local browser setting;
automated DOM/geometry and playback regression tests are evidence for behavior,
not a claim of visual acceptance on the owner's screen.
