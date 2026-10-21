# ADR 0125 — LipSync products, version histories and shared-source routing

Date: 2026-10-21
Status: Accepted for round76; inference quality gates remain separate.

## Context

The owner defines one LipSync Session as one video product within a Project.
Products share Media Pool and generated Voice Output sources. Each Session owns
expandable Version slots. New version copies the current edit; editing, settings,
face decisions and Undo/Redo in one slot must not affect another product or slot.
Each face card places Voice Profile directly below Face ID. Sources can be sent
from other pages through a common Send to submenu.

## Decision

- `scripts/lipsync/sessions.json` is a revisioned Session/Version registry with
  active IDs. Every Session starts with Version 1. Version metadata records its
  parent version and UTC creation time. New session starts an empty composition;
  New version clones the selected saved composition and reviewed face decisions,
  then starts an empty edit history.
- `scripts/lipsync/versions/<id>.json` atomically stores one composition, current
  face-review drafts, and at most 100 combined past/future snapshots. History
  snapshots include face decisions as well as clip/layer timing, audio selection,
  native engine parameters and processing scopes. Undo restores content while
  retaining the current optimistic document revision.
- The editor caches drafts by Project/Version. A late load/save response updates
  only its owning entry. Edits made during a save remain dirty and retain the
  returned revision. Switching Version, creating a Session/Version, changing page
  or returning to the Project list first saves the current state and face review.
  Invalid numeric/Face ID drafts and save conflicts block that transition with
  an actionable error. Face ID typing commits only valid IDs and groups a focus
  gesture into one undo step; native text-field undo remains local to the field.
- Every project LipSync operation accepts an explicit `versionId` query parameter.
  Scoped stores resolve only Versions belonging to that Project. Jobs, face
  galleries, thumbnails, plans, logs, cancel, After and artifact downloads use the
  same scope. Job folders are `jobs/lipsync/versions/<id>/`.
- Completed analysis snapshots, reviewed decisions and owned thumbnails are
  copied into a new Version with rewritten project-relative thumbnail paths.
  In-flight jobs and rendered videos stay with their originating Version.
  Cloning does not claim a new inference result or quality approval.
- Existing `scripts/lipsync-composition.json` opens as Session 1 / Version 1
  (`legacy`). Its jobs remain readable in `jobs/lipsync/`; first scoped save
  writes `versions/legacy.json`. The original composition is retained. Missing
  version query parameters retain the old API contract for compatibility.
- Sources remain shared, immutable references. Sending footage to LipSync stages
  compatible videos for a chosen slot, then appends them to its active video
  layer in request order as one edit. Sending generated speech stages available
  outputs; importing one replaces that slot's audio, retaining timeline start
  while using the new output's full source duration. Original outputs and other
  slots remain intact. Users may create a new Version before replacement.
- The reusable Send to submenu appears on Media Pool footage and generated Voice
  Output context menus. Media → Training expands imported live audio tracks;
  Media → Voice Manipulation opens the selected footage in Voice Patch; Media
  and Voice Output → LipSync stage source IDs without duplicating source bytes.
  Voice Output → Voice Manipulation opens one generated output. Incompatible
  destinations are disabled with a reason. Generated speech is not silently
  converted into Training source footage.

## Consequences and boundaries

Face binding is keyed by Face ID, so all observation cards of the same identity
show the same Profile. Correcting one observation's ID can split it from that
identity. Face-review drafts participate in version history; applying the draft
still uses the analysis review's own server revision and source-scope checks.
A crash between saving state and applying face review leaves a recoverable draft;
Generate stays blocked until it is applied. No atomic cross-file render approval
is claimed.

Source deletion can make a saved Version's source unavailable; source validation
continues to reject processing without the required media. Versions preserve edit
state and reference provenance, not extra copies of all shared assets. The limit
of 100 undo steps is per Version, including persisted history across reload.
Manual identity continuity across fresh analyses, additional native engine
pipelines, face replacement, generated-voice/real-client visual acceptance and
selective Voice Over repair remain the separate gates from ADR0124.

Evidence: `docs/gates/lipsync-sessions76-20261021.md`.
