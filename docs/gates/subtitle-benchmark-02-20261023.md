# SUBTITLE-BENCHMARK-02 gate — 2026-10-23

## Scope and outcome

Completed one bounded offline comparison of MFA, stable-ts and EasyAligner on
Conviction's manual reference. Seventeen parameter configurations and three
corrected-text replays ran serially on CPU. No owner Project edits, model training,
new product defaults, frontend changes or portable release were made.

The reference has 697 words / 680 manual-trusted eligible timings. Frozen fresh
STT has 692 words / 587 unique manual anchors. A source-clock 70/30 split plus
2s guard on either side gives 427 calibration and 156 validation anchors.
Input crops come from STT, never manual coordinates. Calibration choices and
code identities were frozen before validation. This is one previously inspected
conversation with approximate manual boundaries, not a blind general test.

## Measured decision

- **Preview engine:** EasyAligner Vietnamese, window30s, padding1s, move limit2000ms,
  extra offsets0. On the 156 reserved anchors: both edges within100ms102/156
  (65.38%) versus STT21/156 (13.46%); IN/OUT medians17.8/52.0ms versus146.1/113.2ms;
  duration MAE98.3ms versus171.7ms; severe errors7 versus30. It introduces2 new
  severe errors there and has19 whole-output overlaps. Observed run23.66s.
- **Simple Conviction calibration:** common +133.8ms on original STT gives
  74/156 (47.44%) within100ms,19 severe errors, no new severe errors and no overlaps.
  It preserves word duration and is not a general-purpose default.
- **Reject blind separate-edge expansion:** EasyAligner fitted IN+0.94ms /
  OUT+41.88ms improves112/156 (71.79%) but creates169 whole-output overlaps.
  No tested engine option passes the zero-increase overlap gate. Ghost review
  remains required; maximum movement500ms alone increases conflicts through
  mixed moved/unchanged neighbours.
- **Current bridges:** stable-ts small/refine.1/window20 measures zero accepted
  validation boundaries in the recognizer-text arm; effective output keeps STT.
  MFA's four raw outputs are identical, but86 unknown labels make all four product
  runs fail. Its partial lexical diagnostic maps606/692, is never counted as
  product success, and has a high error tail.
- **Corrected-text diagnostic:** stable-ts349/680, EasyAligner678/680 and rejected
  MFA partial598/680 measured manual words. The EasyAligner diagnostic reuses
  full crop context around two unknown-token splits; this is a documented confound,
  not evidence that correcting text inherently worsens alignment.

See [the full report](../research/CONVICTION-ALIGNMENT-BENCHMARK-20261023.md),
[numeric results](../research/CONVICTION-ALIGNMENT-BENCHMARK-20261023.json) and
[protocol](../research/CONVICTION-ALIGNMENT-PROTOCOL-20261023.md).

## Verification

Command from repository root:

```powershell
.venv/Scripts/python.exe -m pytest services/api/tests/test_subtitle_engine_benchmark.py services/api/tests/test_subtitle_corrected_probe.py services/api/tests/test_subtitle_mfa_partial_probe.py services/api/tests/test_subtitle_neural_worker.py services/api/tests/test_subtitle_mfa_worker.py -q
```

Actual final output: **59 passed in1.19s**. The reproduction replay of the four
MFA partial diagnostics exactly matches the independently generated calibration
metrics. Final closure validates5,490 primary CSV rows, unique reference partners,
the fixed effective denominators, selection identity, all frozen scoring code,
selected model files, workers and private runtime receipts. Product alignment
adapters/domains/workers have no diff against pre-round commit3698146.

The owner's project manifest, media index, manual words, original MP3, analysis
WAV and archived STT all retain their pre-run SHA256 values. The235.989333s
mono PCM16/24k source remains unchanged. Only deliberate in-memory16k or temporary
MFA PCM derivatives were used. Neural model setup added the verified Whisper
small checkpoint to the private alignment profile. TTS/GPU state was not used.

This round changes profiling code/tests/docs only; app frontend checks and the
full API suite were not repeated. Their previously recorded failures were not
suppressed or reclassified as passing.

## Retained evidence

Local ignored artifacts: `.scratch/subtitle-benchmark-02/`:

- `protocol.json`, immutable `reviewed.json`, `current.json`, `analysis.wav`;
- `runs/*/identity.json`, exact inputs, measured outputs, logs/failures;
- `selection.json`, `scoring-code/identity.json`, `evaluation.json`;
- `mfa-diagnostic-selection.json`, `mfa-diagnostic-evaluation.json`;
- `corrected/*/scores.json`, raw outputs/logs and `corrected-evaluation.json`;
- `per-word.csv` (5,490 rows), `mfa-per-word.csv` (587 fixed anchors);
- `verification-final.log`, `mfa-reproduction-check-2/result.json`, `final-audit.json`.

Selection SHA256:
`2fd7a805ddd5332487417ac23cd1b6b924e3342a1e6b9defa10eee50d25d385d`.
Manual reference SHA256:
`492a9e5f507521a385c87c5a85290125531235015626fd4761eb8ab7c63cb65b`.
Source WAV SHA256:
`9e8fa0f378b726617756c65e928d005e272b6f3b73f52e0d4169a5b8cb52044e`.

## Remaining gap and stop

Per-word abstention after exact text validation, unknown-label handling, and
neighbour conflict resolution need their own implementation round. The corrected
diagnostic also needs identical per-run crop context before text effects can be
isolated. A second conversation is required before changing general defaults.
Phase03 remains60%; Phase06 stays open. Stop after this named benchmark round.
