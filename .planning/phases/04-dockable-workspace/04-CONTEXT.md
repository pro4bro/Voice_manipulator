# Phase 04: Dockable Workspace - Context

## Objective

Replace page-specific three-column assumptions with a project-safe, six-zone dock shell that hosts every reusable module at any valid location. This is the prerequisite for the fourth `LipSync` workspace page and a reliable desktop shell.

## Product contract

At the primary target of 1280 x 720 or larger, every workspace has exactly these named placement zones:

| Top left | Top center | Top right |
| --- | --- | --- |
| Bottom left | Bottom center | Bottom right |

Each zone holds one module or a tab stack. Users resize row/column splits and drag module headers to a highlighted compatible zone. Version 1 intentionally excludes arbitrary free-floating windows: bounded docking and tab stacks are reliable for heavy media modules. Below the usable width, the same layout enters a focus/tab mode rather than squeezing six panels or creating global page scroll.

## Deep modules

- **DockLayout** owns drag target calculation, snap previews, tab stacks, split resizing, layout validation, keyboard docking, and invalid-layout recovery. Its small external interface is `layout`, `module definitions`, `renderModule`, and `onLayoutCommit`.
- **ModuleRegistry** is location-agnostic. It resolves a module by ID and must not know coordinates, a column, or a page-specific shell.
- **WorkspaceSession** owns selected project/asset/take IDs, playback, recording, jobs, commands, and subscriptions. Moving a panel re-renders its view but cannot cancel a recording, lose a job subscription, reset selection, or disconnect timeline playback.
- **Engine adapters** remain backend seams. UI modules never import VibeVoice, OmniVoice, MuseTalk, model paths, or cache paths.

## Module definition contract

Every `ModuleDefinition` declares only stable UI facts:

- `id` and title;
- minimum width and height;
- default zone and compatible zones;
- renderer receiving a `WorkspaceSession` / narrow capability handle;
- accessibility label and keyboard move support; and
- lifecycle policy distinguishing a visual unmount from a running service/job.

No definition owns another module, a project path, an engine process, or hard-coded layout coordinates.

## Persistence and migration

The project owns a versioned layout schema containing only module IDs, zone IDs, split proportions, tab order, and focus state. It never stores machine-absolute media, engine, model, or cache paths. Missing/new modules fall back to page defaults; malformed layouts are repaired safely. Existing manifests are first presented through a compatibility adapter, then progressively migrated to `WorkspaceSession`; duplicate module implementations are prohibited.

## Default layouts

| Page | Top-left | Top-center | Top-right | Bottom-left | Bottom-center | Bottom-right |
| --- | --- | --- | --- | --- | --- | --- |
| Speech to Text | Media Pool | Script | Recorder | Speaker & Emotion | Timeline | Speaker Isolation |
| Voice Training | Media Pool | Script | Train | Voice Vault | Timeline | Training Job |
| Voice Manipulator | Media Pool | Script | Control Rack | Recorder | Timeline | Voice Patch + Recent Takes |
| LipSync | Media Pool | Video Preview | LipSync Rack | Script / Cue List | Timeline | Render Queue + Recent Renders |

## Validation gate

- Unit-test schema migration, validation, repair, minimum-size clamping, tab ordering, and all four defaults.
- Integration-test that moving Recorder, Timeline, Script, Training Job, and an active mock job preserves session state and subscriptions.
- Browser-test pointer, keyboard, reset layout, reduced motion, themes, and narrow focus/tab mode without global scrolling.
- Reopen a moved project and verify the persisted layout has module IDs only, never a previous computer path.
