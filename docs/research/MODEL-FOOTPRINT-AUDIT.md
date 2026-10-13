# Model and Runtime Footprint Audit

Date: 2026-10-12
Scope: read-only inventory for the question “which bundled model families are optional, and what is the app size?” No files, runtimes, models, or caches were removed or changed.

## Executive result

The latest retained portable `Profile All` bundle manifest is from 2026-09-23, not a final release build. It records **126,267,432,964 bytes = 117.5957 GiB (117.60 GiB)** across 128,574 files. The product's Phase 7 release plan is still open; therefore 117.60 GiB is the measured all-profile test bundle, not a defensible final installer size.

The largest removable/on-demand model opportunity is VibeVoice: `.runtime/engines/vibevoice/VibeVoice_models` is **75.68 GiB**. It contains many separately downloaded model variants, while current product descriptors and adapters directly name only a subset. The strongest pruning candidates are unreferenced ASR-BitNet and realtime variants, and the unvalidated 7B TTS route. These should be disabled or delivered on demand only after preserving feature dependencies; this audit does not recommend deleting them from the developer checkout.

**Offline completeness caveat:** the measured bundle does **not** contain the OmniVoice base checkpoint `k2-fsa/OmniVoice`. The bundled `.cache/huggingface/hub` has only Higgs Audio tokenizer, MMS forced aligner, and Vietnamese wav2vec2 aligners; there is no `models--k2-fsa--OmniVoice` snapshot in it, and the small `engines/OmniVoice` tree is source code. The generation descriptor and voice default target `k2-fsa/OmniVoice`; the worker passes that identifier to `OmniVoice.from_pretrained()`, whose resolver calls Hugging Face `snapshot_download()` for non-local paths. So the current gate's successful bundle/startup checks do not prove offline OmniVoice generation or training. A first run needs network access or a separately provisioned base checkpoint, and a genuinely all-offline bundle will be larger than the sizes below by the checkpoint and any required assets; this audit cannot quantify that missing amount.

## Measured bundle by component

Source: `.scratch/portable-release/Pro4Bro-Portable-20260923-port03b/.portable-bundle.json`. Counts below are manifest logical bytes, which become independent bytes in a normal physical copy. “GiB” uses 1,073,741,824 bytes.

| Bundle component | Bytes | GiB | Interpretation |
|---|---:|---:|---|
| Six private Python profiles (`.runtime/python/*`) | 32,739,967,308 | 30.49 | Dependency runtimes; four contain large ML stacks. The exact total is 32,739,967,308 bytes from component rows; see note below. |
| `.runtime/engines` | 82,818,042,516 | 77.13 | 75.68 GiB VibeVoice model directory plus about 1.45 GiB engine source/tools. |
| OmniVoice Studio model tree | 5,650,249,613 | 5.26 | Whisper tiny/base/medium/large-v3, alignment and diarization assets. |
| `.cache/huggingface` | 4,363,495,689 | 4.06 | Contains Higgs Audio tokenizer, MMS aligner and Vietnamese wav2vec2 aligners; **does not contain the OmniVoice base checkpoint**. |
| `.cache/torch` | 413,063,266 | 0.38 | Torch hub/cache content. |
| FFmpeg | 263,999,488 | 0.25 | Media tool, not a model. |
| Product source, API, web build, plugin and launch files | 18,225,665 | 0.02 | Small compared with weights/runtimes. |
| **Total from manifest** | **126,267,432,964** | **117.5957** | **All-profile test bundle** |

The manifest rows for Python are: core 122,966,396; STT 8,204,342,014; OmniVoice training 7,968,139,831; VibeVoice training 8,170,056,741; RVC 8,196,067,046; voice changer 78,395,280; those six rows sum exactly **32,739,967,308 bytes = 30.49 GiB**. The runtime manifest is added separately and is negligible. The rest of the bundle is about **87.11 GiB**.

## Model inventory and likely optional families

Current on-disk sizes are grouped by model folder using file lengths (no content hashing). Paths are relative to the repo root.

| Family / folder | Size | Product evidence and disposition |
|---|---:|---|
| `VibeVoice_models/microsoft/VibeVoice-1.5B` | 5.04 GiB | Directly referenced by the VibeVoice zero-shot TTS descriptor and 1.5B fine-tuning descriptor. Keep only if that TTS workflow is part of the default install; otherwise on-demand. |
| `VibeVoice_models/Qwen/Qwen2.5-1.5B` | 2.89 GiB | Tokenizer dependency for the 1.5B TTS path. Keep with that path. |
| `VibeVoice_models/vibevoice/VibeVoice-7B` | 17.40 GiB | 7B TTS descriptor exists, but its notes say its training recipe is borrowed from 1.5B and not verified. Strong candidate for optional/on-demand delivery. |
| `VibeVoice_models/microsoft/VibeVoice-ASR` | 16.16 GiB | Used by a separate VibeVoice-ASR transcription/LoRA route. It is an alternative to the shipped faster-whisper path and returns segment-level rather than word-level timing. Candidate for optional component if that alternative is not a release requirement. |
| `VibeVoice_models/Qwen/Qwen2.5-7B` | 14.20 GiB | Explicit dependency of VibeVoice-ASR and 7B TTS. Remove only if both are disabled; shared dependency means do not count it twice. |
| `VibeVoice_models/microsoft/VibeVoice-ASR-BitNet` | 12.07 GiB | No product adapter/descriptor reference found in the scoped source search. Strongest removable or research-only candidate; confirm through a full model-catalog audit before product changes. |
| `VibeVoice_models/microsoft/VibeVoice-Realtime-0.5B` | 1.90 GiB | No direct product adapter/descriptor reference found. Research/optional candidate. |
| `VibeVoice_models/mohammed-bahumaish/vibevoice-realtime-0.5b-with-encoder` | 3.18 GiB | No direct product adapter/descriptor reference found. Research/optional candidate. |
| `VibeVoice_models/Qwen/Qwen2.5-0.5B` | 0.93 GiB | No direct product adapter/descriptor reference found. Research/optional candidate. |
| VibeVoice audio + semantic tokenizer folders | 1.92 GiB combined | Kept under the model root; no current adapter directly names them in the scoped search. Confirm runtime imports/loader requirements before treating as removable. |
| `.runtime/omnivoice-studio/models` | 5.26 GiB | Faster-whisper large-v3 (2.88), medium (1.43), tiny (0.07), base (0.14), alignment (0.72), diarization (0.03). Large-v3 and medium are explicitly required by the portable gate for Final STT and LiveLink; tiny is used for browser-share live transcript. Base and alignment can be reviewed separately, but timing/provenance gates may depend on alignment. |
| `.cache/huggingface/hub` | 3.35 GiB | Includes Vietnamese alignment checkpoints (about 0.70–0.72 GiB each), Higgs Audio tokenizer (about 0.75 GiB), and MMS forced aligner (about 1.18 GiB). Higgs tokenizer is used by OmniVoice training; Vietnamese 250h aligner has profiling/evidence references. MMS appears experimental and is a candidate to keep out of default release. |

### Defensible size scenarios from the measured bundle

These are arithmetic scenarios against the 2026-09-23 manifest, assuming the corresponding paths can be excluded cleanly. They are **not** release estimates and do not include a changed packaging/runtime architecture. They also understate a fully offline OmniVoice-capable release because the base checkpoint is absent from the measured bundle.

| Scenario | Subtracted model bytes | Result |
|---|---:|---:|
| Current all-profile test bundle | 0 | **117.60 GiB** |
| Defer VibeVoice 7B TTS weights only | 17.40 GiB | **100.19 GiB** |
| Defer 7B TTS, VibeVoice-ASR, and shared Qwen 7B | 47.76 GiB | **69.84 GiB** |
| Defer every VibeVoice model folder | 75.68 GiB | **41.92 GiB before adding the missing OmniVoice checkpoint** |

The last case removes VibeVoice TTS, VibeVoice-ASR and VibeVoice training assets, so it is only a lower-bound option for a product variant that does not promise those features. The most reasonable user-facing package design is a smaller core install plus explicit on-demand model packs, rather than silently shipping every research/checkpoint variant.

## Development-only files and duplicate bytes

- `.runtime/smoke` currently contains 4,569 files and **10,525,628,553 bytes (9.80 GiB)**. The portable bundle builder excludes it. It is test/checkpoint material, not the install size.
- `.runtime/omnivoice-studio/installer-cache` currently contains **3,461,438,174 bytes (3.22 GiB)** and is not a model payload required by the app; the bundle excludes installer caches.
- The previous storage audit (`docs/PORT-03-STORAGE-AUDIT.md`, 2026-09-23) found **22.252 GiB** of byte-identical large files across distinct identities, mostly repeated PyTorch/CUDA libraries among isolated runtimes, plus duplicate alignment snapshots. That number is historical and based on hashing; this bounded audit did not repeat hash scans. Such deduplication is safer in an immutable release layout than between mutable developer runtimes.
- Project media under `data/projects` and `.scratch` is excluded from the bundle. It is user/test data, not runtime/model overhead.

## Method and limitations

1. Read `docs/WORK-ROUNDS.md`, `docs/PROJECT-STATUS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `docs/PORT-03-STORAGE-AUDIT.md`, `docs/PORTABLE-RUNTIME.md`, and `docs/PORT-03-PORTABLE-BUNDLE.md` before inventorying.
2. Read the retained `.portable-bundle.json`; did not reassemble or copy the bundle. The manifest is a dated snapshot and its `sourceWorkingTreeDirty` field is true.
3. Grouped current folder sizes using PowerShell file lengths only; no SHA/hash scan, runtime launch, model load, quality measurement, or deletion was performed.
4. Searched the scoped API descriptors/adapters/workers for references to model folder names. “No direct reference found” is a candidate classification, not proof that upstream scripts never load the files implicitly.
5. Current bundle builder includes all of `.runtime/engines/vibevoice`; its portability gate only proves the model directory is nonempty, not that each bundled model variant is necessary. A production release should make profiles/model packs explicit and test each supported feature against the resulting manifest.



6. OmniVoice presence check was limited to manifest-included cache/model/source trees. The bundle includes `.cache/huggingface`, `.runtime/omnivoice-studio/models`, `.runtime/engines`, and `engines/OmniVoice`; enumerated Hugging Face model folders contain no OmniVoice snapshot, and the source checkout contains no `.safetensors`, `.bin`, or `.pt` checkpoint.
