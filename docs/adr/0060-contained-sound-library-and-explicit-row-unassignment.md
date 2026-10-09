# ADR0060 — contained Sound Library slots and explicit row unassignment

2026-10-09. Accepted for USER-FEEDBACK-13.

## Shared presentation and selection

VoiceVault owns Sound Library presentation on Input, standalone and Voice
Manipulator routes. Each profile slot contains a fixed 20px selection control,
bounded summary, Properties button, and its voices. Voice metadata and actions
occupy separate grid rows; Collection and Delete have their own sizes. The list
aligns slots to the top instead of stretching them to the remaining panel height.
The module body constrains the inner list scrollbar on all three routes; profile
forms retain their own overflow. Blank side padding remains a deselection canvas.

Checkbox activation toggles membership without modifiers. Shift selects an
anchored range; Ctrl/Meta+Shift extends it; Ctrl/Meta+A selects all logical rows.
Preview/card activation remains separate from checkbox membership. Script profile
choices apply only to checked rows. Archived channel selectors live with leading
row controls, preserving the transcript's virtual measurement and scroll logic.

## Word ownership

The existing nullable `StudioWord.speakerId` now has explicit semantics: a string
assigns a profile, null leaves the word unassigned, and an absent/legacy blank
value retains existing footage mapping/default behavior. No new field or invented
diarization label is persisted. Raw diarization remains provenance. Script row
clear/move operations, Workspace saving and Timeline menu clearing preserve null.
Channel grouping distinguishes explicitly unassigned words from inherited words.
The dataset compiler respects null before mapped diarization or default profile,
so a cleared dialogue cannot silently return to a person's training material.

This does not retroactively change old missing annotations into explicit clears.
Owner media is not migrated. Native layout/scroll acceptance remains a device
gate; source and jsdom checks alone do not prove rendered pixel containment.
