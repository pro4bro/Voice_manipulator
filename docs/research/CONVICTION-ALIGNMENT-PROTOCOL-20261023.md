# Conviction alignment comparison protocol

**Date:** 2026-10-23

**Purpose:** Give the Lead a reproducible, CPU-bounded plan for comparing MFA,
stable-ts and EasyAligner against the existing Conviction manual timings. This
document specifies an experiment; no alignment inference was run for it.

## Evidence and limits

Use the frozen inputs in `.scratch/stt-conviction78/run-2/` and the current
Conviction baseline cited in `docs/gates/stt-conviction78-20261021.md`. They bind
the 235.989s mono PCM16 analysis WAV and hashes. The reference has 680
manual/trusted words, but only 587 uniquely corresponding words against current
STT (581 against archived STT); prior scoring reports retain unmatched references
instead of dropping them silently. The owner described the boundaries as
approximate (~80% self-assessed), and intentionally omitted some overlapping
speech. It is neither exhaustive lexical ground truth nor a blind reference.
Earlier Conviction analyses have already seen full-conversation results, so any
same-recording split below is correlated tuning/validation, not an untouched
test set. Report it as such and require another conversation/project before a
general or production recommendation.

## Leakage-safe inputs and split

Freeze source, WAV, current and archived STT, manual Script, scorer, worker code,
runtime/model receipts, and settings by SHA256 before execution. Keep original
PCM unchanged. Use the corrected/manual transcript only as text in a separately
labelled corrected-text arm. The timing reference must never set crop start/end,
group membership, padding, worker `indexes`, initial timestamps, or parameter
choice.

Run two transcript arms when the harness supports them:

1. **Recognizer-text arm (primary, API-compatible):** current STT text and its
   archived/current STT times seed the existing workers. Use exactly the same
   frozen input and only worker-supported settings.
2. **Corrected-text arm (diagnostic):** manual/corrected text may be supplied,
   but crop/group boundaries must come from the corresponding original STT
   segment groups and their times, not the corrected words' manually reviewed
   times. Do not invent seed timestamps for inserted words. If the current
   worker contract cannot represent fixed external crops without reading
   corrected word times, defer this arm or have the Lead add a research-only
   harness; do not smuggle reference timing through the worker.

For scoring only, sort uniquely matched manual references by their *reference
time* to define contiguous blocks roughly 70% calibration / 30% validation,
with 2-second guard bands excluded from both. Freeze the split before
inspecting candidate errors. Run each configuration over the full frozen input;
do not derive worker `indexes`, crops or windows from this split. The split
selects which already-computed rows the scorer summarizes. Only calibration
scores may select settings. Validation is a one-time same-recording check and
remains correlated with calibration and prior work. Never shuffle individual
words: adjacent words share speaker, acoustics, context and model crop. Score
the unchanged existing pipeline baseline on exactly the same held-out
references.

## Bounded CPU sweep: 17 configurations

Pin engine/model/runtime versions and CPU thread limits; warm each engine once
on the same short calibration crop and exclude that warm-up from timed runs.
Then run the following 4+7+6 configurations serially on calibration, and only
the chosen setting per engine once on validation. Keep crop/window generation
identical between settings of an engine except for the parameter explicitly
being tested.

| Engine | Configurations | Question isolated |
|---|---|---|
| MFA (4) | `(beam,retryBeam)`: `(10,40)` default, `(5,20)`, `(20,80)`, `(10,80)` | Search width and retry width. MFA documents beam as search width and retry beam as width used if initial alignment fails; retry is not a second quality pass on every word. |
| stable-ts (7) | base/refine off/precision N/A; base/refine on at precision `.20`, `.10`, `.05`; small/refine on at `.10`; base/refine on `.10` with window `10s` and `30s` instead of `20s` | Isolate refinement and precision, then test a second model and shorter/longer grouping. Treat precision as refinement search resolution, not a claim of better truth. Windows change worker grouping/cropping and can change alignment context. |
| EasyAligner (6) | window/padding: `(10,.5)`, `(20,.25)`, `(20,.5)` default, `(20,1.0)`, `(30,.5)`, `(30,1.0)` seconds | Probe group duration and supplied audio context. Keep its fixed model, language and token normalization unchanged. |

The current worker settings expose MFA beam/retryBeam; stable-ts model, refine,
precision, maxWordDuration and windowSeconds; EasyAligner windowSeconds and
paddingSeconds. Keep stable-ts `maxWordDuration=3s`, EasyAligner normalization,
MFA model/dictionary, languages and all other settings pinned to defaults for
this first sweep. Current workers group from contiguous valid seed times, crop
with padding, and require exact output token sequence/count before mapping.
Stable-ts runs `align` then optional `refine`; EasyAligner uses CTC logits and
forced alignment; MFA writes JSON and maps its word tier. Missing or failed
words must remain missing with diagnostics, never be linearly filled or shift
neighbor identities.

These meanings are grounded in upstream primary sources: [MFA global options](https://montreal-forced-aligner.readthedocs.io/en/v3.1.3/user_guide/configuration/global.html)
and local pinned MFA 3.4.3 CLI; [stable-ts alignment/refinement source](https://github.com/jianfch/stable-ts/blob/main/stable_whisper/alignment.py)
and [stable-ts API README](https://github.com/jianfch/stable-ts/blob/main/README.md);
[EasyAligner source repository](https://github.com/kb-labb/easyaligner) and its
local pinned `easyaligner/alignment/pytorch.py`. The stable-ts repository is
archived; do not assume its current branch changes after the pinned version.

## Pairing, metrics and recommendation rule

Compute lexical correspondence once from normalized text only; require every
candidate's mapping to be unique under the scorer's optimal-alignment rule.
Never use timing closeness to choose a repeated-word partner. Report total
manual references, unique matched pairs, unmatched/ambiguous references,
candidate words without a pair, and measured timing coverage for every arm and
split. Primary engine comparison uses the same fixed unique reference anchors
for baseline and each candidate; also show each engine's own coverage so a
small easy subset cannot look like a win.

For each fixed anchor report start/IN and end/OUT absolute-error mean, median,
p90 and p95; signed median and mean error (`candidate - reference`, negative is
early); absolute duration error; percentage with **both** edges within 100ms
and 200ms; counts with either edge >500ms; invalid/out-of-source intervals;
and overlap-pair count. State denominators. Tabulate these for calibration,
validation and the full descriptive set; only validation is used for the final
one-time comparison. Keep overlapping/ambiguous-speech words as a separately
flagged stratum based on existing review evidence; absent a complete speaker
overlap annotation, do not attribute their errors to crosstalk or call their
timings wrong/right. Report runtime (load, warm-up, inference separately), peak
working set if available, and time per audio minute. No GPU, network fetch or
model mutation during the run.

Also report whether the unchanged baseline pipeline (text, SRT, quality flags,
manual locks, overlap/structure counts and current timing metrics) changed; it
must not. Preserve raw engine output, per-window/crop manifest, source PCM
hashes, normalized transcript, mappings, per-word output, diagnostics,
settings, versions, command line and timings under a fresh immutable
`.scratch/` run directory. Record failures and zero-coverage windows; do not
retry by silently changing settings. Do not apply candidates to the owner
project.

Recommend a setting only if it improves a predeclared validation objective over
the unchanged baseline on the common fixed anchors, retains stated coverage,
does not worsen severe-tail/overlap/invalid-interval counts, and has acceptable
runtime. Show tradeoffs and abstentions where it fails. Even a positive result
supports only this conversation; seek a second held-out conversation/project
before changing defaults or making a general accuracy claim.

## Review risks

- The reference was created with exposure to existing transcript/timing and
  prior analyses already reviewed all Conviction results. The proposed split
  limits new tuning leakage but cannot restore blinding.
- Transcript corrections and lexical omissions—especially overlaps—change the
  task. Keep recognizer-text and corrected-text results separate.
- Worker windows depend on seed timestamps; changing the window can alter
  which words are grouped and crop context. Log actual crops and compare only
  matched inputs within each engine's parameter sweep.
- MFA beam changes can have little effect if no initial alignment fails;
  stable-ts precision changes compute resolution; EasyAligner padding/window
  changes context. Avoid treating all knobs as equivalent “accuracy settings.”
- Scores are agreement with approximate manually reviewed boundaries, not
  objective acoustic truth. Do not fit a global offset on validation or use
  sample count to conceal one-conversation limitations.
