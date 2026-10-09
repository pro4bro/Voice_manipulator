# STT-GAP-02 — retained gap review and common-context screen

Date: 2026-10-10. Scope complete: one bounded measurement round; no product
algorithm change. Aggregate evidence: `stt-gap-02-context-screen.json`.
Phase03 remains60%; acoustic word-boundary acceptance remains open.

## Protocol and artifacts

`scripts/profiling/stt_gap_02_screen.py` freezes its inputs/protocol before
inference and retains real request PCM, responses, raw merged output and
artifact handoffs. It reuses the existing loopback Studio serially with cached
large-v3, Vietnamese, Faster-Whisper native DTW + Silero phrase-edge timing.
No model download, upstream edit, service restart or browser automation.

The existing independently curated reference corpus supplies16 speech clips
from one speaker, arranged into two116.454s tracks. All16 original SHA-256s and
their byte-exact placement in each derived PCM track were checked. Both60s
boundaries cut inside utterances; deliberate1.5s gaps and leading/trailing quiet
PCM allow placement checks. A separate125s exact-zero PCM file is also tested.
This is a small common-import screen, not fresh physical OBS capture or a
representative multi-speaker benchmark.

One whole-file request versus the current60s owned intervals +2s context uses
the same model, decoder and PCM. Baseline3 requests, bounded7: **10 real model
requests total**. All10 retained request WAV hashes match; their PCM is
byte-identical to the corresponding source interval. Output is private under
`.scratch/stt-gap-02/run-1/`. The command is:

```powershell
.venv/Scripts/python.exe scripts/profiling/stt_gap_02_screen.py --output .scratch/stt-gap-02/run-1
```

The output must be fresh. Retained results can be audited without inference:

```powershell
.venv/Scripts/python.exe scripts/profiling/stt_gap_02_screen.py --output .scratch/stt-gap-02/run-1 --analyze-existing
```

## Reference text scores

NFC/casefold scoring preserves diacritics and numerals. CER counts characters
without spaces; WER counts Vietnamese whitespace syllables. Micro averages:

| Common Studio policy | CER | WER | Character edits / reference | Syllable edits / reference |
| --- | ---: | ---: | ---: | ---: |
| Whole-file request | 11.2831% | 13.6364% | 226 / 2003 | 84 / 616 |
| 60s owned +2s context | **7.8382%** | **9.5779%** | 157 / 2003 | 59 / 616 |

The inherited detailed text screen is <=10% CER and <=20% WER. Whole-file CER
fails; bounded text passes on these samples. Pure125s silence produces **zero
text and zero words in both modes**. No acoustic timing or speed acceptance is
inferred from that lexical result; elapsed times are retained without a causal
performance claim.

The audit restores the real response's timing provenance before calling the
product `_attach_timing_quality` and `_write_and_read_stt_artifacts`. All four
speech handoffs are `partial`, so independent transcript text is retained;
canonical SRT round-trip changes neither word counts nor scored text. These
scores therefore also hold at the artifact handoff. No owner project library
was written. An exploratory call without response provenance yielded
`unverified`; it is not used as final evidence.

## Timing structure versus acoustic correctness

- Bounded raw merge has one overlap at60s in speech2. Existing publication
  spacing resolves it; all four final speech handoffs have positive intervals,
  monotonic starts and **zero overlaps**. No words disappear at finalization.
- Final untrusted words: baseline2/271 +1/368; bounded1/262 +1/350. All are
  below the existing25ms minimum. No threshold is relaxed.
- Whole-file output places3 word intervals wholly inside deliberately inserted
  zero PCM; bounded output places **one** there, in speech2 at77.940–78.330s
  after finalization. The entire interval is exact zero PCM. This proves an
  acoustic placement discrepancy, **not** whether the lexical word itself is
  spurious or belongs in neighboring speech. Do not delete it automatically.
- A seven-second source review clip,75–82s, is retained at
  `timing-review-speech-2-245.wav`. Original utterance extents/VAD/ASR intervals
  are not independently reviewed word anchors. The <=250ms word-IN/OUT p95
  budget is still **unmeasured**.

## OBS9 retained words and owner reference

The two STT-GAP-01 production-copy routes each retain1,177 words from1,245 raw
timed records. All1,177 owner-window raw records map one-to-one to final words;
none is missing or ambiguous. The68 other records are50 duplicate padding
copies and18 padding-only conflicts. All77 words overlapping the reported gap
are preserved;76 starts lie inside it, one word crosses its left boundary.

The independent retained audit now measures actual deltas: all starts unchanged
after rounding float noise to1 microsecond; ends shorten by at most20ms.
1,118 shorten10ms, five8ms, four4ms, three20ms,47 unchanged. Matching is not just
an80ms-tolerance assertion: all1,177 match within20ms. This proves retained merge
provenance, not acoustic boundary accuracy. Private audit:
`.scratch/stt-gap-02/retained-audit/README.md` and `retained-audit.json`.

The owner supplied independently heard/reference text during this round. It
includes context before/after the77-word gap. The same **101-word textual
passage**, from “Lên kế hoạch” through “4 trên20”, is compared with candidate
records759–859 inclusive (zero-based); the endpoints236.380–271.180s are ASR
estimates, not owner-reviewed acoustic anchors. Post hoc owner comparison:
**CER30/310 =9.6774%, WER13/101 =12.8713%**. This is a wider passage comparison,
not a frozen77-word-only gate or a p95 timing measurement. The exact owner text,
hypothesis and scope are retained privately in `owner-reference-score.json`.
Owner text includes lexical corrections; it is not substituted into the project.

The35s review clip03:57–04:32 and candidate word table are retained in
`OBS9-REVIEW.md`; the expanded passage's first word begins before that clip.
The review packet now retains the owner answer and explicitly separates this
lexical review from still-unreviewed word IN/OUT.

## Validation and preservation

- Focused API media-import/timing/scoring tests: **34 passed in5.60s**.
- Separate initial scoring check:11 passed in0.06s (included in the34).
- Profiler compilation and diff check pass; retained reanalysis passes.
- All23 frozen read-only source hashes match after inference and reanalysis,
  including original curated clips, OBS analysis/original words, recovered-copy
  words and owner manifest. The retained STT-GAP-01 before/after manifests also
  agree for1,325 files; this round does not claim a fresh whole-tree1,325 audit.
- No owner audio, transcript, model or persistent project data changed.
- Full API718/two existing warnings is carried from STT-GAP-01; frontend701/77,
  typecheck/build is carried from USER-FEEDBACK-16. These are not new full runs.

## Exact next round

**STT-TIMING-ACCURACY-01**: obtain independent acoustic IN/OUT anchors for the
retained OBS passage and boundary/zero-PCM candidates, then measure the frozen
<=250ms p95 budget and evaluate a bounded alignment correction. A positive,
nonoverlapping timestamp is insufficient when it points into silence. Retain
the60s policy supported by this lexical screen; broader speaker coverage and
native Script/Timeline audio acceptance remain separate open gates.
