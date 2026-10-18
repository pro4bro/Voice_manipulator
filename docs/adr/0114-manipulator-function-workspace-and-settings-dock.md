# 0114 — Function navigation and Script settings dock

Date: 2026-10-19. Scope: stabilization round57, VM-FUNCTION-LAYOUT-01.

The owner requested left-edge function navigation, a wider Script editor and
compact multitrack mix controls within each column header. Voice Manipulator
keeps one Script/Timeline workspace across VO/VP/VD/VI/LT. Only function panels
switch. A source selection entering Manipulator from Input opens VP when that
selection is qualified for Patch. Source/output ownership rules remain intact.

Only VO exposes the whole-Script generation action. The Script button and the
Workspace job entry point both reject VO generation in another function.
Existing jobs may finish in the background. Unimplemented functions expose their
status, not an enabled placeholder processor. Engine integration authorization
and its remaining acceptance slices are in OPEN-ENGINE-WORKFLOW-PLAN.md.

The four Script setting groups move to a right-column ModuleFrame. A React portal
is owned by the same VoiceScript component: selected rows, duration refresh,
document updates, Fix and render controls retain their existing state/callbacks.
The dock is a presentation destination, not a second document/controller. An
undefined destination preserves standalone editor behavior; null waits for the
workspace destination to mount. The right column owns scrolling, and the dock
does not inherit the editor's former 220px settings limit.

Result badges derive from verified processor lineage fields, not selected mode
or text heuristics. Existing results without Patch lineage show VO; an applied
voicePatch job/source lineage shows VP. Saved metadata/filenames stay untouched.
Future result kinds must add their actual provenance rather than guess from names.

Imported/OBS timelines share LaneMixerControls. Column mode contains track title,
vertical M/S and horizontal Gain-over-Level within a measured header row. LAYER
retains its compact sidebar. Mixer state, audio gain, source PCM and timing do not
change as part of layout. Theme colors use existing semantic tokens.
