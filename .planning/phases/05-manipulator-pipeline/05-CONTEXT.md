# Phase 05: Manipulator Pipeline - Context

Phase 05 is the renumbered former Manipulator Pipeline. It builds real, composable audio outcomes only after the shared dock/runtime seam is stable.

`WorkflowCoordinator` owns typed input/output assets, jobs, validation, provenance, cancellation, and next-step eligibility. It invokes only engine adapters: ASR, diarization/emotion, translation, source separation, voice generation/conversion, and final mix. Engine packages, cache paths, and model IDs come from a machine-local runtime/model registry, never a UI module or portable project manifest.

Every pipeline request requires an explicit source asset, transcript/cue selection, voice profile, language/locale, duration policy, review state, and output artifact contract. Actual output returns to Media Pool with project-relative files and source/model/settings lineage.

| Component | Contract |
| --- | --- |
| WorkflowCoordinator | Validates prerequisite assets and exposes stable job states |
| Engine adapters | Isolate upstream/community engines and report precise capability/error states |
| Asset lineage service | Preserves derived-artifact ancestry and approval status |
| Timeline / review modules | Present real project-owned outputs, never external temporary paths |
