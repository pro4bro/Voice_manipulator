# ADR 0072 — Selection controls preview; trained voices travel as verified packages

Accepted for PORT-FEEDBACK-02, 2026-10-13.

## Context

The owner found that selecting one track hid its siblings but left their audio
players active. Changing Timeline mounts also discarded preview mixer settings.
Failed OBS recordings without MKA assets had no context menu. Voice Collection
could copy models between local projects, but had no external file transfer.

## Decisions

- Apply feedback to the main source first, then build a numbered portable update
  from that same source. Validate source and installed portable behavior and app
  hashes; keep the base runtime/model layer independent. This is the owner's
  durable workflow preference, also recorded in long-term memory.
- Resolve Media Pool selection once for Script and Timeline. A selected parent
  expands into its imported child tracks; a selected child or subset includes
  only those tracks. Multiple tracks in one footage remain usable together.
  Cross-footage multi-selection retains the existing non-playable overview.
  Active OBS capture does not override an explicitly selected older recording.
- Only selected tracks have playback elements. Detaching a player pauses it;
  delayed activation cannot restart a withdrawn imported track. Selection and
  mixer settings are applied before playback reconnects.
- A project-session provider owns preview gain, Mute and Solo across Timeline
  mounts. OBS keys include project/recording/channel identity; imported tracks
  use their stable asset IDs. These are listening settings, separate from source
  PCM/MKA, saved processing gain automation, STT and training selection. A new
  project session starts with default preview controls.
- Solo is additive within one footage: with any Solo enabled, only selected Solo
  tracks can be heard. Mute still wins, and gain stays remembered. Multiple Solo
  tracks can play together. The S button is below M in both layouts. Returning
  to the parent selection preserves each track's controls.
- A stopped OBS journal without published media can be recycled via optional
  top-level `deletedAt`. Recycle/Restore preserve retained PCM. Processing,
  finalization and recovery refuse recycled journals until restored. Permanent
  deletion requires a recycled stopped journal, validates containment and writes
  the existing terminal tombstone before removing its owned tree. Active capture,
  archive work and detailed STT locks/tasks block removal. Published footage uses
  the existing Media Pool asset actions.
- External Voice Collection transfer is a per-model ZIP with schemaVersion 1 and
  kind `pro4bro-voice-collection-entry`. `manifest.json` lists each file's relative
  POSIX path, size and SHA256; `entry.json`, `lineage.json` and referenced model,
  adapter/index, reference and consent payload are included. Base models and
  unreferenced files are excluded. Import assigns a destination entry ID and
  retains provenance; existing project import clears a standalone model's
  coordinated Model Set ID rather than inventing set publication.
- Archive validation rejects unsafe/colliding paths, links/nonregular members,
  missing/unlisted/hash-mismatched files and invalid lineage. Extraction is
  bounded and staged; every failure cleans up. Limits are 8 GiB expanded,
  8 GiB + 80 MiB upload, 20,000 files and 16 MiB metadata. Model bytes are copied
  without deserialization or execution. Integrity checks are not proof of voice
  quality or rights granted by another principal.

## Consequences

Failed OBS takes can be managed before successful archival. Source and portable
use the same product logic. A voice ZIP can move to another machine without the
source project or source account path; the destination still needs its compatible
engine/base model. LoRA, full checkpoint and RVC file shapes are supported.
Native target-machine OBS capture and GPU inference remain separate acceptance
checks from browser selection and package artifact verification.
