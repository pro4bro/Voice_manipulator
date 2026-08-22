# ADR 0002: Use A Legacy Studio Compatibility Adapter

## Status

Accepted as an interim migration seam.

## Context

The customized Studio runtime in the migration sidecar already owns working model caches, the trained southern Vietnamese checkpoint, TTS, import, transcription, and repair jobs. The new project must not copy those customizations into or edit `engines/OmniVoice`, because that directory must remain updateable from upstream.

## Decision

The Pro4Bro API exposes `/api/studio/*` through `LegacyStudioGateway`. The launcher prefers `.runtime/omnivoice-studio`, falls back to the relative migration path `../OmniVoice`, and starts that isolated Python environment on port 18081. The new application stays on port 18120. Frontend modules know only the Pro4Bro interface.

## Consequences

- Existing trained models and processing jobs are usable immediately.
- Upstream `engines/OmniVoice` stays clean and can be updated independently.
- The sidecar is a temporary adapter, not the final processing architecture.
- Later phases can replace it with project-native asset/job adapters without changing module callers.
