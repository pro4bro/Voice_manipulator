# 0101 — Normalize malformed preview containers at validation

Accepted 2026-10-17, round44.

Preview validation checks the sidecar checksum before reading the WAV container.
A matching checksum does not establish that the bytes are valid PCM. Python's
wave.Error and EOFError could escape the audio/waveform routes as HTTP500.
Normalize those container exceptions to the existing PCM ValueError contract in
the shared validator. Keep the cause for diagnosis and a stable user-facing
message. Audio then returns404 for the unavailable artifact; waveform follows its
existing400 validation response. Missing-artifact behavior is unchanged.

A subsequent draft request can rebuild the invalid cache through the normal
renderer, hash, frame and quality checks. Rebuilding a draft does not persist an
edit revision or alter the immutable source. Tests use both an invalid signature
and truncated RIFF with matching sidecar checksums, verify clean errors, then
exercise regeneration and successful audio/waveform reads.
