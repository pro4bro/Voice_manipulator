# Round78 — Conviction owner-reviewed word timing

2026-10-21. STT-TIMING-ACCURACY-01 now has the owner's heard reference.
This round measures a candidate; production timing and owner media are unchanged.

## Reference and reproducibility

The owner confirmed reviewing timing and duration across Conviction by listening
and waveform inspection, estimated the boundaries at about 80%, added missed
words, and intentionally omitted some words in overlapping speech. That estimate
does not define an 80ms tolerance or a model accuracy score. Word locations have
stronger evidence than exact acoustic edges. This is an approximate reference
from one conversation, not exhaustive lexical ground truth or a blind review.

Private immutable snapshots: `.scratch/stt-conviction78/run-1` and `run-2`.
The current Script has 697 words: 680 trusted `manual`, six `user-interpolated`,
six `user-text-preserved`, and five original DTW words. Only the 680 manual words
qualify as acoustic references. The 17 others remain reported, without promotion.
The archived STT artifact has 665 words, model large-v3, language vi.

`inputs.json` binds the Script, original STT JSON, MP3, and analysis WAV by SHA256.
The WAV is mono PCM16, 24kHz, 5,663,744 frames, 235.989333s. A fresh FFmpeg MP3
decode has exactly the same PCM bytes/hash as the WAV:
`fb44d9774f671232f9a14f44027f80864cbf4f08022e02043a5b894a811848a8`.
Peak is 29,574/32,768 with zero clipped samples. This rules out source/WAV clock
or encoder-delay differences for this comparison. Decoding for both engines
uses 16kHz without changing the source clock. No processed media is published.

`stt_reviewed_timing.py` uses edit distance on normalized Vietnamese tokens.
A pair must have the same partner in **every** optimal lexical alignment;
insertions, substitutions and ambiguous repetitions remain unmatched. Timing
never chooses a partner or removes a distant outlier. Of 680 manual references,
581 have a unique original-token partner (85.44%); all 99 unmatched manual indices
remain in `scores.json`. The lexical omissions cannot be interpreted as WER,
because overlapping speech was intentionally left out of the reference.

## Paired archived comparison

Every row below uses exactly the same 581 manual words. Values are milliseconds.
Signed errors use candidate minus reference; negative means early.

| Variant | IN mean abs | IN median abs | IN p95 abs | OUT mean abs | OUT median abs | OUT p95 abs | Duration mean abs |
|---|---:|---:|---:|---:|---:|---:|---:|
| Archived STT | 241.9 | 161.9 | 687.5 | 136.1 | 103.8 | 384.9 | 154.6 |
| Current phrase refiner reapplied to archive | 239.2 | 160.1 | 687.5 | 136.4 | 103.8 | 384.9 | 158.1 |
| Experimental 250h CTC | 88.1 | 18.3 | 407.7 | 95.9 | 24.8 | 495.5 | 74.0 |

Archived signed IN median is -160.4ms; signed OUT median is -101.0ms.
Its OUT is only 53.1ms median absolute distance from the reviewed **IN**,
supporting the reported end-near-onset symptom. IN signed medians across four
successive minute regions are -162.5, -154.5, -183.9 and -131.0ms; individual
errors vary much more. These data do not justify applying one fixed offset.

Reapplying today's edge refiner barely changes the archive. This is not a fresh
recognition or recovery of raw 2026-08 DTW: the archived artifact already includes
an older boundary refinement. It cannot establish the internal cause of DTW's
early alignment. The current decoder replay is recorded separately below.

The CTC run uses cached
`nguyenvulebinh/wav2vec2-base-vietnamese-250h`, snapshot
`69e9000591623e5a4fc2f502407860bcdc0de0b2`, WhisperX, CPU/four threads, offline.
`started.json` retains model/resource/code hashes and package versions.
54 phrase windows use only original STT segment groups plus 650ms audio context;
neither reviewed text nor reviewed timing enters inference. Native words map to
aligned words lexically within each phrase. Unalignable tokens are not filled:
`interpolate_method="ignore"`. Raw groups, outputs and mappings remain retained.
Five phrase windows exceed the model card's recommended <10s input, with maximum
12.84s. This is another candidate limitation to resolve with shorter, consistent
windows before judging the model's best achievable tail accuracy.

All 665 original words receive positive in-source intervals; 632/665 (95.04%)
have score >0.3. Model loading takes 6.62s; load plus alignment takes 30.44s,
peak sampled process working set 2,133,168,128 bytes (about 1.99GiB), sampler OK.
Import/startup overhead is additional. 528/581 paired words have both endpoints
within 250ms versus archived 377/581. This is reference agreement, not an
absolute accuracy percentage.

**Candidate fails acceptance.** It has 41 overlapping interval pairs and three
intervals under 25ms. OUT p95 worsens from 384.9 to 495.5ms; maximum IN error is
2,156.9ms. Fifteen paired words exceed 500ms error despite confidence >0.7.
The unchanged independent-IN/OUT p95 budget of 250ms is not met. High confidence
alone cannot safely select replacements. No complete manual speaker-overlap
annotation exists, so these failures cannot all be attributed to crosstalk.

Run-1 completed inference but failed writing raw numpy int64 diagnostics. Its
partial artifact and traceback are retained. The serializer now handles numeric
scalars; run-2 uses new immutable files. Source snapshots matching recorded hashes
are retained. No faulty artifact was overwritten or counted as a success.

## Current pipeline replay

`.scratch/stt-conviction78/current` retains the actual product 60s/2s chunk
plan, four CPU/int8 large-v3/vi Studio `_transcribe` responses, captured DTW words
immediately before refinement, product chunk merge and SRT/quality round trip.
There are 692 current words, two structurally untrusted; 587 unique manual pairs.
This is a new CPU/int8 decode, not an exact replay of archived GPU recognition.
The four recognition calls total278.98s and peak3,891,896,320 sampled working-set
bytes; all memory samplers succeed. Each chunk retains exact PCM hash/range and
raw/refined words. There is no request to the owner's live service or GPU.
The offline recognizer snapshot is`edaa852ec7e145841d8ffdb056a99866b5f0a478`;
`native-model-at-closure.json` retains five model/resource hashes. Those native
hashes were captured after replay, rather than frozen before inference. CTC's
model/resource hashes were captured before its inference as recorded above.

For comparison across archive, current and candidate, a further intersection
retains565 identical reference words. No variant can select its own easy subset:

| Variant, same565 anchors | IN median abs | IN mean abs | IN p95 abs | OUT median abs | OUT mean abs | OUT p95 abs |
|---|---:|---:|---:|---:|---:|---:|
| Current raw DTW before refinement | 160.3 | 254.9 | 722.2 | 99.4 | 137.9 | 394.9 |
| Current refiner | 159.8 | 253.1 | 722.2 | 99.7 | 138.6 | 394.9 |
| Current canonical Script | 159.8 | 253.1 | 722.2 | 109.5 | 147.3 | 404.9 |
| CTC on archived transcript | 18.2 | 86.0 | 407.7 | 24.5 | 93.2 | 452.7 |

Across all587 current pairs, raw DTW signed IN/OUT medians are-159.8/-100.8ms;
canonical medians are-159.4/-109.5ms. The early-boundary symptom is already
present before phrase refinement and SRT. SRT changes no current start value;
the existing10ms word-gap policy explains the smaller additional OUT shift.
There is one raw/refined overlapping pair, none after structural spacing, with
the two affected words still untrusted. That guard fixes structure rather than
acoustic placement. No frontend displacement or audio-clock mismatch is needed
to reproduce the symptom. This identifies the pipeline stage, not a new theory
about the recognizer's internal training/attention mechanism.

CTC used the archived transcript/windows, not the fresh transcript. It improves
the same565 words' typical boundaries, but OUT tail still worsens versus current
404.9→452.7ms. Corrected-text and fresh-text CTC arms remain distinct future work.
The reference was edited while hearing/seeing existing STT; it is not blind or
a held-out evaluation. No production offset or threshold is fitted to this file.

Reproduction (fresh copied snapshot/output required; existing evidence refuses
overwrite): Studio Python runs `scripts/profiling/stt_conviction_timing_probe.py
<snapshot>` and `scripts/profiling/stt_conviction_current_probe.py <snapshot>
<output>`; API Python runs the latter with `--score`. Export the output's
`chunks.json` from product `_stt_chunks(duration)` first. Each phase records its
runner hash; recognition and scoring source revisions are retained separately.

## Decision and next bounded improvement

1. Keep the recognizer for text and test a separate acoustic alignment stage.
   The candidate substantially improves typical boundaries/duration on this
   reference, but a blanket replacement is rejected by measured tail/overlap errors.
2. A next proposal must enforce whole-output interval consistency, retain raw
   provenance, report alignment disagreements and preserve manually locked words.
   Evaluate corrected-transcript alignment as a separate arm: added/incorrect
   words can displace neighbours. Do not feed manual boundaries into candidate
   windows and then present that result as independent STT accuracy.
3. Use speaker/overlap review for ambiguous mixed speech; waveform energy alone
   cannot identify which speaker or missing word it belongs to. Keep a review
   state rather than inventing precise word spans. Obtain a second held-out
   conversation before selecting production thresholds or a replacement engine.
4. Existing acoustic/coverage gates remain unchanged. The 250h weights are an
   experimental comparator; their noncommercial license requires a separately
   suitable model/permission before commercial product integration.

Primary sources: [Faster-Whisper timing implementation](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py)
documents cross-attention/DTW;
[WhisperX limitations](https://github.com/m-bain/whisperX#limitations-)
documents overlapping speech and dictionary limitations;
[250h model card](https://huggingface.co/nguyenvulebinh/wav2vec2-base-vietnamese-250h)
documents 16kHz input and CC-BY-NC-4.0 weights. No download or production preset
change was made.

## Verification

New scorer tests initially fail because the module is absent; the implemented
scorer passes 13 tests. With serialization/immutable-output/path/input guards,
final focused scorer/probe regressions pass35 tests in0.52s. Full API:1245
passed/three existing warnings in641.34s. It collected the initial13 new tests;
three later guard tests are included in the final focused35, not retroactively
counted in the full run. Python compilation and final Git whitespace checks pass.
Frontend: 1,175 passed / 145 files / 175.56s; typecheck/build pass (205 modules).
No frontend product code changed. `closure-checks.json` verifies all original and
frozen input hashes, all four current chunks' exact source PCM and all retained
inference/scoring runner snapshots against their recorded hashes. All pass.
Phase03 remains60%; this measurement does not close the broader acoustic gate,
change project formats or issue a portable release. Stop after round78.
