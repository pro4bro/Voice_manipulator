# AI Queue proposal — 2026-10-08

Status: recommendation from USER-FEEDBACK-02; a unified Queue module and global
scheduler are not implemented by this round.

## One place to inspect work

Use one Queue module with tabs **All / STT / Diarization / Training / TTS**.
Tabs filter the same jobs; they do not create competing queues. Default to the
open project, with an explicit all-projects view for host GPU ownership.

- STT/DIA: project → footage → audio tracks. Parent rows aggregate real child
  states and completed/total counts; show the active child by name.
- Training: project → batch → speaker run. Link its frozen dataset manifest
  and source footage. A run may use several footage files; they are sources of
  one model run, rather than independent training jobs.
- TTS: project → generation job → Script rows/output clips. Link each completed
  row to its real output artifact.
- States: waiting, waiting for GPU, running, paused, completed, failed,
  cancelled/interrupted. Display progress only when the engine reports it;
  otherwise show an activity indicator and elapsed time.
- Start, pause/resume where supported, remove waiting jobs, and Stop. First
  Stop halts the waiting queue while active work completes; repeated Stop asks
  before cancelling active work, matching the existing shared Stop control.
- Dependencies can express STT → DIA → dataset compilation → Training → TTS.
  A failed prerequisite blocks its dependent job with a visible explanation.
  Do not infer this pipeline from checkbox selection alone.

## Existing implementation seams

`sequential_transcription_queue.py` and `sequential_diarization_queue.py` own
their pending/active work and cancellation. `file_training_runs.py` persists
training runs; `training_runner.py` executes them. `voice_script_speaker.py`
owns generation rows. Preserve those adapters and their artifact checks.

`gpu_lease.py` provides process-aware ownership of the GPU. It prevents overlap
but has no global ordered list of STT/DIA/Training/TTS jobs: lease acquisition
polls or reports busy. A unified UI alone cannot promise global FIFO scheduling.

`activity_center.py` is a useful live status/log feed. Finished tasks disappear
after 25 seconds and its storage is process memory; it is not a durable Queue
history or a restart recovery ledger.

## Suggested implementation order

1. Build a read-only aggregate Queue view using existing authoritative statuses,
   stable job IDs and result links. Show available actions by adapter capability.
2. Persist an orchestration ledger and submit GPU work through one host
   dispatcher. Default to FIFO; allow moving waiting jobs and explicit priority.
   Keep the GPU lease as the final process safety gate. CPU imports/waveform work
   can continue while a GPU job runs. Release/claim must finish before reporting
   a handover as complete.
3. Add dependency chains, restore queued intent after restart, and reconcile
   active records with live owners/checkpoints. Preserve completed artifacts;
   never convert an orphaned running flag into success.

Acceptance: parent/track aggregation, cross-kind ordering, waiting-for-GPU,
first/confirmed Stop, no duplicate dispatch, restart recovery, portable result
links, and completion backed by WAV/model/transcript artifacts. Verify actual
GPU handover separately from UI tests.
