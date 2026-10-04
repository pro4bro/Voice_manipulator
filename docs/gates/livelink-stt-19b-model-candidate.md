# LIVELINK-STT-19B — reject larger live model candidate

2026-10-04. Starting checkout `6d4d67b`, clean. The owner explicitly requested
sequential rounds in this session; each candidate is verified and committed
before the next bounded round. No product setting is changed here.

The single candidate replaces LiveLink's medium recognizer with cached large-v3.
The 19A two-track corpus, Vietnamese language, 250 ms cadence, four-second
recognition window, silence detector, agreement and stitching remain unchanged.
The recognizer is real Studio HTTP/CUDA/float16, prewarmed with the same control
clip as 19A. No stubs, downloads, source media edits or word-time guesses.

| Micro-average | Warm medium baseline | Large-v3 candidate | Frozen target |
| --- | --- | --- | --- |
| CER | 22.97% | 20.87% | <=15% |
| Whitespace-syllable WER | 26.62% | 22.56% | <=30% |

Candidate character edits: 418/2,003; syllable edits: 139/616. Track 1 CER is
11.71%, Track 2 27.44%; the aggregate still fails. Neither an improved average
nor one passing track is sufficient. **Candidate rejected; medium remains the
product default.** Larger-model recognition does not solve the demonstrated
failure and must not be shipped merely because its aggregate improved.

Raw candidate project, outputs and runner are in ignored
`.scratch/livelink-stt-19b/`. Committed metrics are the companion JSON. Source
hashes were checked again. Parent 19A's reviewed timing, silence/seam, physical
clocks and row/overlap gaps remain open. No latency gate is claimed from total
run time. Full suites/typecheck/build evidence from unchanged product checkout
is 19A: backend 547, frontend 473. Focused scoring/live adapter regressions were
rerun this round. Owned Studio exits and releases its port.

Exact next bounded round: **LIVELINK-STT-19B2**, measure medium beam search 5
instead of 1 against the same frozen corpus. This changes decoder search only,
not the model, audio window or stitching. Preserve the original CER target and
reject a candidate that fails it. Other independent queue entries remain open.

Focused validation: 24 passed, two existing warnings, 8.33 seconds. Candidate elapsed 159.516 seconds, zero request errors.
