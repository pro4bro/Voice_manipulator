# ADR 0073 — Show the slot before waiting for capture or processing

Accepted for PORT-FEEDBACK-03, 2026-10-13.

## Context

The owner expects a visible slot as the first UI response to importing footage,
recording audio/OBS or generating speech. Previously recording appeared only
after upload, OBS waited for journal polling, and Voice Output waited for an
output. A busy button elsewhere did not explain the missing item.

## Decisions

- Apply changes in main source and issue the numbered portable update from the
  same source, following ADR 0072. Keep core/model payloads independent.
- Allocate a client slot before awaiting permissions, capture Start, selected
  track decoding or generation dispatch. Keep its identity through preparation,
  recording and saving. Show a working animation and accessible status; honor
  reduced-motion preferences. Waiting for an import choice has a static slot.
- Recording uses the capture ID already carried by the audio receipt. Failed
  saves retain the captured File in the current project session for retry. A
  received audio receipt survives transcript-update failure without reupload.
  A permission failure is an error slot, never a successfully saved footage.
- OBS Start emits an optimistic row. On acknowledgement it gains the actual
  recording ID, refreshes Media Pool immediately, and disappears when the real
  journal or MKA asset occupies that identity. Pause/resume/stop create no extra
  slots. Ignore stale poll responses; a failed Start cannot be revived by a poll.
- OBS file import shows the inspected file before awaiting decoding, then keeps
  the same slot while its session processes. Workspace polls pending session
  identities even when the OBS module is hidden. A ready session without its
  media receipt cannot remove the slot.
- Generation creates a visible first row before dispatch and preserves it
  through server progress. Only an output receipt replaces it. Failure or
  cancellation retains a static status; active slots cannot be dismissed.
- Pending client slots are UI state, not project media, playable audio, training
  inputs or durable model outputs. Existing server journals/artifacts remain
  authoritative. Transient pending rows do not survive a full app reload;
  this round does not implement generation restoration or upload idempotency.

## Acceptance

Deferred permission/API tests prove the first row exists before completion.
Integration tests cover recording save/error/retry, OBS acknowledgement/dedup,
and generation progress/error/output replacement while retaining Stop fencing.
Real source and installed portable browser checks hold a real WAV import before
decoding, inspect the rendered animation, then release it and verify the ready
asset and audio. File inventories and the native portable gate prove packaging
parity. These fixtures do not establish physical OBS/GPU inference performance.
