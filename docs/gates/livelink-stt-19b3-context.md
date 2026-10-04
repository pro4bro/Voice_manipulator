# LIVELINK-STT-19B3 — live segmentation context candidate

Date: 2026-10-05. Read-only baseline source: persisted `LIVELINK-STT-19A` warm
run-2. Candidate output: ignored `.scratch/livelink-stt-19b3/run-1/`.
Metrics: `docs/gates/livelink-stt-19b3-context-metrics.json`.

## Diagnosis

The persisted warm 19A live event history has 29 `final` transcript spans across
16 curated source utterances, 55 `partial` revisions, and no event-level request
errors. Nine of the 16 source turns map to multiple final spans (13 extra spans
above one per turn). Original copied utterance WAVs show internal quiet bins up
to 1.0 second; the runner inserts 1.5 seconds between source turns. The persisted
19A event history does not include recognizer HTTP-call rows for live requests,
so the 84 partial-plus-final calls are inferred from events, not a request log.

The baseline joined output is 22.97% CER / 26.62% WER against the frozen
reference; 460 character edits and 164 syllable edits. Several turns already
have one final span, and recognition errors also remain inside those turns. Thus
fragmentation is present, but the event evidence does not attribute the whole
quality failure to stitching. No recognizer exception was reported in the warm
run.

## One frozen candidate

Before inference, the runner recorded one private adapter candidate:
`silence_seconds=1.1` versus the production default 0.5. The 4-second window,
medium model, Vietnamese language, 250 ms PCM cadence, frozen 19A corpus and
scoring stayed fixed. This threshold is above the observed <=1.0 second internal
quiet bins and below the 1.5 second inserted inter-turn gap. It was passed only
to a new `ObsLiveLinkTranscription` instance in the profiling process. No product
source, Studio server, engine or original media was edited.

Owner-running Studio `127.0.0.1:18081` returned `/api/health` status `ok` and
CUDA/float16 status before inference. The cached medium model was present locally
and loaded by the existing service; no isolated Studio was launched or restarted.
Inference was serialized through the Studio. After the run, status listed tiny
and medium as loaded, with no model error.

| Measure | Warm 19A baseline | 19B3 candidate | Frozen budget |
| --- | ---: | ---: | ---: |
| Live CER | 22.97% (460/2,003) | 27.26% (546/2,003) | <=15% |
| Live whitespace-syllable WER | 26.62% (164/616) | 31.33% (193/616) | <=30% |
| Final spans | 29 | 16 | Diagnostic only |
| Final event lag p95 | 14.344 s | 18.641 s | <=8 s when measured at real cadence |
| Event-level request errors | 0 | 0 | 0 |
| Paced replay elapsed | 19A run-2 result | 116.578 s for 116.454 s audio | Diagnostic only |

Candidate final spans map one-to-one to the 16 curated turns, removing all 13
extra baseline spans. Despite that, character edits rose by 86 (+18.7%) and
syllable edits by 29 (+17.7%). Candidate CER and WER both fail their frozen
budgets, and its final-event lag proxy is 4.297 seconds worse. The lag values are
from a paced synthetic adapter replay; they are not physical OBS capture-to-UI
latency measurements.

## Disposition and evidence boundary

Reject the 1.1-second threshold candidate. It repairs the observed one-turn
fragmentation pattern but harms text accuracy and lag. Do not integrate or
change the frozen budgets. The next recognition work needs a separately scoped
diagnosis of model hypotheses/context before another candidate; do not label the
remaining CER failure a stitching-only defect. This gate does not complete
19A: reviewed word anchors, silence/seam truth, physical capture clocks, row and
overlap review, and owner acceptance remain open.

Reproduce the bounded comparison with an empty output directory, a healthy local
Studio that already has the medium model cached, and no concurrent GPU workload:

```powershell
.venv/Scripts/python.exe scripts/profiling/livelink_stt_19b_context.py `
  --studio http://127.0.0.1:18081 `
  --output .scratch/livelink-stt-19b3/replay-new
```

The script first writes the baseline diagnosis and frozen candidate record, then
runs one real 250 ms adapter replay. Candidate transcript text and project
artifacts remain in ignored scratch; the committed companion JSON contains
aggregate metrics and source hashes only.
