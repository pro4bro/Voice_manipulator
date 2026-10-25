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
- Trim, split, transfer between layers, mute/enable, Solo and delete edit the
  current Version only. Clip timecodes are locked: transfer preserves timeline
  start, source IN and duration; a different start is rejected. These operations
  do not rewrite any referenced source Voice Output.
- Version output IDs and source paths remain project-relative and portable with
  the folder containing `project.json`.

### Direct Timeline editing

- Select footage in its lane. The top toolbar owns CUT, UNCUT, DELETE, RESET and
  MOVE up/down; there is no selected-clip form below the lanes. CUT uses the
  playhead or valid marked IN/OUT boundaries inside the selected clip. DELETE
  removes only the selected piece. UNCUT rejoins compatible contiguous source
  pieces only when they are immediate neighbors in the same layer's clip order.
- Drag vertically to another existing layer, or use MOVE/Alt+Arrow up/down.
  Edge scrolling reveals offscreen layers during drag. Timeline/source coordinates
  remain locked. Cancelling pointer capture must not commit a transfer.
- RESET restores `generatedComposition`, saved after the latest successful Full
  or Fix, including all its Full/Fix clips. It rerenders playback/export without
  modifying source media or resetting pending Script edits. Clone and lifecycle
  operations retain every source referenced by that baseline. Older manifests
  initialize it from their current arrangement.
- Adjacent pieces from the same continuous source receive no synthetic seam fade;
  CUT/UNCUT alone preserve PCM. Other source transitions retain bounded fades.

## Script and Timeline feedback

- Before the first generation, Script edits have no blue highlight. After a
  successful generation, differences from `generatedScript` are strong blue;
  synthesized differences from `fullGeneratedScript` are faded blue. Full success
  resets both snapshots and the old Fix layers. Fix completion preserves newer
  text edits as pending; failed/cancelled jobs cannot fade them.
- Legacy Versions without a saved Full snapshot use their last generated text as
  the initial baseline. Pre-upgrade Fix highlights cannot be reconstructed.
- A row Speaker Profile selector changes that row directly, including clearing
  its Voice Model on unassignment. Only explicit checkboxes open bulk row actions.
  Generation activity appears in the right Script settings column.
- Master waveform, subtitles and audio layers share one zoom/viewport/playhead.
  The ruler is at the top only; navigation and playback remain below the layers.
  Each clip draws its actual source waveform's upper half. No placeholder audio
  signal is drawn when the source waveform is unavailable.
- Layer Mute takes precedence over Solo. When any Solo is on, enabled solo layers
  alone contribute to the same composition used by playback and export.
- Master, subtitles and layers share one vertical scroll viewport. The one top
  ruler stays visible; subtitles freeze directly beneath it when Master scrolls
  out of view. Horizontal wheel/Shift+wheel, arrow keys and the bottom navigator
  pan the same viewport used by Master and subtitles. Navigator and transport
  stay outside vertical scrolling. Clips hidden by frozen subtitles or outside
  the viewport cannot receive a vertical drag/drop.
- Enter and paste preserve literal text inside the current Script row, including
  paragraphs, tabs and speaker-looking labels. Text mode preserves existing row
  boundaries without creating new rows from labels. Explicit Add Row remains.
  Automatic transcript rows require diarization/manual identity or Profile changes:
  one continuous speaker turn per row, independent of pauses or punctuation.
- Text view separates speaker labels and dialogue into aligned columns. A
  dialogue-to-dialogue selection copies spoken text across rows without identity
  labels; a selection spanning both columns includes speaker names in turn order.
  Profile assignment remains in table view. Literal line breaks stay inside their
  existing turn; cross-row destructive edits cannot erase speaker/row boundaries.

### Old-project speaker turns

Legacy Script documents are grouped once on opening and saved with
`turnGroupingVersion: 1`. Consecutive rows of the same explicit speaker and voice
become one cell; each original row remains a literal line within it. A/B/A stays
three turns. Alt+Enter inserts a new line inside the cell. Cell height and timed
word rendering retain blank lines as well as normal wrapping.

Grouping preserves production intent: unknown speakers, different models or
effective settings, duration budgets, row-specific timing/reference bindings and
the existing row length limit keep their boundaries. Common boundaries across
current/generated/Full snapshots preserve highlights and local Fix eligibility.
The retained row ID and `legacyRowIds` resolve original output segments without
rewriting their WAVs or metadata. New Full/Fix publications carry the marker and
aliases, including when later layer edits expose older source audio.

The project Script and Session book retain `.pre-turn-grouping` JSON backups.
Once migrated, subsequent manual Add Row boundaries survive reopening. Older
browser-only drafts also migrate once; the cache now retains the complete marked
document. ADR0145 supersedes the previous decision to leave all old rows separate.

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
