# Word-timing aligner research

Research date: 2026-10-22. Scope: official project and model sources for existing-transcript alignment. No installation, model download, or benchmark was performed.

## Practical shortlist for PRO4BRO

The requested task is **forced alignment**: supply source audio plus the corrected transcript, then estimate each token's IN/OUT. This research changes no application code, dependencies, engine defaults or product-round status. All priorities below are engineering judgments for a benchmark, not measured winners.

| Candidate | Existing transcript | Main reason to evaluate | Main gate |
|---|---|---|---|
| WhisperX | Yes, segmented text | Existing local baseline; Vietnamese model selection | Language/model fit, overlap and token mapping |
| ctc-forced-aligner / MMS | Yes | Purpose-built word/character alignment with alternate acoustic models | Weight license, normalization, Windows extension build |
| easyaligner | Yes | Reversible original-to-normalized token mapping | A suitable Vietnamese CTC model and pinned Torch stack |
| stable-ts | Yes; also refines existing timing | Independent IN/OUT refinement and silence adjustments | Archived maintenance status; real runtime compatibility |
| MFA | Yes | Vietnamese acoustic models and dictionary-based word/phone alignment | Dictionary fit and isolated Windows setup |
| Qwen3 ForcedAligner | Yes | Independent learned timestamp head for supported languages | Vietnamese absent from its documented aligner language set |

## WhisperX

The [upstream README](https://github.com/m-bain/whisperX) exposes a separate alignment stage and warns about overlapping speech, unsupported dictionary characters and language-specific models. Its [current model map](https://github.com/m-bain/whisperX/blob/main/whisperx/alignment.py) includes Vietnamese. Thus it can time corrected text without rerunning the original ASR, provided the segment text/windows and acoustic model are appropriate. The repository identifies its software license as BSD-2-Clause; weights require their own review.

Local source inspection confirms `services/api/app/workers/subtitle_alignment_worker.py` already calls `whisperx.align` on supplied words, with a separate offline CPU worker. `subtitle_alignment_audio.py` pins `nguyenvulebinh/wav2vec2-base-vietnamese-250h`; that [model card](https://huggingface.co/nguyenvulebinh/wav2vec2-base-vietnamese-250h) specifies 16kHz input, short windows and CC-BY-NC-4.0 weights. Current upstream's default `vi` checkpoint differs from this project's pin. Neither a repository upgrade nor its default checkpoint should be treated as an automatic quality improvement.

## ctc-forced-aligner

[ctc-forced-aligner](https://github.com/MahmoudAshraf97/ctc-forced-aligner) directly consumes audio/text, supports sentence/word/character granularity, CPU/CUDA and JSON output. It accepts different Hugging Face CTC models; its default is [MMS-300M-1130](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner). A multilingual claim is not a Vietnamese timing-quality test. Its acoustic model and token/romanization behavior need comparison on the same reviewed words.

The README and [LICENSE](https://github.com/MahmoudAshraf97/ctc-forced-aligner/blob/main/LICENSE) identify BSD-2-Clause code and CC-BY-NC-4.0 default weights, but [package metadata](https://github.com/MahmoudAshraf97/ctc-forced-aligner/blob/main/pyproject.toml) also labels the package CC-BY-NC. This inconsistency needs resolution at the chosen revision before redistribution. [setup.py](https://github.com/MahmoudAshraf97/ctc-forced-aligner/blob/main/setup.py) compiles a pybind11 C++ extension and includes Windows-specific flags; this is evidence of build handling, not proof of installation on our machine.

## easyaligner

[KBLab's easyaligner](https://github.com/kb-labb/easyaligner) aligns known/ASR text with supplied wav2vec2-style models. Its [normalization documentation](https://kb-labb.github.io/easyaligner/get-started/text_processing.html) explicitly preserves a mapping between normalized and original text, with a caveat about whitespace. This is relevant to punctuation, numbers and word-identity mismatches in PRO4BRO. It does not itself establish Vietnamese acoustic accuracy.

Its [dependency manifest](https://github.com/kb-labb/easyaligner/blob/main/pyproject.toml) pins torch/torchaudio below2.9. [TorchAudio's official tutorial](https://docs.pytorch.org/audio/stable/tutorials/ctc_forced_alignment_api_tutorial.html) says the demonstrated forced-alignment APIs were removed in2.9. Keep an isolated compatible runtime; a current unpinned install is not a verified integration plan.

## stable-ts

[stable-ts](https://github.com/jianfch/stable-ts) has `align` for known text, `align_words` constrained to existing segment windows, and `refine` for existing timestamps. Refinement tests token-probability changes while muting audio near boundaries; silence suppression adjusts edges using non-speech regions. These mechanisms closely match the owner's early/late boundary and inflated-span symptoms. It is an experiment candidate rather than a proven fix.

The repository is archived (May30,2026), and its README says development is indefinitely paused. It documents slower refinement with faster-whisper than with its vanilla Whisper path. API precision settings describe algorithm settings, not guaranteed boundary error. Vietnamese is present in the [compatibility language map](https://github.com/jianfch/stable-ts/blob/main/stable_whisper/whisper_compatibility.py); that is language recognition support, not a Vietnamese timing benchmark. Code is MIT, with model terms separate.

## Qwen3-ForcedAligner-0.6B

The [official Qwen3-ASR repository](https://github.com/QwenLM/Qwen3-ASR) packages two distinct capabilities: its 0.6B/1.7B **ASR models** advertise Vietnamese recognition, but the separate [Qwen3-ForcedAligner-0.6B](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B) language table lists Chinese, English, Cantonese, French, German, Italian, Japanese, Korean, Portuguese, Russian, and Spanish—**not Vietnamese**. Do not infer Vietnamese alignment support from Vietnamese ASR support.

The aligner does accept an already-known transcript independently of ASR. Its `Qwen3ForcedAligner.from_pretrained(...).align(audio=..., text=..., language=...)` API returns token spans with start/end seconds; inputs include local paths and `(numpy array, sample_rate)`. The documentation describes arbitrary-unit timestamps (including word or character output) for speech up to five minutes. This is a plausible local adapter for supported languages, but not a confirmed Vietnamese option. The project advertises superior timestamp accuracy versus end-to-end aligners, but that is a vendor claim without generalizable error numbers in this note; no accuracy result is assumed for this app's audio. The model card lists Apache-2.0 and a 1.84 GB safetensors file. Verify the model's license separately from the repository/package code; availability of weights does not mean ASR must run in the alignment call. Official [direct-align usage](https://github.com/QwenLM/Qwen3-ASR#forcedaligner-usage) and [language/limit table](https://github.com/QwenLM/Qwen3-ASR#released-models-description-and-download).

## Montreal Forced Aligner (MFA)

The [MFA repository](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner) is an MIT-licensed Kaldi-backed forced-alignment CLI. It aligns supplied speech/text using an acoustic model plus pronunciation dictionary, can export TextGrid/JSON/CSV, and has a single-file workflow. MFA 3.4 adds Hugging Face model formats bundling acoustic model, dictionaries and optional G2P; its current command is `align_one_hf`, scheduled to become `align_one` in MFA 4.0 (end-2026 plan), while legacy commands are later removed. Installation guidance centers on conda-forge; Windows setup and local app integration still need a real compatibility spike.

Unlike Qwen’s separate aligner, the [current MFA acoustic-model catalog](https://mfa-models.readthedocs.io/en/latest/acoustic/index.html) explicitly lists Vietnamese CV and MFA models, including Vietnamese MFA v3.0.0; its page lists Hanoi and Ho Chi Minh City dialect coverage. The listed Vietnamese MFA models carry **CC BY 4.0**, while the Vietnamese CV model is **CC-0**. These are model licenses, distinct from MFA software's MIT license. Current MFA docs also describe acoustic models as GMM-HMM and caution that its transcription feature is older; that warning concerns its ASR, not a comparative word-boundary score. The catalogue presence establishes availability, not accuracy on conversational/noisy/expressive project audio. MFA likely merits a small Vietnamese transcript-alignment benchmark because it has an actual Vietnamese acoustic model; dictionary/normalization fit and Windows deployability are open checks.

Sources: [MFA alignment workflow and output formats](https://montreal-forced-aligner.readthedocs.io/en/latest/user_guide/workflows/alignment.html), [MFA workflows and transcription caveat](https://montreal-forced-aligner.readthedocs.io/en/latest/user_guide/workflows/index.html), [MFA software license](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner/blob/main/LICENSE), [model catalog license and dialect entries](https://mfa-models.readthedocs.io/en/latest/acoustic/index.html).

## Commercial-license audit — 2026-10-22

The owner asked which shortlisted repositories are MIT and allow commercial use. The checked software-license layer has **three MIT repositories: MFA, stable-ts and easyaligner**. Software permission does not automatically cover separately downloaded weights, dictionaries or optional components.

| Repository | Authoritative software file | Commercial use of that code |
|---|---|---|
| Montreal Forced Aligner | [MIT LICENSE](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner/blob/main/LICENSE) | Permitted subject to its notice/license conditions |
| stable-ts | [MIT LICENSE](https://github.com/jianfch/stable-ts/blob/main/LICENSE) | Permitted subject to its notice/license conditions |
| easyaligner | [MIT LICENSE](https://github.com/kb-labb/easyaligner/blob/main/LICENSE) | Permitted subject to its notice/license conditions |
| WhisperX | [BSD-2-Clause LICENSE](https://github.com/m-bain/whisperX/blob/main/LICENSE) | Permitted subject to source/binary copyright, conditions and disclaimer notices |
| Qwen3-ASR / ForcedAligner package | [Apache-2.0 LICENSE](https://github.com/QwenLM/Qwen3-ASR/blob/main/LICENSE) | Permitted subject to applicable license/notice and modified-file requirements |
| ctc-forced-aligner | [BSD-2-Clause LICENSE](https://github.com/MahmoudAshraf97/ctc-forced-aligner/blob/main/LICENSE), but [pyproject.toml](https://github.com/MahmoudAshraf97/ctc-forced-aligner/blob/main/pyproject.toml) says CC-BY-NC4.0 | Conflicting declarations: do not classify the complete package as commercially cleared at this revision |

### Weights and dictionaries actually checked

- **MFA Vietnamese v3.0.0:** [acoustic model](https://mfa-models.readthedocs.io/en/latest/acoustic/Vietnamese/Vietnamese%20MFA%20acoustic%20model%20v3_0_0.html) and [matching dictionary](https://mfa-models.readthedocs.io/en/latest/dictionary/Vietnamese/Vietnamese%20MFA%20dictionary%20v3_0_0.html) both list **CC BY4.0**. [Creative Commons](https://creativecommons.org/licenses/by/4.0/) expressly permits commercial sharing/adaptation with attribution, a license link and an indication of changes, subject to its other conditions. This is a concrete commercial-use candidate with MIT tool code, rather than an assumption about every MFA model. The separate Vietnamese CV acoustic card says CC0; its dictionary was not audited here.
- **stable-ts with official Whisper:** OpenAI's [Whisper README](https://github.com/openai/whisper#license) expressly places both code and model weights under **MIT**. This provides an identified MIT-code/MIT-weight configuration. It does not grant permissions for arbitrary third-party Whisper fine-tunes. stable-ts's archived maintenance status remains a separate engineering concern.
- **easyaligner:** MIT applies to the library. Its selected acoustic/VAD model is an independent choice; no all-MIT Vietnamese model configuration was established in this audit.
- **WhisperX's current PRO4BRO comparator:** local `subtitle_alignment_audio.py` pins `nguyenvulebinh/wav2vec2-base-vietnamese-250h`. The author's [model card](https://huggingface.co/nguyenvulebinh/wav2vec2-base-vietnamese-250h#model-parameters-license) explicitly says parameters are for noncommercial use only, **CC BY-NC4.0**. WhisperX's BSD code does not remove that restriction. The card is consistent with the local experimental-model label; that checkpoint is not a cleared commercial-shipping configuration.
- **CTC's default MMS model:** its [model card](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner) lists **CC BY-NC4.0**. [The official NC terms](https://creativecommons.org/licenses/by-nc/4.0/) do not permit commercial use. Replacing those weights would not itself resolve the software/package metadata conflict above.
- **Qwen3-ForcedAligner-0.6B weights:** the official [model card](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B) lists **Apache-2.0**, alongside Apache-2.0 repository code. Commercial use is permitted under those terms. Vietnamese still is not listed among this aligner's supported languages; licensing does not establish language compatibility.

For a commercial Vietnamese alignment experiment, prioritize **MFA + its CC-BY Vietnamese model/dictionary**, then **stable-ts + official MIT Whisper** if maintenance/runtime constraints are acceptable. easyaligner and WhisperX remain commercially usable code frameworks when paired with separately verified compatible models. Keep default NC MMS and the currently pinned NC Vietnamese250h checkpoint out of a commercial configuration unless separately licensed. No complete transitive-dependency, distribution-package or training-data rights audit was performed, and no installed model or app setting was changed.

## Proposed evaluation and app integration

1. Freeze source PCM, corrected transcript and the owner's heard Conviction word references. Preserve original word IDs, accents, punctuation and manual locks. Evaluate overlapping and clearly spoken regions separately.
2. Use the current WhisperX/checkpoint as baseline. Compare MFA Vietnamese and CTC/MMS as different acoustic/dictionary candidates. Probe stable-ts refinement separately; try easyaligner's mapping machinery where normalization currently prevents identity matching. Qwen is conditional on a documented supported language.
3. Measure IN error, OUT error, duration error, signed offset, p95, unmatched tokens, moved-wrong words, confidence coverage and overlap conflicts on the **same** word pairs. Report coverage before filtering and accuracy within each confidence bucket. Derive offset on a calibration subset and assess it on a held-out subset.
4. Expose successful methods through the existing method checkboxes, Ghost Preview and Apply New Timing; keep per-method evidence and highlight unresolved/conflicting words. Waveform vectors corroborate acoustic edges and silence, while the learned aligner associates sounds with the transcript. Keep overlapping or mismatched words reviewable rather than manufacturing a forced fit.

Local evidence: `docs/gates/subtitle-alignment79-20261021.md` reports21/692 automatically selected corrections under its confidence/conflict policy, **not**21/692 raw aligned words. The opt-in +116ms translation improved median endpoint error in that recording while retaining spans. Neither result establishes a universal offset or a successful duration correction. This research does not rerun that experiment, claim millisecond-perfect accuracy, download models or edit existing project data. Product ledgers remain at their existing rounds87–91 status.
