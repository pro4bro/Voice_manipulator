# 0080 — Explicit Voice Patch preview and Apply

Date: 2026-10-16

## Decision

A Patch draft captures an immutable audible source identity, selected sentence
frame range, audio/metadata hashes and saved Script/Timeline revisions. A later
Script model assignment cannot relabel the source speaker. Replacement text and
voice are separate, explicit job inputs.

The first processor supports trained OmniVoice full/LoRA artifacts for the same
Speaker Profile. It still uses the model's saved clean reference. Clone-only
context and hybrid conditioning are separate strategies; no silent fallback is
allowed. Unsupported timing, expressive controls, reference schedules and gain
requests fail before inference rather than being silently omitted.

Jobs use the shared runtime lease, owned cancellation and content-addressed
speech clips. A verified replacement and composite WAV live under portable
project jobs. Neither becomes an accepted Voice Output until explicit Apply.
Apply verifies fresh dependencies and receipts, publishes a separate output and
replays idempotently. Source navigation and the saved output list retain earlier
revisions. Opening a patched output also loads its replacement Script rows.

## Timing and quality

Whole-sentence V1 uses natural-duration ripple. Prefix, suffix and existing gaps
remain byte-identical, and downstream cues move by the actual PCM frame delta.
Estimated word timing stays untrusted. Clipped samples and discontinuous splice
boundaries fail the artifact gate. These measurements do not establish speech
accuracy, identity similarity or human listening acceptance. Partial-word editing
and exact timing are later rounds.

## Storage

Persistent project paths are relative. Hashes cover source metadata/audio,
generation/model/reference inputs, clip records and preview/applied WAVs. GET
validation does not regenerate missing audio. Reopening does not start inference.
Upstream engine code remains read-only.
