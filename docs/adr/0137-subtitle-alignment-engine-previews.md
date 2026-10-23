# ADR0137 — Explicit transcript alignment engines produce reversible previews

Status: accepted. Owner direction: 2026-10-22.

## Decision

Input's right column exposes MFA, stable-ts and EasyAligner in an engine selector.
Selecting an engine changes its parameter form without starting inference.
`Bắt đầu tinh chỉnh` runs the selected engine against the current transcript and
finalized analysis WAV. Its output becomes the existing Timeline Ghost Preview.
Only `Apply New Timing` writes changed intervals; Restore uses the existing
source-bound receipt. Text, audio and manually reviewed word intervals are kept.

The engines are alignment providers, not alternative transcription requests.
Product-owned workers run offline on CPU in private environments under
`.runtime/subtitle-alignment`; they cannot download models during inference.
MFA has a separate Conda environment; stable-ts and EasyAligner share a private
Python 3.11 environment with Torch/TorchAudio 2.8 CPU. The EasyAligner adapter
uses its upstream CTC primitives without the upstream interpolation fallback or
optional diarization/VAD pipelines. Unsupported tokens remain unmeasured.

Inputs bind source audio SHA256, ordered exact words, selected indexes, normalized
parameters, engine/model/runtime receipt and worker code. Workers retain original
word identities, reject ambiguous correspondence, and produce measured or null
boundaries. A missing result cannot become a successful proposal. A new source
snapshot is checked after inference and again before Apply. Removed ranges and
manual locks are enforced by the product, independently of the worker.

Unmeasured, invalid or overly distant intervals stay at their original positions.
The common movement limit also bounds optional post-processing methods against
the original interval. Measured suggestions require listening; engine scores are
not calibrated timing accuracy. Collisions include changed and unchanged words,
are shown by the existing red ghost/conflict treatment, and remain explicit when
the owner applies a reviewed preview. Optional prior offset/waveform methods
start disabled and use the selected engine's evidence, without another provider.

## Assets and licensing

All three integration libraries have MIT code licenses. Weights have independent
licenses: official Whisper MIT; Vietnamese/English MFA v3 acoustic models and
dictionaries CC-BY-4.0; selected Vietnamese/English Wav2Vec2 weights Apache-2.0.
MFA model attribution and upstream license notices must accompany redistribution.
Runtime dependencies retain their own licenses. These adapters do not select the
older experimental CC-BY-NC Vietnamese CTC model.

Setup validates official Whisper SHA256 and Hugging Face LFS SHA256/Git blob IDs
at pinned revisions. Model stat receipts keep the catalog inexpensive; dispatch
checks weight digests again. Critical package files/metadata are checked against
the successful import-probe receipt. Runtime files, source inspection checkouts,
model weights, logs and inference fixtures are ignored local artifacts, while
project jobs retain project-relative audio paths and measured provenance.

## Limits

This is a selectable alignment workflow, not evidence of a learned universal
Conviction offset rule. Small real-media smoke runs establish execution and
artifact correspondence; quality on overlapping speakers still needs comparison
with the owner's corrected word reference. stable-ts and EasyAligner crop around
the current timings, so large pre-existing displacement can lie outside a crop.
MFA's dictionary coverage and transcript normalization can reject ambiguous words.
Missing runtime/model components block Start with a reason.

## Default preference update — 2026-10-23

After the [Conviction comparison](../research/CONVICTION-ALIGNMENT-BENCHMARK-20261023.md),
the owner explicitly requested EasyAligner as the default alignment engine.
Use Vietnamese, Window 30 seconds, Padding 1 second, maximum movement 2000ms and
no extra offset/waveform methods initially. UI, API normalization and worker
fallback parameters agree. Other engines remain selectable, and missing EasyAligner
components still block Start rather than silently switching providers. This is a
preferred preview configuration; the measured conflicts and limited reference
do not justify automatic Apply or a universal accuracy claim.
