# 0046 — Media organization and source-time editing

Date: 2026-10-07. Status: accepted for the requested editing workflow.

## Decision

Media Pool folders are virtual, project-owned references in schema-1
`assets/media/organization.json`. Parent IDs define nesting; asset placements
define folder and manual order. Validation rejects unknown assets, duplicate
placements and folder cycles. Moving a footage never moves its original PCM,
container, transcript or derivative files. Child audio tracks remain attached
to their parent footage.

Timeline edits retain source time: `workingRange` intersects the full asset;
`removedRanges` excludes selected sections; `cutPoints` only divides selection.
All are stored with the media asset and default to the full source for older
projects. Playback skips the same excluded intervals used by STT, diarization,
subtitle export and dataset compilation. Uncut restores source intervals for
future processing; it does not invent a replacement transcript.

Processors receive separate compact analysis WAVs. STT starts at a compact seam
map to the following retained range; ends map to the preceding retained range.
Diarization spans crossing a seam split into retained source spans. Training
drops words intersecting excluded source time and cannot merge across the gap.
Edited guided takes use timed words; without usable alignment they fail closed.
Original media remains unchanged.

Script and subtitle edits use one reconciliation helper. Unchanged word anchors
are retained, deleted words lose their intervals, and new words between anchors
receive equal provisional intervals with bounded 10 ms gaps. Unbounded additions
stay untimed. `user-interpolated`/`user-untimed` are never upgraded to verified
source timing by structural validation. Manual waveform placement records manual
provenance. Newly recognized adjacent words get a bounded gap while keeping the
recognizer's original boundaries in `sourceTiming`.

Word and timeline writes serialize per asset. Late responses merge only their
owned fields and cannot replace newer optimistic edits. Native textarea content,
selection offsets and the playback overlay use the same text. Only DẠNG BẢNG
changes the table/prose display. Archived multitrack editing uses the shared
Timeline with one audio owner; live draft capture remains read-only.

## Consequences and evidence

Project moves remain portable; organization and edits resolve relative to the
project folder. Existing processors and quality gates still reject untrusted
alignment. This decision does not relax recognition or identity budgets.
See `docs/gates/ux-editing-2026-10-07.md` for validation and device checks.
