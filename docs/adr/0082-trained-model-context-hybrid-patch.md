# 0082 — Trained model plus context Hybrid Patch

Date: 2026-10-16

## Decision

Hybrid Patch uses the exact selected trained OmniVoice full/LoRA artifact and
the explicitly selected source context as its reference. Source, context and
model must share one Speaker Profile and the compatible OmniVoice base family.
No identity is inferred from a display name. Missing or incompatible input fails;
there is no automatic clone fallback.

The trained Voice Model record and its clean reference stay immutable. A
temporary voice value changes only reference fields while retaining trained
checkpoint/adapter paths. Job identity pins model metadata, original reference,
trained weights and contextual source/derivative/transcript hashes. Replacement
text remains separate from reference text.

Hybrid jobs, artifacts and Apply receipts have a distinct namespace. Existing
owned cancellation, immutable previews, explicit Apply and quality checks are
reused. The UI exposes clone context and trained-plus-context choices; reopening
or switching strategy does not start generation. Human A/B/C remains a review
gate; hybrid is not presumed to sound better than either other strategy.
