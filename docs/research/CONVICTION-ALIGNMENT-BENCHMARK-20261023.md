# Conviction subtitle alignment benchmark

Round: **SUBTITLE-BENCHMARK-02**, 2026-10-23. This is an offline comparison on
copies, with no timing applied to the owner's Project. The experiment follows
the [protocol](CONVICTION-ALIGNMENT-PROTOCOL-20261023.md), with the actual execution
details and deviations recorded below.

## Findings for the current product

**EasyAligner is the strongest engine for a reviewable timing preview on this
recording.** The calibration-selected preset is Vietnamese, 30s window, 1.0s
padding, maximum move 2000ms, with additional offsets left at zero. On the 156
fixed anchors in the reserved final region, both-edge agreement within 100ms
rises from 13.46% to 65.38%; severe errors fall from 30 to 7. Median absolute
IN/OUT errors fall from 146.1/113.2ms to 17.8/52.0ms. Duration MAE falls from
171.7ms to 98.3ms. The observed full-audio run took 23.7s including loading.

**A common +133.8ms shift is a useful, cheaper alternative for the original
STT timing on Conviction.** Its value was fitted on calibration only. It reaches
47.44% within 100ms on the reserved region, reduces severe errors to 19, introduces
no new severe errors there and preserves zero overlaps. It leaves word durations
unchanged. This is a recording-specific calibration, not a general app default.

**Higher score does not make separate OUT expansion safe.** EasyAligner plus
calibration-fitted IN +0.94ms / OUT +41.88ms reaches 71.79% within 100ms, but
whole-output overlap pairs grow from 19 to 169. The ordinary engine preset still
has 19 pairs and introduces two new severe errors in the reserved region. None
of the tested engine postprocessing options meets the zero-increase overlap
gate relative to the original STT. These remain Ghost Preview/manual-review
choices. No default was changed and no candidate was applied to the owner Script.

**The current stable-ts and MFA bridges need targeted fixes.** In the recognizer-text
arm, the selected stable-ts small preset measures no accepted boundaries in the reserved region;
the product keeps STT unchanged there. Its group-level validator discards a whole
group if a word has an invalid/zero-length interval. MFA's dictionary emits
unknown labels, and the current product rejects the whole result. Partial MFA
diagnostics are explicitly distinguished from an accepted product run below.

The next implementation gaps are per-word abstention after identity validation,
preservation/review of unknown labels, and conflict resolution between moved and
unchanged neighbours. A smaller move limit alone is insufficient: in calibration,
EasyAligner with no extra bias has 71 overlap pairs at a 500ms limit versus 19 at
2000ms, because more neighbours retain their old locations. A second conversation
is needed before adopting any learned offset or engine preset as a general default.

## Reference and fair comparison

- The live Conviction Script matches the previously audited manual snapshot:
  697 words, of which 680 are explicitly `timingSource=manual` and trusted.
  The other 17 are retained as transcript context but excluded from timing truth.
- The source is mono PCM16/24kHz, 5,663,744 frames, 235.989333 seconds. WAV SHA256:
  `9e8fa0f378b726617756c65e928d005e272b6f3b73f52e0d4169a5b8cb52044e`.
  PCM SHA256: `fb44d9774f671232f9a14f44027f80864cbf4f08022e02043a5b894a811848a8`.
- The primary arm uses the frozen fresh STT result of 692 words and its original
  timing to generate engine crops. Unique lexical edit-distance correspondence,
  independent of timestamps, supplies 587 manual comparison pairs. The 93 other
  manual words remain in reference coverage denominators; they cannot be restored
  by timing refinement of the recognizer's text.
- The source-clock cut is 165.192533s, with a 2s guard on either side. Calibration
  has 506 eligible manual words / 427 paired anchors; validation has 169 / 156.
  Five manual words / four anchors fall in the guard. Every engine processes the
  full audio without using this split to choose crops or input words.
- Only calibration selects settings. Selection maximizes the fixed count with
  both edges within 100ms, then minimizes severe errors, then combined IN/OUT MAE.
  It uses effective proposals: missing or over-limit engine outputs keep STT
  timing. An explicit gate requires the same measured effective pair count as
  baseline. Raw coverage and raw errors are reported separately.
- Secondary calibration tries maximum movement 500/1000/2000ms and no bias,
  scalar bias, or separate IN/OUT bias, only on each engine's selected config.
  The bias is the negative median signed calibration error. Unchanged STT plus
  the same two bias controls provides a simpler alternative.
- Tuning rank and recommendation are separate. A qualified calibration option
  must keep coverage and must not increase either edge's p95, total severe errors,
  whole-output overlap pairs or invalid intervals relative to unchanged STT.
  The highest-ranked qualified option, if any, is frozen alongside the unrestricted
  winner before validation; an option is never retuned using the final region.
- The corrected-text diagnostic arm supplies the 697 corrected texts only.
  Neural crops come from frozen STT groups, assigned through unique lexical
  anchors and a documented sequence-midpoint fallback. Manual timing and speaker
  metadata are discarded. Synthetic EasyAligner seed bounds preserve those
  fixed crops; they are not returned as measured boundaries. MFA consumes text
  and full source audio without word seed timing.

The reference is the owner's approximate heard/waveform judgement, with some
overlapping speech intentionally omitted. This recording was used in prior
investigations: its reserved final region is a same-conversation check, not a
blind new recording. Agreement with these boundaries is not absolute acoustic
accuracy or a generalization claim. No complete overlap annotation was supplied.

## Runtime and interpretation

All runs are serial CPU, offline, with four Torch/OMP/MKL threads. Private
alignment runtimes do not share TTS environments. The neural profiles use
stable-ts 2.19.1, Whisper 20250625, EasyAligner 0.3.3, Torch 2.8.0+cpu and
Transformers 4.57.6. MFA is 3.4.3. Vietnamese model identities, hashes and runtime
receipts are stored with each run. Whisper small was added through the existing
verified setup; no model was trained or fine-tuned.

Unlike the initial protocol's suggested warm-up, no separate warm-up ran. Wall
time includes fresh worker/process/model loading, source resampling and alignment.
Existing caches and serial order affect timing, so these are observed latencies,
not repeated warmed performance estimates. Peak memory was not sampled.

Metrics are milliseconds: signed = candidate minus manual; negative is early.
MAE is mean absolute error; percentiles use nearest rank. Both-edge percentages
retain the stated fixed denominator, including missing measurements. Severe
means either edge differs by more than 500ms. Candidate overlap counts inspect
all valid words in the whole output, including unpaired words; they are not
validation-only counts or an assertion that overlapping speakers are incorrect.
No additional waveform refinement method was enabled in the engine comparison.

## Reproduction and artifacts

Local immutable inputs, raw JSON, process logs, model/worker receipts, mappings,
selection receipts and per-word CSV live under `.scratch/subtitle-benchmark-02/`.
The primary entry points are:

```powershell
.venv/Scripts/python.exe scripts/profiling/subtitle_engine_benchmark.py prepare .scratch/conviction-new-run
.venv/Scripts/python.exe scripts/profiling/subtitle_engine_benchmark.py run .scratch/conviction-new-run
.venv/Scripts/python.exe scripts/profiling/subtitle_engine_benchmark.py mfa-diagnostic .scratch/conviction-new-run
.venv/Scripts/python.exe scripts/profiling/subtitle_engine_benchmark.py select .scratch/conviction-new-run
.venv/Scripts/python.exe scripts/profiling/subtitle_engine_benchmark.py evaluate .scratch/conviction-new-run
.venv/Scripts/python.exe scripts/profiling/subtitle_engine_benchmark.py corrected .scratch/conviction-new-run
```

MFA diagnostic mapping uses `subtitle_mfa_partial_probe.py`: it only retains
unique exact lexical partners, leaving `<unk>` and ambiguous partners null.
It is explicitly **diagnostic-only-product-rejected**, never product success.

Initial harness preparation wrote all frozen artifacts, then its final status
print failed because `flush` was passed to `json.dumps`; that print was fixed.
Review also fixed ranking of empty scores, incomplete-sweep handling, fixed
effective coverage enforcement and post-evaluation source verification before
selection. This run's original protocol did not bind the evolving harness source;
workers/scorer/media were hash-bound before each inference. A separate code
snapshot is frozen before selection and verified before validation. These harness
fixes did not change engine settings, input text/crops, measured outputs or the
predeclared selection order. Product adapters/domains are checked against the
committed source at closure. New preparations also bind the runner itself.

## Primary held-out-region results

The engine settings were frozen before evaluating this region. The denominator is 156 fixed anchors (169 eligible manual references). Medians and p95 are absolute IN/OUT errors in ms. Overlap counts cover the whole output, not just this region.

|Candidate|Measured/pairs|Both ≤100ms|Median IN/OUT|p95 IN/OUT|Duration MAE|>500ms|Whole-output overlaps|
|---|---:|---:|---:|---:|---:|---:|---:|
|Original STT|156/156|13.5%|146.1/113.2|925.2/517.7|171.7|30|0|
|STT +133.8ms common offset|156/156|47.4%|55.4/61.8|791.4/392.3|171.7|19|0|
|STT +162.4ms IN / +109.2ms OUT|156/156|48.1%|77.2/52.6|762.8/416.9|166.2|18|14|
|stable-ts small raw|0/156|0.0%|—/—|—/—|—|0|1|
|stable-ts small effective (fallback)|156/156|13.5%|146.1/113.2|925.2/517.7|171.7|30|10|
|EasyAligner 30s / 1s padding|156/156|65.4%|17.8/52.0|480.2/484.7|98.3|7|19|
|EasyAligner + fitted separate offsets|156/156|71.8%|17.6/35.6|479.3/442.8|80.1|7|169|

The zero-measurement stable-ts row has no accuracy estimate; its effective row retains STT in this region. EasyAligner raw measured all 156 anchors here; product fallback affects its whole-output conflict count. Its effective default introduces 2 new >500ms errors while fixing many old errors.

### Full-recording descriptive scores

This set includes calibration, so it is descriptive and cannot replace the reserved-region check. The paired denominator is 587; whole-reference coverage remains relative to 680.

|Candidate|Measured/pairs|Both ≤100ms|Median IN/OUT|p95 IN/OUT|Duration MAE|>500ms|Whole-output overlaps|
|---|---:|---:|---:|---:|---:|---:|---:|
|Original STT|587/587|13.5%|159.8/111.8|722.2/412.2|158.1|75|0|
|STT +133.8ms common offset|587/587|52.0%|64.0/59.6|588.4/296.9|158.1|46|0|
|STT +162.4ms IN / +109.2ms OUT|587/587|50.6%|70.7/52.9|559.8/305.9|147.8|40|14|
|stable-ts small raw|209/587|15.7%|83.9/48.0|637.6/258.6|157.1|20|1|
|stable-ts small effective (fallback)|587/587|25.7%|130.5/89.7|774.9/381.9|157.5|67|10|
|EasyAligner 30s / 1s padding|587/587|69.7%|17.8/50.3|233.4/363.4|92.8|21|19|
|EasyAligner + fitted separate offsets|587/587|76.5%|17.4/37.1|203.2/340.8|77.5|20|169|

## Calibration parameter sweep

Only these calibration scores selected the presets. All 17 attempts finished: 13 produced accepted worker outputs and four MFA attempts were product-rejected. Wall time includes process/model load.

|Configuration|Status|Raw measured/427|Effective both ≤100ms/427|Effective >500ms|Wall seconds|
|---|---|---:|---:|---:|---:|
|mfa-b10-r40|MFA product rejected|—|—|—|305.7|
|mfa-b5-r20|MFA product rejected|—|—|—|87.8|
|mfa-b20-r80|MFA product rejected|—|—|—|63.0|
|mfa-b10-r80|MFA product rejected|—|—|—|55.2|
|stable-base-align-p0.1-w20|accepted|94|72|45|27.7|
|stable-base-refine-p0.2-w20|accepted|94|72|44|107.3|
|stable-base-refine-p0.1-w20|accepted|94|74|43|140.1|
|stable-base-refine-p0.05-w20|accepted|94|75|43|181.9|
|stable-small-refine-p0.1-w20|accepted|209|130|37|387.5|
|stable-base-refine-p0.1-w10|accepted|208|111|46|211.9|
|stable-base-refine-p0.1-w30|accepted|0|58|45|130.6|
|easy-w10-pad0.5|accepted|425|295|13|25.8|
|easy-w20-pad0.25|accepted|425|291|17|23.4|
|easy-w20-pad0.5|accepted|425|296|11|34.2|
|easy-w20-pad1.0|accepted|425|294|13|28.5|
|easy-w30-pad0.5|accepted|425|304|10|23.4|
|easy-w30-pad1.0|accepted|425|305|14|23.7|

MFA's four raw hashes are identical. Its unique known-label diagnostic maps 606/692 input words and leaves 86 unknown labels null. Beam changes did not solve the vocabulary limitation; the default wins only the frozen tie-break order. See the compact JSON and MFA CSV for raw and simulated-guard metrics.

### MFA partial diagnostics on the reserved region

These rows are **not accepted product proposals**. The denominator remains all
156 fixed anchors, including unknown/unmeasured words. The simulated guard retains
STT for missing or over-limit boundaries; it does not turn a rejected run into
product success.

|Diagnostic|Measured/pairs|Both ≤100ms|Median IN/OUT ms|p95 IN/OUT ms|>500ms|Whole-output overlaps|
|---|---:|---:|---:|---:|---:|---:|
|Known labels only|134/156|54.5%|31.6/33.1|1112.9/1113.5|16|0|
|Simulated 2000ms move guard + STT fallback|156/156|56.4%|37.8/42.0|1047.2/904.3|18|82|

The simulated guard introduces nine new severe errors in this region while fixing
some original severe errors. Its good median on known words must not hide the
large tail and unknown-word coverage gap.

## Corrected-text diagnostic

The same preselected settings were replayed with corrected text only. No parameters were selected from these results. This is a research harness, not an applied product proposal. All 680 trusted manual words are eligible; the common-anchor view isolates the same 587 references used for primary comparison.

|Engine/status|Whole reference measured/680|Whole both ≤100ms|Whole >500ms|Reserved region measured/169|Reserved both ≤100ms|Wall seconds|
|---|---:|---:|---:|---:|---:|---:|
|stable-ts: complete|349|22.9%|35|51|17.8%|348.3|
|easyaligner: complete|678|62.5%|70|169|61.5%|27.3|
|mfa: diagnostic-only-product-rejected|598|58.1%|81|147|52.7%|155.1|

### Corrected-text crop-context limitation

This diagnostic is **not an isolated text-only ablation**. Its synthetic EasyAligner
seed bounds reproduce each full STT group crop. Around unsupported corrected tokens
53 and 398, however, the product splits supported runs and both sides reuse the
full group crop. The primary recognizer-text arm bounds those runs by their own
STT times. For example, the corrected runs on either side of token53 both see
0–30.76s; corresponding primary runs see 0–16.55s and 14.74–30.76s. A second pair
reuses 118.32–148.40s rather than the two primary run windows.

On the 585 common anchors measured by both raw runs, the two affected chunks have
1 primary severe error versus 28 corrected severe errors; other chunks have
18 versus 22. This localizes a substantial input-context confound. Text also
changes, so it does not establish that crop reuse alone causes every regression.
Do not interpret the corrected arm's aggregate decline as evidence that correcting
text reduces engine quality. A follow-up must preserve per-run STT-anchor context
or abstain around unsupported splits. Manual word coordinates must stay outside
that preparation step.

## Verification and remaining scope

The focused backend/scorer/worker checks pass; detailed counts and final hashes are
recorded in the round gate. No application frontend or endpoint changed in this
round. The owner's project manifest, media index, Script, original MP3, analysis
WAV and archived STT retain their original SHA256 values. Private model/worker
identities and the frozen selection/scoring code are audited at closure.

No engine was trained, no global default was changed, and no result was applied
to the manual Project. The measured recommendation is for this recording's
preview workflow. Product-level unknown-word/group abstention and neighbour
conflict handling remain implementation gaps, and another recording is required
for broader accuracy claims. The adjacent compact JSON retains the numeric
metrics; the local `per-word.csv` and `mfa-per-word.csv` retain audit rows.
