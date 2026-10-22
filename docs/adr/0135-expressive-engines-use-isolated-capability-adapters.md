# ADR0135 — Isolate expressive engines and describe each supported operation

Status: accepted. Owner direction: 2026-10-22.

## Decision

Add OmniVoice, F5-TTS/ViVoice, IndexTTS-2.5 and Fish S2 Pro to the existing
descriptor-driven training/reference/generation workflow. EasyVoice is cloned
as a workflow reference; F5 generation calls F5's API through a product-owned
adapter rather than running a second desktop application.

F5 v1 and ViVoice have separate engine IDs (`f5-tts`, `vivoice`) because they use
different checkpoint architectures/vocabularies and language capabilities.
Other new IDs are `indextts25` and `fish-s2-pro`. A Voice Model's original engine,
base model, source run and project-relative reference remain its identity.
Weights/LoRA are never interchangeable across these engines.

Clone/reference creation is a CPU operation producing a real reference artifact;
it does not require model weights and does not claim to train them. Existing
OmniVoice LoRA/full training remains available through its own adapter. New deep
training descriptors remain explicitly blocked until a verified trainer/exporter
and artifact gate exist. Parameters use upstream names; an ignored parameter is
omitted, including Fish's unused normalize/repetition_penalty fields.

Generation uses private Python workers, the shared GPU lease/Stop workflow,
offline local assets and hash-verified pinned model components. Catalog readiness
uses receipts/stats/import checks; the worker recomputes component hashes before
loading weights. Source checkouts must match the supported SHA and be clean.
Only decoded finite non-silent audio can report worker success. This structural
gate does not establish language, identity or emotional quality.

The UI permits inspecting unavailable choices and their settings/status but
prevents starting them. Per-descriptor values remain separate. Emotion, vocal
effort and rendered audio gain remain independent; multi-variant publication and
acoustic acceptance are subsequent work under ADR0011.

## Consequences

Base weights/private runtimes/source checkouts stay machine-local under ignored
runtime roots. Project references and adapters stay with their project. No
project manifest migration, upstream OmniVoice edit, model download during
inference, or silent engine fallback is introduced.
