# TASK-STOP-DEVICE-01D3A — bound Windows tokenizer processes

2026-10-07. Repairs a real fresh Training failure before checkpoint creation.

## Failure and repair

The disposable01D2 dataset's fresh LoRA run `run-76f6bc2427c6` failed after42s
during tokenization. Upstream CLI defaults started three tokenizer processes on
the single GPU and24 DataLoader workers for five train samples. Saved process
output contains SciPy/scikit-learn DLL load failures explicitly citing a small
paging file, `MemoryError`, and22 exited DataLoader PIDs. The run is failed;
there was no checkpoint or model publication. All child processes exited.

The product command now uses upstream-supported `--nj_per_gpu 1` and
`--loader_workers 0` on Windows. Non-Windows retains upstream defaults. Source
engines, system paging configuration, source media and project format are
unchanged. This lowers process/commit pressure; it does not guarantee every
machine has sufficient RAM, GPU memory or pagefile capacity.

The command regression fails before repair (Windows flags absent); after repair
both platform cases pass and the full TrainingProcess file passes17 tests.
Lead diff review and diff check pass. The fixed fixture API reloads current source,
and Resume retries the same failed run and manifest. Actual tokenization produces
five train shards and one dev shard, zero errors or filtered/skipped samples.
Both real token-list files exist. This is actual tokenizer recovery, not yet
checkpoint Resume acceptance. Full-suite results and the subsequent01D3
checkpoint lifecycle are recorded separately in the current ledger.

Evidence under `.scratch/task-stop-device-01d`: `train-harness.log`,
`train-initial-failed.json`, `train-retry-start.json`, `train-retry-harness.log`,
and the retained run's append-only `process.log`. Initial fixture request with
`num_workers` was refused400 by the Training descriptor; that unsupported field
was removed from the harness without broadening the public parameter contract.
