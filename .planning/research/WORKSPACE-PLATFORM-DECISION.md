# Workspace Platform Decision

## Decision

Keep one React and FastAPI product core that runs in the browser during development and internal use. After Dockable Workspace and LipSync contracts are stable, package that same core as a Windows-first Tauri desktop shell. This is a packaging layer, not a native-UI rewrite.

## Browser core first

- The current product, tests, module registry, FastAPI orchestration, and browser media workflow remain one implementation.
- Rapid UI iteration, internal review, cross-platform development, and debugging remain inexpensive.
- The frontend calls product APIs only; AI engines remain behind backend adapters.

## Desktop packaging after the core stabilizes

- A native shell provides reliable project-folder selection, file association, local-media drag/drop, native windows, notifications, offline work, and a managed runtime/model location.
- Tauri can package FastAPI and approved engine launchers as explicit sidecars. Permissions must be capability-scoped and the app must not expose an unauthenticated model service on the network.
- The installer can own runtime discovery, GPU diagnostics, versioned model management, signing, updates, and recovery from moved model folders.

## Comparison

| Option | Strengths | Costs and risks |
| --- | --- | --- |
| Continue web only | Existing code path, quick release/debug, cross-platform, easy internal deployment | Browser sandbox limits filesystem/process/device control; large model lifecycle, external-file workflow, installer/updates, and multi-window media work are weaker |
| Tauri desktop over the web core | Native integration, dependable offline workflow, model manager, launch/file association, installer, native window behavior | Adds Rust/toolchain, signing, sidecar lifecycle, antivirus/GPU support, release QA, and security/update surface |
| Electron desktop over the web core | Familiar Chromium/Node integration and maximum web API parity | Heavier bundle/RAM/process footprint and another Node-based packaging/update surface |

## Guardrails

- Do not fork a separate native UI codebase.
- Start packaging only after Phase 04 validates docking and Phase 06 completes a real LipSync output path.
- Use Tauri for the Phase 07 packaging spike; reconsider Electron only if a demonstrated Chromium/Node packaging need cannot be met by Tauri sidecars.
- Browser mode remains a supported development and internal-review mode after desktop packaging.
