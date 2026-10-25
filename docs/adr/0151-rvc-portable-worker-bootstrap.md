# ADR0151 — RVC portable worker startup and observable progress

Date: 2026-10-25
Round: TRAIN-PORTABLE-RVC-01
Status: Implemented; real GPU smoke verified; full-duration voice quality pending

## Evidence

The owner's Conviction RVC run `run-f49951fb60ec` failed at18:24:28 local time,
after4m22s, with `RuntimeError: makeDeviceForHostname(): unsupported gloo device`.
Its status is failed/globalStep0 and no model exists. The screenshot's15% is the
fraction reached before failure. Repeated API GET200 lines are app traffic.

The Windows portable RVC interpreter has `isolated=1`, `ignore_environment=1`.
Its `_pth` omitted the product-owned `rvc_site` startup hook. Setting PYTHONPATH
and PRO4BRO_RVC_SINGLE_GPU_GROUP alone did not load the hook; a real process-group
probe reproduced the identical Gloo failure. The older virtualenv smoke did not
prove that the portable interpreter or its spawned workers could train.

Enabling the startup hook revealed a second isolation failure: Applio's unqualified
`from data_utils import ...` depends on its train script directory, which embedded
Python omits. After registering that directory, a real GPU epoch saved a model.
However, epoch progress was still missing from its output: embedded Python ignores
PYTHONUNBUFFERED too, and Applio calls os._exit after saving, losing buffered prints.
An isolated subprocess hard-exit test reproduced this loss without loading a GPU.

The generic failure selector also contained literal backspace characters where
regex word boundaries were intended. It returned a traceback heading instead of
the terminal RuntimeError. Existing CUDA-specific tests had not caught that case.

## Decision

1. `RvcPaths.ensure_bootstrap` registers the product-owned startup directory and
   Applio train directory in existing portable `python*._pth` files. Entries are
   relative to the runtime, existing paths/comments remain, `import site` is
   enabled, and an already-correct file is not rewritten. Replacement is atomic.
   Standard virtualenvs keep their PYTHONPATH startup path. The RVC runner ensures
   this before launching commands; the portable runtime builder emits it too.
2. Keep the existing single-GPU Windows process-group compatibility policy.
   Registering the startup hook makes it apply to portable spawned children too.
   This change does not add a different multi-GPU policy or modify Applio code.
3. Under the existing RVC run flag, configure stdout/stderr for line buffering and
   write-through in every worker. Epoch lines and completion messages reach the
   product parser before a hard exit. Multi-GPU behavior remains as previously
   defined by the hook; no new distributed training support is claimed.
4. Repair the failure regex. Show legacy traceback-only errors using the concrete
   exception already present in their progress journal, without rewriting history.
   Terminal partial progress reads `Đã dừng ở 15%`; it is not reset to100% or0%.
   Per-target accessible text includes the terminal status. No polling or training
   percentage algorithm is changed because the screenshot and API agree it failed.

## Verification and boundaries

The final real GPU smoke used copies of the failed run's completed features in
an independent scratch experiment,1 epoch/8 optimizer steps. It emitted a parsed
Epoch1/1 step8/8 line, saved a55,182,289-byte inference model and16,388,819-byte
retrieval index. CPU reload found457 tensors, all finite; metadata epoch1/step8,
40kHz/f0/v2. Existing source feature hashes remained unchanged. Temporary experiment
junctions were removed; diagnostic optimizer states were deleted to reclaim2.59GB.
The final diagnostic model/index/logs remain in `.scratch/training-hang-01` and
are not published as an owner's trained Voice Model.

Two recent OmniVoice runs reached400 steps and published `Khoa Trịnh · LoRA`.
Both actual adapter files are107,596,368 bytes with394 tensors and structurally
valid safetensors offsets, plus config/reference audio. Their journals finish in
6m50s and6m03s. No evidence found that these particular runs are still training.
This artifact inspection does not establish voice identity or listening quality.

No owner run/status/history/media/checkpoint was rewritten. The local ignored RVC
runtime path file was repaired after a backup; new runtime builds carry the fix.
The running API was not restarted. Browser inventory remains denied, so native
UI acceptance is open. The full200-epoch training and listening acceptance remain
separate from this bounded startup/progress correction. See the round gate.

Final validation completed2026-10-26: frontend1381 passes; focused backend47 passes;
full backend1630 pass/1 known intermittent VibeVoice embedded-import timeout
(859.05s). The exact case passes alone16.07s with its60s limit unchanged. Full
backend acceptance remains open; no VibeVoice repair or full-suite green claimed.
