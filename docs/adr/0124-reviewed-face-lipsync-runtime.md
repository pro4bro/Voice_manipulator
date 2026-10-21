# ADR0124 — Reviewed-face MuseTalk runtime and artifact jobs

Date: 2026-10-21. Status: accepted for the local prototype (rounds71–75).

## Decision

Keep source checkouts read-only. Install an isolated Python3.11 runtime with
Torch2.3.1+cu121 and the inference-only dependency set in
scripts/lipsync-requirements.txt. The originally attempted upstream-recommended
Torch2.0.1/cu118 download stalled at zero bytes; it was interrupted. The working
runtime copied Torch package bytes from an existing compatible host cache into
its own environment, then installed/checked its own dependencies. No writable
site-packages directory is shared. setup-lipsync-runtime.ps1 supports both an
official wheel install and this explicitly selected local cache path.

Pin checkpoint repositories, revisions, file sizes and SHA256/Git-blob digests
in app/resources/lipsync-models.json. Provision with the existing resumable,
verifying downloader; receipts stay under ignored .runtime/lipsync-models.
Cheap readiness checks receipts/stat data and an import/CUDA probe; each job
rehashes required models, and render verifies the pinned clean upstream Git
revision. The catalog's optional readinessRequired field prevents a runnable
descriptor without its runtime checker from appearing available.

Analysis is a durable CPU worker using YuNet and SFace. Sample the selected
detection coverage at approximately2Hz, quantized to decoded source frames.
Store project-owned observations, embeddings and thumbnails. Identity matches
are proposals (cosine >=0.5 and best/runner-up margin >=0.08), not human review.
Every observation starts unreviewed. A revisioned review can change an
observation's Face ID (split/merge/correct), explicitly review examples and bind
an ID to an existing Speaker Profile. Saving rejects stale source/coverage,
unknown observations/profiles and revision conflicts. Analysis IDs remain
separate snapshots: reanalysis currently requires review/binding again.

Render candidates intersect generated VoiceOutput.segments with sync coverage
and reviewed profile bindings. The worker identifies faces again on EVERY
processed frame. Missing, ambiguous, duplicate-in-frame or mismatched identities
receive no edit. Unreviewed other IDs can veto an ambiguous match. No first-face
fallback is permitted. Multiple matched identities can be composited in a frame,
but the current real artifact gate covers alternating single-face shots; a real
two-person/overlapping-speech quality gate remains open.

Use upstream VAE, Whisper feature processor, UNet, face parser and blending
primitives with product-owned YuNet face crops. This is **not** the unmodified
native DWPose crop pipeline. Honor batch_size, gpu_id, float16, extra_margin,
parsing_mode, cheek widths and audio context. Reject realtime/v1 and native
coordinate-cache modes at the render-plan boundary. Native v15 already fixes
bbox_shift=0; image-sequence FPS does not control this video-only adapter.
Its export is CFR25, longest edge <=1920px, canvas from the first visible shot.
These limitations are shown in the UI; parameter presence alone is not execution
support. LatentSync and Wav2Lip still have no executable product adapters.

Visible mode modifies only visible selected intervals. Placed/source modes also
write per-clip derivatives (trimmed placed span or complete source respectively).
The composition always follows top enabled layer/last clip on the same layer.
Outside generated speaking turns, and when the bound person is absent, frames
pass through unchanged before video encoding. Original media is never replaced.

Jobs snapshot portable source paths/hashes, composition, review revision and
native settings; use the shared GPU lease for render, log output and permit
cancel/retry as a new job. A failed, cancelled or interrupted job cannot expose
After. Completion requires actual files, full audio/video decode, measured
dimensions/duration/audio streams and hashes. Composition and derivatives have
range-capable routes with project/job confinement and post-QC stat checks.
Structural QC remains distinct from visual qualityAccepted=false. Before/After
use the same Timeline clock and generated audio audition.

## Evidence and remaining work

See docs/gates/lipsync-runtime71-75-20261021.md. The fixture uses upstream
research-only sample video/speech, not client footage or app-generated voice.
Do not redistribute that fixture. YuNet's official card says MIT, SFace's Apache2;
checkpoint/dependency redistribution review and actual project-footage quality
acceptance are still required. No portable release is produced.

Remaining: complete native engine pipelines/settings, recurring identity
continuity across analyses, calibrated multiperson tracking/occlusion quality,
Preview ID overlays, face replacement, and selective regeneration after Voice
Over edits. Current scopes can target a repair manually; no automatic dirty-span
repair/reuse claim is made.
