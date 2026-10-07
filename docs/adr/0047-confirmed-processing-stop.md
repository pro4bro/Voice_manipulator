# 0047 — Confirmed processing Stop

Date: 2026-10-07. Status: accepted for TASK-STOP-01.

## Decision

Processing Stop has two levels. The first click removes queued work and lets
the active file, segment, Script row or training voice finish. A second click
within 1.2 seconds opens the shared Yes/No app dialog. No keeps queue Stop;
Yes requests cancellation of active work as well. Scope is the clicked pipeline
in the current project. The OBS recording control names its recording; the
general STT control also covers growing MKV and OBS detailed transcription.
Recording and continuous live capture retain their existing capture controls.

Each dispatched task owns a cancellation key. Stop sets publication fences
before awaiting engine acknowledgement. Late progress, recognition results,
cursor advances and output publication cannot revive cancelled work. Generation
reserves ownership before entering the threadpool. The UI also rejects stale
running snapshots after a terminal Stop response.

Studio runs inference in product-owned child processes under its shared queue
lock. Successful consecutive files reuse the warm model; cancelling one task
terminates its child, and subsequent work starts a new child. Switching between
STT and diarization retires the other idle child to avoid retaining both GPU
models. Idle release participates in the existing GPU release contract.
Engine and training cancellation target owned processes; failure to confirm
termination is an error, not successful cancellation.

Detailed STT stop flags persist with checkpoint state. Only explicit rerun or
Resume clears them. Derived aggregate status is not persisted as track control.
Training preserves saved checkpoints and only permits Resume after the previous
executor releases ownership. Queue-stopped generation publishes any completed
Script prefix as `stopped`; hard cancellation fences unfinished publication.
Original sources, analysis PCM and completed artifacts are retained.

## Evidence and limits

See `docs/gates/task-stop-2026-10-07.md` for unit, subprocess and real browser
evidence. Synthetic process tests prove ownership, reaping and result fences;
they do not establish behavior of each installed GPU model or physical device.
TASK-STOP-DEVICE-01 remains the model-load, Stop, rerun/Resume acceptance round.
