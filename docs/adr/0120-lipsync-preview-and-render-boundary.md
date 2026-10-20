# ADR 0120 — LipSync preview and render boundary

Date: 2026-10-20
Status: Accepted for round 63 preview slice; render design remains open

## Context

LipSync needs a page shaped like Input: sources on the left, Preview Video in
the center, controls on the right, and a two-track timeline below. The source
video already belongs to Media Pool and generated audio belongs to Voice Output.
Neither a project video playback endpoint nor a LipSync render adapter existed.

## Decision

- Add a separate LipSync page. Its preview uses a Media Pool video asset ID and
  a Voice Output ID. The client never sends a filesystem path to the playback
  endpoint; the API resolves the original video inside the project folder.
- A shared timeline places the video and generated voice independently. Each
  clip has a nonnegative timeline start and source IN point. The video is muted
  during preview, so only the generated voice is audible. Source files are not
  edited by preview.
- Timing is explicitly a session draft in this round. `Generate LipSync`,
  `After`, and optional face replacement stay unavailable until they consume
  verified, project-owned artifacts. Do not report a rendered or swapped video
  based on a preview or a queued job.
- Browser preview relies on native video decoding. The API can serve MP4,
  WebM, MOV, and MKV with their media types, but unsupported browser codecs
  produce a visible error. A project-owned preview proxy is a separate slice.

## Next bounded slices

1. Save a portable alignment document under the project folder with asset IDs,
   source IN/OUT, timeline starts, revision, and input fingerprints. Validate
   both files at approval time; edits or missing sources invalidate approval.
2. Add a product-owned LipSync engine port and one verified adapter. A durable
   job records the approved document, engine/model revision, progress,
   cancellation, retry, diagnostics, and output path. Check output file,
   dimensions, frame rate, duration, audio sample rate/channels, clipping, and
   boundary transitions before declaring success.
3. Show source and rendered video at the same timecode for human QC. Accepting a
   derivative writes project-relative lineage and exposes export. Face
   replacement is an optional, separately selected pass with its own reference
   face, adapter, job, artifact checks, and before/after QC.

## Consequences

Round 63 delivers source selection and timing audition, not render readiness.
The project remains portable because the new endpoint resolves stored relative
paths and the current draft writes no project data. Phase 6 remains open.
