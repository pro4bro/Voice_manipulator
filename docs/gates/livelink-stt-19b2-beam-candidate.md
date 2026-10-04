# LIVELINK-STT-19B2 — reject wider live beam search

2026-10-04, starting checkout `92c2e89`. One candidate changes medium's live
decoder beam from 1 to 5. A private Studio loads current product source and
executes the same `_live_words` function with only `beam_size` changed. Models,
language, 19A frozen corpus, real 250 ms cadence, four-second audio windows,
silence and local agreement are unchanged. Actual cached CUDA/float16 model;
no recognizer stub, model download or production configuration edit.

| Micro-average | Warm medium / beam 1 | Medium / beam 5 | Frozen target |
| --- | --- | --- | --- |
| CER | 22.97% | 22.17% | <=15% |
| Whitespace-syllable WER | 26.62% | 25.97% | <=30% |

444/2,003 character edits and 160/616 syllable edits. The candidate still fails
CER and is **rejected**. Production retains medium / beam 1. Original audio
hashes match. Companion JSON records elapsed cadence/drain time and errors;
total elapsed is not a live-final percentile. Timing anchors, silence/seam and
physical clocks are still unmeasured, with no inferred words used as truth.

Raw runner, private Studio seam, source-time manifest and real outputs remain
in ignored `.scratch/livelink-stt-19b2/`. Owned Studio closes/releases port 18091.
No product/test source changed: unchanged full validation from 19A is backend
547, frontend 473, typecheck/build; 19B focused scorer/live suite is 24 passed.
Do not rerun identical suites to manufacture an accuracy pass.

Recognition acceptance remains open. A future context/segmentation diagnosis
needs its own scope and frozen comparisons; neither attempted recognizer
candidate justifies lowering the target. Exact next independent queued round
is **MEDIA-STAGES-02**, which has no dependency on recognition acceptance.
