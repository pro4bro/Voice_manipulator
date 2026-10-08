# ADR 0050 — Media selection and transcript view windows

Date: 2026-10-08. Status: accepted for USER-FEEDBACK-03.

## Context

Deferring Script/Timeline construction lets selection feedback commit first,
but the subsequent render still mounted every word of a long speaker turn.
At full-duration zoom, the Timeline viewport also contained the entire word
list. Multi-select kept the previous footage open and constructed transcripts.
Folder navigation hid siblings and made moving footage back to root awkward.

## Decision

- Keep list selection separate from the one opened footage/track. More than
  one selected media item closes detail data and bypasses Script/Timeline
  constructors; collapsing to one opens that item. This supersedes the earlier
  combined multi-footage Script presentation, following the owner's new request.
- Fence asynchronous media opens with a revision. A later selection, clearing
  details, or project switch invalidates an older open response.
- Display local import placeholders as soon as file choices are available,
  before inspection/cache confirmation. Transfer ownership to the workspace
  import queue without removing feedback early. Existing same-name footage
  does not acknowledge a new import.
- Present the existing media organization as an expandable folder tree, with
  nested creation and root/folder drop targets. Persistent schema and source
  paths remain unchanged; imported child tracks stay with their parent footage.
- Apply checkbox intent optimistically to all eligible selected media, including
  selected tracks. Serialize overlapping bulk writes for the same checkbox,
  retain per-field revisions, fence older full-list reads, and roll back failed
  targets without replacing unrelated media data.
- For transcripts over 600 words, render visual fragments of 64 words with at
  most 12 fragments mounted. Measured heights and spacer estimates retain
  scrolling; word selection/playback can reveal a distant fragment. Fragments
  retain original word indexes and logical speaker-row actions.
- Delay exact text-offset mapping until plain editing, Find, review, or an
  explicit deletion needs it. Plain text reconciliation still uses exact offsets.
- Dense Timeline overviews render about 384 subtitle markers plus relevant
  active/selected words. All source words remain in memory. Background hit
  testing resolves the full source list for editing, context menus and promotion;
  zooming into a smaller interval restores word detail.

## Evidence and limits

Regression tests reproduce 6,000 mounted words before the change, then enforce
bounded Script/Timeline DOM and editing of a distant/non-mounted source word.
Selection tests reject late detail opens; import tests cover delayed inspection,
same-name import and queue handoff; checkbox tests cover immediate intent and
rapid reversed writes. Folder tests cover nested expansion and moving footage
into a folder and back to root.

DOM limits do not establish browser INP or smoothness on arbitrary media/devices.
Height estimation, real native pickers, large multitrack media and interaction
during actual STT need the UX-EDITING-DEVICE-01 acceptance run. Existing browser
tool restrictions remain in force. No audio samples, timestamp records, engine
adapters, project schema or AI scheduler are changed by this decision.
