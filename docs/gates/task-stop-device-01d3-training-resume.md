# TASK-STOP-DEVICE-01D3 — actual checkpoint Stop/Resume

2026-10-07. Fresh product Training lifecycle on the disposable01D2 manifest;
cached OmniVoice, short20-step LoRA, save/eval every5, batch512. This proves
execution and retained artifacts, not a trained speaker's identity or quality.

## Actual Stop and Resume

The initial fresh run fails tokenization;01D3A records that separate repair.
API Resume retries the same failed run `run-76f6bc2427c6` and manifest
`dataset-2a6875e67140`. Five train/one dev tokenize successfully; measured
loader passes are4 batches each and the20-step request is retained.

- Queue Stop leaves the single active training voice running. There are no
  pending voices in this fixture; real removal of a populated training batch
  is not claimed (batch regressions retain their earlier meaning).
- After the engine's `Saved checkpoint to` marker and wrapper config exist,
  checkpoint5 has11 nonempty files including full model2,557,952,520 bytes,
  adapter107,596,368 bytes, optimizer215,420,417 bytes, scheduler and RNG state.
  Stop occurs after hashing them, at approximately step10 before the next save.
  All four owned process PIDs `[23876,47544,66420,88096]` are absent afterwards;
  all11 checkpoint hashes match, activity is cancelled and lease releases.
- Same-run/same-manifest Resume clears cancellation only after executor cleanup.
  The01D1 repair reuses train/dev token lists. Config names checkpoint5; actual
  engine output confirms model, optimizer, scheduler and random states loaded,
  then `Resumed from step 5`. It finishes20 steps and publishes the real LoRA
  voice `voice-17d84f859fc5` backed by checkpoint20,2,892,423,576 bytes total.
- Actual Generate with that trained adapter produces WAV3.2s/153,644 bytes,
  mono PCM16/24kHz, zero clipping and zero edge-sample jumps. The engine return,
  project output and audio file agree.19 source/analysis/reference hashes and
  both earlier Generate outputs remain identical; lease releases and tasks end.
  No intelligibility, word-boundary or speaker similarity acceptance is inferred.

Evidence under `.scratch/task-stop-device-01d`: `train-checkpoint-ready.json`,
`train-queue-stop.json`, `train-stopped.json`, `train-resume-start.json`,
`train-acceptance.json`, `train-retry-harness.log`, `train-gpu.json`,
`lora-generation.json` and the run's append-only progress/process log. Full
API658/two existing warnings passes in172.41s after the command repair; the
unchanged frontend560/63, typecheck/build passed earlier in this invocation.
Focus runner19/process17 and Lead diff check also pass. Training and API tests
overlap in part; these times are not performance-budget evidence.

## Limits, cleanup and exact next

The cancelled run's API `checkpoints` array was empty although saved checkpoint5
was intact; Resume discovers it from disk. Final completion refreshes the list.
Checkpoint-list freshness and interruption during an unfinished save remain
separate recovery checks; this test deliberately stopped after a complete save.
Retention1 removes older completed checkpoints during later successful saves.
No UI/browser Yes/No, physical audition or owner identity claim is added.

Owned fixture API/Studio/warm generation child are stopped after confirming no
active task or GPU lease; `cleanup.json` records it. Media, checkpoints and proof
are retained. No credentials were copied. Normal services start from current
source using the official workload script in a hidden host; no browser is opened
because browser access was rejected by tool policy. `normal-health.json` and
normal readiness logs record actual activation.
The first hidden test host omitted the process-tree helper required by readiness;
it exited before starting workloads. Its owned controller was stopped and the
wrapper fixed to import both official helpers. This was harness setup, not a
product launcher regression; original and corrected host logs are retained.
Corrected normal host7312 retains controller30464/API87136/Studio90088;
all three health statuses are ok. Readiness2.612s/2.812s/2.697s, respectively.

Next acceptance: UX-EDITING-DEVICE-01 native picker, real-load interaction and
audible scrubbing; physical mic/OBS, browser saved-file/cancel and second-machine
LAN/Tailscale gates need their device evidence. Reviewed recognition/speaker
labels and identity/QC still gate Phase03. Owner-specific project selection
remains relevant to those quality gates; it no longer blocks this disposable
model-lifecycle proof. Existing recognition thresholds and phase progress remain.
