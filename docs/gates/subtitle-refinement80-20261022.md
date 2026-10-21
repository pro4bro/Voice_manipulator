# Round80 — Input subtitle refinement and drift review

Completed2026-10-22; started2026-10-21. STT-ALIGN-05/06, ADR0128.

## Product slice

Input's right column now contains **Tinh chỉnh subtitle → Mở tinh chỉnh subtitle**
for any selected finalized footage/track. Eight methods can be tried separately:
read-only drift check, common measured offset, independent measured IN/OUT,
group offset, individual CTC, waveform-vector review, manual offset and
conservative combined. Method descriptions distinguish estimates from learned
calibration. Before/after source audition, waveform and corners, word review,
selected Apply, Restore and existing Undo/Redo remain available.

Changing method/scope/offset clears prior proposal selections and stale requests.
Persisted proposals restore the matching method and values. Manual word timing
remains locked in every editing mode. Read-only analysis includes manual words;
diagnosis Apply is rejected by the API as well as disabled in the dialog.

Source-bound acoustic artifact reuse avoids repeated model inference while
trying methods. Identity includes words, audio SHA, exact index scope, semantic
asset snapshot, worker/weights/configuration and relevant runtime metadata.
Manual offset can reuse existing evidence but never starts model inference.

## Frozen current STT comparison

Artifact: `.scratch/subtitle-refinement80/methods-final/` contains complete
proposals, project-owned model artifacts, applied/restored snapshots and report.
Reproduce into a new output directory:

```powershell
.venv/Scripts/python.exe scripts/profiling/subtitle_alignment_methods_smoke.py --output .scratch/subtitle-refinement80/new-method-trial --reuse-alignment .scratch/subtitle-alignment79/real/round79-final
```

692 current STT words;235.989333s mono24kHz PCM16.587 unique manual lexical pairs
are evaluated only after proposal selection. The first method replays the exact
Round79 real CTC input/output after word/audio/worker/model hash checks; subsequent
seven methods reuse source-bound acoustic artifacts. No fresh inference or
reference-fitted calibration is claimed for this comparison. Model/runtime/license
constraints remain those in the Round79 gate.

| Method | Ready | Review | IN / OUT absolute median on all587 fixed pairs |
| --- | ---: | ---: | ---: |
| Unchanged current STT | — | — |159.8 /111.8ms|
| Conservative combined |21|671|158.2 /107.9ms|
| Common measured offset |640|52|69.1 /56.3ms|
| Separate measured IN/OUT |204|488|141.8 /97.5ms|
| Group offsets only |21|671|158.2 /107.9ms|
| Individual CTC |0|692|159.8 /111.8ms|
| Waveform-vector |0|692|159.8 /111.8ms|
| Manual+100/+80ms trial |240|452|141.8 /96.3ms|
| Read-only diagnosis |0|2 invalid-source rows|159.8 /111.8ms|

Metrics describe default-selected output, with unselected words retaining source
timing. CTC produces690 changed candidates. Vector produces21 changed two-edge
proposals from real PCM corners; all remain review. No vector acoustic improvement
is claimed from the unchanged default output. Common translation preserves word
spans; it does not solve duration. Every method with ready words performs actual
bulk Apply and exact Restore on the disposable project. Diagnosis mutation is
rejected and its read-only state is asserted.

## Large-drift evidence

Qualified CTC comparison uses score>=0.8, valid intervals and endpoint displacement.
250ms/500ms thresholds identify review candidates, not verified recognition errors.

| Input | Scope | Compared | Unassessed |>=250ms|>=500ms| Invalid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current STT |692|456 (65.9%)|236|177|68|2|
| Owner-reviewed words |697|487 (69.9%)|210|18|1|0|

The corrected-word trial uses **fresh actual local CPU CTC inference**, complete
in65.57s including analysis under concurrent test load. It is not a latency
benchmark. Artifact: `.scratch/subtitle-refinement80/reviewed-diagnosis/`.

```powershell
.venv/Scripts/python.exe scripts/profiling/subtitle_alignment_methods_smoke.py --output .scratch/subtitle-refinement80/new-reviewed-trial --word-source reviewed --diagnose-only
```

All692 locked words and5 other words remain unchanged. Median signed CTC versus
reviewed source offsets are+5.7ms IN/-6.4ms OUT. The18/1 discrepancies include
possible model disagreement with heard manual timing; they are not18 confirmed
owner mistakes. Unassessed words remain unknown. No independent precision/recall
or held-out detection acceptance is claimed. Reports apply to the input timing;
the UI states they do not predict the applied proposal's diagnostic result.

## Source integrity and checks

Both reports verify identical before/after owner SHA256s:

| Owner artifact | SHA256 |
| --- | --- |
| reviewed words.json |`492a9e5f507521a385c87c5a85290125531235015626fd4761eb8ab7c63cb65b`|
| transcript.stt.json |`603e76ebb0c4b55e1aa7a20e514d25be492bfaa458db4c88ec7185bac3a4e0d3`|
| analysis.wav |`9e8fa0f378b726617756c65e928d005e272b6f3b73f52e0d4169a5b8cb52044e`|
| source.mp3 |`9bfa1d98422b2cd297c077545f459552a1860d2175c7ba790f919de43cbc78af`|

Source and copied PCM hashes match. No new resampling, processing derivative,
clipping or audio boundary transition is introduced; this slice edits word
coordinates only. No owner transcript/media, engine, model, STT default or
portable release changes.

- Full frontend:1186 passed/147 files/168.52s. Latest focused18 passed/3 files
  after adding persisted-method regression and final dialog/report wording.
  Final typecheck and build210 modules passed.
- Full API:1307 passed/3 existing warnings/616.80s. Latest focused60 passed after
  final artifact reuse/manual-diagnosis changes and invalid-source-with-cuts
  regression (the extra regression was added after full-suite collection).
- Isolated in-memory inversion of the diagnosis branch is killed by method tests;
  product source SHA before/after is identical. Five-axis review covers explicit
  modes, manual locks, missing evidence, semantic cache binding and source paths.
- No skipped tests, assertion suppression, relaxed acoustic thresholds or new
  dependencies. Earlier local smoke failure from passing str to a Path helper
  remains in `methods-current`; corrected runs are retained. A focused frontend
  command first used an incorrect log path and was rerun successfully.
- Browser verification was attempted via CUA; Work settings returned **Local
  browser use is disabled** with no browsers. Final visual/device-audio acceptance
  remains pending. DOM tests, actual model/files and browser acceptance are
  separate evidence. No successful final browser inspection is claimed.

The majority coverage improvement on this conversation comes from explicit common
offset review. Generalized calibration, trustworthy automatic vector boundaries,
held-out conversations and actual-device UI/audition remain gaps. Phase03 stays60%,
Phase06 remains open. Stop80.
