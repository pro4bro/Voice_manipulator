# Round79 — reviewed subtitle alignment and PCM-vector anchors

2026-10-21 · STT-ALIGN-01..04 · ADR0127.

## Implemented workflow

Script toolbar → **Căn chỉnh subtitle**, on Input and Training finalized footage
and individual imported/archived tracks. Choose whole track or current word
selection; automatic proposals or independent explicit IN/OUT millisecond offsets.
View before/after bounds, waveform, PCM corner landmarks, reasons and counts;
audition original/proposed source intervals with200ms context. Edit and explicitly
confirm uncertain or changed proposals. Apply selected eligible words, restore
the saved original, or use existing Script Undo/Redo. Manual timing stays locked.

Proposals/snapshots/logs belong to the portable project. Source PCM and original
media are never rewritten. Apply/restore check words/text, asset state and audio
SHA256 under the media lock, rejecting stale/conflicting changes without partial
word selection. Pending receipts recover only against the same source binding.
Pending Script writes are flushed before analysis/mutation; failures are surfaced.
Late waveform/analysis responses are fenced independently; track switches preserve
the correct destination of an already-authorized apply without taking over its UI.

Automatic correction remains an experimental proposal, not an STT default or a
claim that most words are solved. Missing local model still permits offset/review.

## Ordered evidence policy

1. A shared translation preserves spans in complete short speech groups with≥3
   high-score CTC anchors,≥60% temporal coverage, endpoint MAD≤30ms, edge median
   disagreement≤60ms and absolute translation≤500ms. No Conviction offset is fitted.
2. Local log duration/character median/MAD flags unusual spans; it cannot justify
   redistributing words, filling silence or trimming words to neighbours.
3. Individual CTC changes need consistent local anchors, small moves, plausible
   durations and source RMS support. Source bounds, manual locks and whole-output
   conflicts use the actual selected result, not rejected proposal coordinates.
4. Timeline's approximately1ms PCM min/max vectors supply steep acoustic corners
   stable at10/20/40ms. Same-direction corners within30ms corroborate CTC edges.
   They add a bounded consensus vote only to already-stable groups. No direct
   corner snapping or word identification from waveform alone is performed.

CPU-only pinned Vietnamese250h CTC, revision
`69e9000591623e5a4fc2f502407860bcdc0de0b2`; weights SHA256
`2529ffc057c90b3d576ea109999ea49f3bab9691f7a93297a91d69ce8c981f84`.
WhisperX3.8.6 / torch2.8.0+cu128 / transformers4.57.6; CUDA hidden,4 CPU threads,
offline,≤9s windows. CC-BY-NC-4.0 local experimental weights, no download/bundling.

## Real Conviction result

Immutable current692-word STT +235.989333s mono24kHz PCM16. The heard reference
has680 manual words;587 unambiguous manual lexical pairs. Reference timing is
evaluator-only. No source clipping or media changes are introduced.

Final automatic policy: **21 ready /671 review**,7 candidate translation groups/
93 words before conflicts. Readiness is3.03% of source words and21/587=3.58% of
paired manual words (21/680=3.09% of all manual reference words). The first
independent-word policy produced0 ready; a later policy coupling span-outlier
review to translation produced5. Those artifacts remain available.

A supported common translation can correct position while retaining an unusual
span. Keep the span warning visible; do not let it veto an independent translation.
A span-changing correction still needs individual confidence/review. No duration
or acoustic error threshold was relaxed to make the accepted words pass.

| Same21 automatically selected manual pairs | Before | After |
| --- | ---: | ---: |
| IN absolute median / mean |146.7 /230.2ms|36.7 /111.4ms|
| OUT absolute median / mean |118.0 /136.1ms|56.0 /67.1ms|
| IN / OUT absolute p95 |680.3 /231.4ms|543.3 /152.1ms|
| Span absolute median |54.2ms|54.2ms|

No selected IN regression;5 OUTs worsen. Two preexisting IN errors>500ms remain;
no new endpoint error>500ms or overlap. On all587 pairs, IN median159.8→158.2ms,
OUT111.8→107.9ms; span median86.1ms unchanged. Automatic coverage still does
**not** meet the majority goal. Unchanged tails:67 IN /14 OUT /75 either>500ms.

### Explicit measured common-offset preview

The UI can prefill a common translation from the average of measured global
IN/OUT medians. This only fills the inputs; the user separately creates, auditions
and applies a proposal. Global uniformity is not certified by local groups.

Controlled **+116ms IN and OUT**, calculated from CTC(+133/+99ms), not the heard
reference: **640 ready /52 review** (92.49% of source words). Real bulk apply640
and exact restore succeed on the clone. All587 paired manual words remain in the
comparison; unselected words retain their original times.

| All587 fixed manual pairs | Before | Explicit preview |
| --- | ---: | ---: |
| IN absolute median / mean |159.8 /253.9ms|69.1 /167.8ms|
| OUT absolute median / mean |111.8 /149.5ms|56.3 /92.3ms|
| IN / OUT absolute p95 |722.2 /412.2ms|627.1 /314.7ms|
| Span absolute median |86.1ms|86.1ms|
| IN / OUT / either errors>500ms |67 /14 /75|50 /7 /52|

Zero new errors>500ms; no overlap. This validates the owner's offset-first
hypothesis on this conversation as an opt-in reviewable correction. It is not a
new STT default, a general quality acceptance, or a claim that word spans are fixed.

Vector experiment detects210 corners;6 CTC edge votes support candidate groups.
Across high-score CTC/manual pairs,44 onset and13 offset boundaries lie within30ms
of same-direction corners. Diagnostic direct snapping (never applied) worsens
25/44 onsets and5/13 offsets. Onset median error12.0→14.3ms; offset15.5→21.9ms.
Thus corners help corroborate/review but cannot replace phonetic boundary evidence.

Actual local inference completed26.98s in `conviction-run-3`. Final policy reuses
that immutable measured artifact with exact input-word/PCM SHA checks; no further
inference or reference-fitted tuning. Real apply21/restore, explicit+100/+80ms
apply/restore, metadata preservation and moved-project reopen all pass. Owner
MP3, analysis PCM, reviewed words and STT artifacts retain their SHA256s.

## Retained evidence and checks

- `.scratch/subtitle-alignment79/real/round79-final/`: request/result/proposal,
  measured CTC input/output/log, metrics, bulk-offset-experiment, hashes, actual applied
  and restored portable project. Reproduce with `scripts/profiling/subtitle_alignment_smoke.py`
  and a fresh `--output`; `--reuse-alignment` verifies an immutable prior run. Add
  `--bulk-common-offset` for the controlled whole-track preview. Vector diagnostic
  details remain in `real/accepted-final/vector-evaluation.json`; the final PCM
  corners and measured CTC source are identical.
- `real/conviction-run-1..3`, `real/vector-offset-final*, `real/accepted-final` and `real/offset-first``: earlier evidence/failures
  retained. The replay's first protected-provenance assertion incorrectly expected
  existing sourceTiming to equal editable timing; corrected to preserve the prior
  sourceTiming object. Final actual apply/restore succeeds.
- `.scratch/subtitle-alignment79/worker/result-corrected.json`: waveform threshold
  probe;4 complete candidates all conflict with unchanged neighbours;0 accepted.
- Focused backend50 pass; frontend dialog9 pass. Isolated manual-lock condition
  inversion is killed by the regression test; the product source hash stays equal.
- Full frontend1184 passed/146 files/174.39s. Typecheck passed; build208 modules
  passed. Full API1297 passed/3 existing warnings/622.48s. After the final pure
  policy separation of position versus span warnings, focused backend50 passed;
  the one added regression was not in the already-collected full-suite count.
  Final diff check passed. No tests were skipped, thresholds lowered or assertion
  suppressions added. Browser acceptance is separately pending as described below.

Browser verification was attempted in the disposable full WorkspaceShell and
isolated API harness, but subsequent CUA calls report **Local browser use is
disabled in Work settings**. No successful final browser/audio/visual acceptance
is claimed; DOM interaction tests and real file/API/media evidence are separate.
UI polish and actual-device audition remain an acceptance gap.

Phase03 stays60%, Phase06 open. No portable release or STT default change. Stop79.
