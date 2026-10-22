# ADR0134 — Readable import storage and the Input STT dock

2026-10-22, Round86. Status: implemented.

## Decision

The owner's naming choice applies to new imports only. Keep existing footage
folders and files unchanged. New native/upload imports and growing MKV follows
create `assets/media/<safe-footage-stem>--<asset-id>/`. Asset IDs remain unchanged
identities; persisted source/analysis paths remain project-relative. Duplicate
filenames receive different IDs. Preserve Unicode and spaces, replace invalid
Windows filename characters, protect reserved device names, and bound the label.

Source/analysis files use `<stem>--source.ext`, `<stem>--analysis.wav`, and
`<stem>--source-final.mkv`. The latter retains the established completion suffix.
New track folders include the original footage stem and stream index. Final MKV
track WAVs, waveform caches and STT audio caches also carry footage prefixes.
Editable word/checkpoint JSON sidecars retain their role names within the folder.

One product-owned path adapter resolves legacy ID folders first, then named
folders by their ID suffix. Successful named lookups are bounded/cached; missing
lookups are not cached. Resolution checks project containment. Words, diarization,
dataset/Patch evidence and both MKV checkpoint readers use this adapter. Startup
and Stop discover checkpoints in both layouts and validate their parent identity.
No persistent schema migration or existing-project directory rename is required.
Filesystem labels are fixed at import time; renaming an asset in the UI does not
change its physical folder or invalidate references.

Reveal retains original/project routing and the machine-local original locator.
Windows uses SHParseDisplayName and SHOpenFolderAndSelectItems with cidl zero,
passing one full item identity instead of the Explorer `/select` command string.
COM initialization and item memory are balanced, including already-initialized
request threads. Missing sources and Shell failures produce explicit API errors.
macOS/Linux behavior is unchanged.

Microsoft documents [single-item selection and the COM requirement](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shopenfolderandselectitems).
Actual Explorer window behavior remains an owner-device UAT gate; native Windows
PIDL round-trip and mocked selection/error paths are verified separately.

Input places a Speech to text module immediately below Recorder. Its existing
Media Pool controller portals the button, model choice and Pause/Stop/Resume
controls into that dock. Selection and queue callbacks retain one owner. The
library keeps Media Pool mounted while Sound Library is visible, preserving model
and queue controls. Other pages and isolated component uses retain their existing
fallback. The current voice-script settings dock provides the established pattern.

## Consequences

New footage can be found from Explorer by name, with unique IDs preventing
collisions. Existing projects stay readable and portable. New files have longer
paths, bounded by a 64-character label; extremely deep host project locations are
still subject to the host tools' path support. No media bytes, recognition model,
timing algorithm, engine code or inference defaults are changed by this decision.

See `docs/gates/media-storage86-20261022.md` for tests, real media evidence, review
and the remaining browser/full-API validation gaps.
