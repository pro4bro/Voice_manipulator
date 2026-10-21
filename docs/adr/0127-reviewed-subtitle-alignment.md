# ADR0127 — evidence-led subtitle alignment proposals

2026-10-21. Accepted for Round79 under STT-ALIGN-01..04.

Conviction's heard reference confirms early DTW boundaries. A fixed offset is
not established for arbitrary recordings; waveform energy cannot identify all
continuous words. Ungated cached CTC improves typical errors but worsens the
OUT tail. Replacing all timing automatically would conceal this uncertainty.

Use a separate proposal/apply/restore processor. Explicit IN/OUT offsets remain
available; automatic estimates require consistent measured anchors. Speech-rate
statistics flag anomalies; waveform supports local evidence and audition. An
installed local CTC runtime can supply word identity evidence, with known model
and license limitations. No equal-duration redistribution is introduced.

Use one shared translation for short complete groups with stable, temporally
distributed acoustic anchors, retaining spans. Individual CTC span corrections
remain proposals where this consensus is absent. Rate anomalies veto span-changing
refinements. A common translation preserves
the flagged span and keeps its warning; source bounds, manual locks and conflicts
can still veto default selection. Original intervals of review rows participate in every whole-output validation pass.

The existing Timeline peak cache supplies approximately1ms PCM vectors. Detect
scale-stable amplitude corners at10/20/40ms, never pixel slopes. A high-score CTC
edge near a same-direction corner gets an extra consensus vote only inside an
already-stable group; cap the change from the unweighted estimate at30ms. Corners
are visible review evidence, not word identities. Conviction's diagnostic direct
snapping worsens25/44 supported onsets, so direct peak snapping is not applied.

The [WhisperX project](https://github.com/m-bain/whisperX) describes phoneme-based
forced alignment and limitations around overlapping speech. The pinned Vietnamese
[model card](https://huggingface.co/nguyenvulebinh/wav2vec2-base-vietnamese-250h)
specifies16kHz input, short audio windows and CC-BY-NC-4.0 weights. The product
uses offline CPU windows≤9s and exposes this local experimental model explicitly.

Store complete portable input/proposal/application snapshots. Apply and restore
compare words, text, asset state and audio fingerprints under the media lock;
manual words, labels and source media are preserved. Uncertain proposals require
explicit listening/review, with whole-output interval validation. Existing Script
Undo/Redo and subtitle export consume the resulting source-clock words.

This adds a usable review workflow without declaring the failed Round78 model
replacement accepted. Independent acoustic quality gates stay open until real
measurements meet them. See docs/SUBTITLE-ALIGNMENT-PLAN.md.

An explicit measured common-offset control only prefills the inputs. Separate
Create Proposal and Apply actions remain necessary. Conviction demonstrates640/692
structurally eligible words with a measured+116ms translation, without fitting
to the manual reference. This opt-in preview is separate from the strict local
automatic selection (21/692); spans are not claimed corrected.
