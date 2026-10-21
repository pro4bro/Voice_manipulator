# ADR 0122 — LipSync source candidates and render boundary

Date: 2026-10-21
Status: Accepted for round 65 source/catalog slice

## Context

The owner asked to download MuseTalk, LatentSync, and Wav2Lip, show them as
choices on LipSync, and assess whether they support an editable multitrack
video/audio composition with speaker-to-face mapping and selective re-lipsync
after Voice Over edits. Round 64 has a session-only one-video/one-audio draft.

## Decision

- Keep three upstream Git checkouts under ignored
  `.runtime/engines/lipsync/<engine>`, with origin and commit recorded in
  `.runtime/open-engines-install.json`. The earlier hardlinked MuseTalk snapshot
  under `.runtime/engines/research` is left intact; it is not a verifiable
  upstream Git checkout.
- Expose three task-scoped engine catalog descriptors on the right of LipSync.
  The UI may select a candidate for review, but `available` stays false and
  Generate stays disabled until a product-owned adapter, weights/runtime,
  durable job, artifact validation, and usage terms are proven. Installed source
  is reported separately from render readiness.
- Reuse the descriptor-driven ParameterForm for grouped per-engine inference
  settings. Values stay independent per engine in the current session and reset
  to source defaults. MuseTalk realtime uses batch default 20 versus offline 8;
  mode-specific flags are shown only for that mode. Wav2Lip's four-coordinate
  pads/crop/box arguments use named integer fields in native top/bottom/left/right
  order; the future adapter must assemble and validate vectors against frames.
  Every spec cites the downloaded source commit. Arbitrary source/model/output
  filesystem paths are resolved by product installation/project code, not typed
  as inference commands in the UI. This round does not invoke those flags.
- Treat the multitrack compositor, shot-scoped face tracks, Speaker Profile
  bindings, generated speech-turn schedule, and selective Voice Over patch
  invalidation as product-owned capabilities shared across engines. No
  candidate supplies the complete workflow. See the source review at
  `docs/research/lipsync-compositor-capability-2026-10-21.md`.
  `VoiceOutput.segments` already carries `speakerProfileId` and start/end
  timing; a later slice must map those intervals through the audio placement
  onto selected shot-scoped face tracks, including clips with no visible face.
- Keep Wav2Lip visible as a research-only comparison; its public repo/model
  terms do not permit commercial use. Review LatentSync 1.6 model terms
  separately from its Apache-2.0 code. MuseTalk is the first local prototype
  candidate, subject to checkpoint/dependency terms and footage quality tests.

## Consequences

This round establishes reproducible source availability and an honest
selection/status UI. It does not install checkpoints or an isolated Python
runtime, save compositions, detect/track faces, render video, or certify
quality. Next bounded slices are a portable multi-clip composition document
and timeline; face-track/profile assignments plus turn timing; then a verified
render adapter and After/patch review. Source media remains unchanged.
