# TASK-STOP-DEVICE-01D1 — reuse Resume token cache

2026-10-07. Bounded repair found while preparing actual Training Stop/Resume.

The runner wrote dev tokens to `data/dev-tokens/data.lst`, but looked for them
at `data/tokens/dev/data.lst`. Consequently Resume re-tokenized both splits even
when its train/dev token lists were already complete. The repair reuses the
current pair, preserves the legacy dev layout, and regenerates both splits when
either list is missing. No upstream, persistent-format or checkpoint change.

## Evidence

The regression exercises the exporter and runner branch: the current complete
layout fails before the repair with two tokenizer calls instead of zero. The
legacy complete layout and missing-split cases retain their expected behavior.
All six cases pass after repair; the full Training runner file passes19 tests.
Lead diff review and `git diff --check` pass. Full verification logs are under
`.scratch/task-stop-device-01d`; final counts are recorded in the current ledger.

This proves cache selection and execution branching. Actual checkpoint Stop,
same-run Resume and model publication are the next01D3 acceptance slice. A
checkpoint directory is not a completed save until the engine save marker and
the wrapper's nonempty `train_config.json` exist; a progress step alone is not
evidence. The cancelled run's API checkpoint list can remain empty until normal
completion even though saved files are retained; that separate observation is
not repaired here. Identity, voice quality and physical/browser gates stay open.
