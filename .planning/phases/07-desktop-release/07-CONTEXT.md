# Phase 07: Desktop Release - Context

Package the stable React/FastAPI product as a Windows-first Tauri application. The shell launches approved local sidecars (FastAPI, FFmpeg, and engine workers) through explicit capabilities, authenticates/binds them safely, and manages their lifecycle. Browser development mode remains supported.

The desktop layer owns native folder/file dialogs, project association, model/runtime manager, GPU diagnostics, signed installer/update workflow, crash logs, and recovery guidance. It does not own workflow business logic and does not bypass product adapters.

## Packaging gate

- Prove the sidecar lifecycle, restricted capabilities, model-path recovery, and offline project reopen in a packaged smoke test.
- Ship only after signing, update/rollback behavior, Windows security/antivirus QA, and a reproducible installer build are documented.
- Preserve the same portable project contract: no absolute machine paths enter `project.json`.
