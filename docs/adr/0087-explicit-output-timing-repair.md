# 0087 — Explicit timing repair of generated audio

Date: 2026-10-16. Status: accepted for VM-TIMING-REPAIR-01.

Timing Repair measures existing PCM against each saved Script segment using the
existing Studio recognizer and conservative token mapping. It is ASR-assisted
timing, not a new forced aligner or a guarantee of acoustic word accuracy.

Plan identity pins source WAV/metadata, segments, recognizer model identity and
word-timing policy. Explicit Start owns a persisted background job and cancellable
recognition IDs under the shared GPU lease. Stop targets only those IDs. The lease
is released before terminal publication; reopen does not start inference.

A checked proposal artifact is required before completion. Partial measured
coverage remains visible; zero trusted matches fail. Missing or changed proposal
and source identities cannot be applied. Segment/speaker ownership and exact
sample bounds are retained, with unmeasured words kept untrusted.

Explicit Apply creates a new Voice Output with byte-identical WAV and updated
word annotations. A dedicated immutable receipt makes Apply idempotent. Original
output metadata/audio and prior Patch history stay unchanged. No TTS or new Voice
Model is involved. User listening and word-anchor acceptance remain independent.
