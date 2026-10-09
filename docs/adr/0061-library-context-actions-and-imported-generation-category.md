# ADR0061 — Library context actions and imported generation category

2026-10-09. Accepted for USER-FEEDBACK-14.

## Identity and model presentation

A Speaker Profile identifies a person and holds classification/consent. Its
ProjectVoices are addressable models used by generation. These are distinct
objects, with separate selection sets and deletion scopes. The shared Sound
Library labels the profile as "Hồ sơ người nói" and each voice as "Model giọng",
with model kind and Collection source. Selecting a profile does not introduce a
second trained voice or a different audible output.

Ticking only changes membership. Profile color/apply/delete/deselect and voice
bulk delete/deselect live in context menus. Opening a menu on an already-selected
item preserves its range; an unselected item becomes the menu's single target.
Nested voice menus do not bubble into profile selection. ContextMenu/Shift+F10,
arrow/Home/End navigation, Escape/focus restoration and viewport bounds retain
keyboard access. The shared component covers embedded and standalone routes.

## Collection lineage

ProjectVoice adds optional `collectionSource: {collectionId, entryId}`. It is
descriptive origin, not consent, model quality or publication authorization.
New imports return and store it. Legacy get/list project it from the existing
collection-import.json without rewriting owner records. Marker reads validate
the object/string IDs, resolve containment and read at most16KiB+1; invalid
markers leave ordinary voice metadata available. UI hides Add to Collection for
an imported model and retains it for locally created trained models. Existing
API artifact, hash and publication gates remain enforced.

## Generation category

Voice Manipulation formerly inherited its only voice filter from Voice Training.
A clone selection hid an imported full/LoRA model. A generation-only override now
activates a non-VC imported voice's category. On reopening, the first successful
voice load initializes from Collection origin once per project, respecting a
manual generation choice made earlier in the mounted session. Later manual
choices persist across refresh; a deliberate new import activates its own category.
The compact generator selector edits this override without changing Training
settings or model ID. No override retains the earlier Training-derived default.
RVC remains excluded from TTS; publication aggregates and engine gates are retained.

Native menu layout and an audible owner-model generation remain device checks;
request assertions with mocks are not inference-quality evidence.
