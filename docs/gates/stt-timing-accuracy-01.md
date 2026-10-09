# STT-TIMING-ACCURACY-01 — isolated timing screen and independent anchors

Date: 2026-10-10. The bounded profiling/tooling slice is complete. Acoustic
word timing acceptance remains open; no production timing default was changed.
Aggregate evidence: [stt-timing-accuracy-01.json](stt-timing-accuracy-01.json).

## Frozen inputs and comparison

Three byte-preserving mono PCM16/24 kHz crops are retained privately under
`.scratch/stt-timing-accuracy-01/run-1/crops`: OBS9 source seconds 236–272,
curated speech-2 seconds 55–66 (the 60s block boundary), and 75–82 (the earlier
zero-PCM placement case). Durations are 36, 11 and 7 seconds. No source rewrite
or resampling occurred. The 23 previously audited read-only sources, both
current source PCMs and all three crops still match their hashes at closure.

Large-v3 recognition ran in an isolated Studio Python process on CPU/int8 with
four threads, Vietnamese, beam 5, word timestamps, VAD and the current phrase
refiner. A temporary process-local wrapper captured words immediately before
and after the production refiner in the **same** recognition pass. The owner’s
services and GPU were not used. CPU/int8 and these short crop contexts differ
from earlier full-footage GPU decoding; this is a local comparison of timing
methods, not an exact replay of the owner’s stored recognition.

WhisperX 3.8.6 then aligned each crop’s exact full recognized transcript in a
separate CPU process, using the cached Vietnamese 250h model. Revision:
`69e9000591623e5a4fc2f502407860bcdc0de0b2`; weights SHA256:
`2529ffc057c90b3d576ea109999ea49f3bab9691f7a93297a91d69ce8c981f84`.
No model was downloaded. See the [official model card](https://huggingface.co/nguyenvulebinh/wav2vec2-base-vietnamese-250h)
and [WhisperX implementation](https://github.com/m-bain/whisperX).

Current protocol SHA256:
`20eea692954ba4ee2947d70ae74f7742cc8563ac0764d3afb60b790800784c7c`.
Private files retain model/version/settings, PCM provenance, native/edge/raw
candidate words, separate failures, and protocol-bound review templates.

## Actual results

| Crop | Native / edge words | Candidate timed words | Safe native-ID mapping | Confidence >0.3 | CPU align time |
|---|---:|---:|---:|---:|---:|
| OBS9 236–272 | 104 / 104 | 104 / 104 | 104 / 104 | 97 / 104 = 93.27% | 4.319s |
| speech-2 55–66 | 24 / 24 | 25 / 25 | 0 / 24 | 25 / 25 = 100% | 0.882s |
| speech-2 75–82 | 20 / 20 | 21 / 21 | 0 / 20 | 19 / 21 = 90.48% | 0.604s |

The latter two full transcripts contain one leading word missing from their
native *timed-word* lists. Alignment retains those words. Token count/sequence
therefore differs; the comparison deliberately leaves candidate IDs unassigned
rather than shifting the following word IDs. Raw candidate coverage is 150/150,
but safe comparison coverage is 104/148 = 70.27%. This does not mean the
aligner omitted 44 words; it means identity pairing is not established for those
cases. Full text and timed-word text are retained separately for diagnosis.

All retained raw native/edge/candidate intervals in this screen are positive,
in-crop and nonoverlapping; none is shorter than 25ms. The earlier long-context
zero-PCM interval remains unresolved. Re-decoding a shorter CPU crop cannot
demonstrate that the earlier error was fixed.

Recognition wall times were 52.101s, 25.404s and 28.445s. Recognition RSS is
**unavailable**: the initial Windows memory sampler failed. Its ctypes signature
was repaired for alignment, whose measured peak working sets were approximately
2.90–2.94 GB. Alignment model loading took 8.236s; model-load RSS was about
695 MB. Sampling is process working set, not an isolated model allocation.

The inherited phrase-onset recipe (first word midpoint inside each retained
Silero span) gives pooled proxy means of 200.57ms native, 174.67ms edge and
142.53ms candidate. Coverage differs (14/16, 15/16 and 15/16 spans), openers can
differ and crop-edge spans are clipped. These are descriptive **VAD proxies**,
not paired independent acoustic word errors. Even the candidate proxy mean
exceeds the unchanged 80ms R5 budget; no timing winner is selected from it.

## Human timing gate

Existing budgets remain: mapped alignment coverage ≥98%, >0.3 confidence for
≥95% of words, phrase-onset proxy mean ≤80ms, and independently reviewed word
IN and OUT p95 ≤250ms. The scorer checks IN and OUT separately using nearest-rank
percentiles. Missing/unmatched words, corrected labels, unspoken words and
incomplete reviews cannot disappear to create a pass.

There are **zero independent word anchors**. All three human timing results
remain `null` (unmeasured), not zero error or a pass. The candidate also fails
confidence and safe identity coverage; no production integration is accepted.
The owner’s supplied reference passage supports lexical scoring from the
preceding round but supplies no acoustic IN/OUT boundaries.

The self-contained `review-anchors.html` worksheet contains exact crop audio,
waveform, slow playback, source-clock IN/OUT controls and 24 frozen target words
(eight spread through each native word sequence). Every native word under 25ms
or wholly in exact-zero PCM would additionally be included; these new crops
have none. Model timestamps and VAD edges are absent from its review payload.
Labels and context are explicitly ASR hypotheses. The listener can correct a
label, mark “not spoken”, or leave a clipped/unclear boundary uncertain.

Open that private HTML in a browser, listen independently, set IN/OUT and save
`reviewed-anchors.json`. A partial review can be saved but cannot satisfy the
full timing gate. Send the JSON to continue this same round’s acoustic review.
The 24 targets do not establish accuracy for every project or speaker.

## Evidence corrections and reproducibility limits

- Attempt 1 loaded the model but all cases failed when path security denied a
  default NLTK tokenizer path outside the repository. Its failure outputs remain
  in `align-attempt-1-*`. No denied path was read or guard bypassed. Attempt 2
  selected existing repository tokenizer data through normal `NLTK_DATA`; its
  four resource hashes and the amendment are retained.
- Protocol metadata was amended between attempts, including source-to-crop
  indexing and that tokenizer setting. Original protocol bytes were not retained;
  its digest survives. Do not call both attempts one immutable protocol. Attempt 2
  has its own retained pre-run configuration. Both worksheet versions survive;
  verification confirmed identical target IDs/labels/order and audio/clock data.
  Rebinding happened before any human review and before sharing the current
  worksheet. `worksheet-rebind.json` records this limitation.
- Review found a second source offset in the *derived* `expectedNativeWords`
  fields. All 208 affected endpoints were copied from the unchanged raw global
  candidate words, without inference. `aligned-before-derived-clock-repair.json`
  preserves the faulty version and `derived-clock-repair.json` records hashes.
  The scorer reads raw words, so this correction changes no scored raw interval.
- The final runner refuses recognition/alignment evidence overwrite (including
  interrupted runs), allows a fresh owned `--output` directory and has no protocol
  mutation phase. Fresh preflight also freezes recognizer weight/code hashes and
  verifies them before inference; this strengthening is not retroactive evidence
  that those extra hashes were frozen for the retained first run. Failed runs
  must be retained and a new run prepared.

## Validation and exact next work

Measurement/tooling commit: `08918b7`. Focused profiler/scorer/packet checks:
23 passed in 0.38s. Full API: 741 passed with two existing warnings in 205.85s. Python compilation, JS syntax checking, empty
review scoring, evidence replay rejection and Git whitespace checks pass.
An attempted UTF-8 diagnostic printed through a legacy console encoding and
failed before artifact writes; rerun with `PYTHONUTF8=1` completed the correction.

Frontend product files are unchanged. The earlier 701 tests / 77 files plus
typecheck/build are carried evidence, not rerun here. Native browser/audio
worksheet acceptance remains unverified; the earlier automatic browser approval
rejection was respected, with no browser automation workaround.

Exact next: **STT-TIMING-ACCURACY-01 independent anchor review**. Import and
validate the listener’s matching JSON, score paired IN/OUT errors and missing
words, then decide a bounded correction from measured errors. Resolve native
untimed leading-word identity before accepting an alignment replacement. Phase
03 remains 60%; broader acoustic/speaker and native Script/Timeline acceptance
remain open.
