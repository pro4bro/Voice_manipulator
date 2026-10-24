# Voice Output Version and Layer Contract

This document defines the product contract for Voice Output Sessions, Versions,
local Fix generation and editable audio layers. A Version is the boundary for
the state that belongs together; generated audio remains project-owned media,
and OmniVoice and other engines remain behind their existing read-only/product
adapter boundaries.

## Session and Version lifecycle

- A project with no Voice Output Session starts with one blank Session and one
  blank Version. **New Session** creates another blank Session and Version and
  checks it out for the next generation.
- **New Version** is explicit. It creates a child Version in the same Session,
  copies every audio artifact referenced by the source Version's composition,
  and rewrites the new composition to point at those independent copies. Each
  copied artifact receives a unique version suffix and retains source lineage.
  Editing or rendering the new Version does not mutate the source Version's
  media.
- Each Version owns its current Script, generation configuration, reference and
  timing sidecars, subtitle/timing state, generated Script/config snapshot,
  audio composition, output references, and text history. Checking out a Version
  restores its saved state into the shared workspace projection before edits or
  generation are accepted.
- **Full generation** replaces the full-generation baseline and resets that
  Version's Fix-layer arrangement. It updates the same Version; it does not
  implicitly create a Session or Version.
- Disabling a Session or Version deselects it if active. Disabled slots cannot
  be checked out, used as a New Version source, or receive generation results.
  Re-enabling a slot permits an explicit checkout. Removing a slot is a soft
  removal: the slot leaves the active list while its source media is preserved.

## Generate Fix Only

Fix generation compares the current Version Script and settings with that
Version's last successful Full or Fix generation snapshot. It only considers changed text or
synthesis settings within existing rows whose generated source timing is known.

- When word timings are individually trusted and match the generated row, a
  text-only change replaces the smallest changed word span, including adjacent
  source words when insertion or deletion needs neighboring timing anchors.
- If trusted word timing is missing, untrusted, or does not match the generated
  text, the replacement falls back to the entire affected row.
- A changed voice, speaker, row synthesis setting, or relevant generator
  configuration replaces the entire affected row.
- Adding, removing, or reordering Script rows requires Full generation. Adding
  new text to a row that has no generated timing also requires Full
  generation because that row has no established source timing.
- Fix audio must fit the target region with a duration ratio from 0.5× through
  2×, inclusive. Outside that range the operation returns an explicit error and
  publishes no partial replacement. A wider edit or Full generation is needed.
- Duration fitting is a bounded timing operation, not evidence of acoustic
  quality or approval of a new model. Generated audio still needs listening and
  review; no acoustic quality claim follows from successful fitting.

## Composition and playback

- A Version's composition is an ordered set of audio layers and clip placements
  against one project-local frame clock. Clips reference Version-owned Voice
  Output artifacts by ID and preserve source IN separately from timeline start.
  The current composition format supports up to four hours at 24 kHz.
- A Fix that overlaps an older clip is placed on a layer below the older
  overlapping material. Repeated Fixes continue below existing overlaps rather
  than replacing earlier edits. The bottom-most enabled overlapping clip wins
  playback and export; non-overlapping intervals remain audible as arranged.
- Playback and export render the same composition. Adjacent source seams receive
  bounded fades where enough audio is available. Subtitle/timing export follows
  the audible composition: hidden or cropped source cues are omitted, and source
  timing geometry remains explicit where a fade affects a boundary.
- Trim, split, move, mute/enable, and delete edit clips or layers in the current
  Version only. They do not rewrite any referenced source Voice Output.
- Version output IDs and source paths remain project-relative and portable with
  the folder containing `project.json`.

## Output slot actions

Finished-product slots use the shared `OutputSlotMenu` interaction and visual
behavior. Menus expose only actions supported by that slot type and current
state. Voice Output may expose open/select, New Version, rename, Send to a
compatible workspace, reveal output/project folder, text history, disable/enable,
and soft remove when the corresponding capability is available. Training is not
a compatible Voice Output destination and must not be advertised as an action.

Existing processors that produce an unmanaged final Voice Output explicitly
adopt that result through the Session API. Raw intermediate artifacts are never
discovered as new slots. Opening an already owned result selects its Version;
adoption flushes the previous checkout before restoring the result's state.
