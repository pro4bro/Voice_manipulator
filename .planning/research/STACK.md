# Stack Decision

## Selected

- React + TypeScript + Vite for the frontend.
- Vitest + Testing Library for frontend feedback loops.
- FastAPI + Pydantic for local project and engine orchestration.
- Pytest for backend contracts.
- CSS custom properties and feature-owned styles; no UI framework lock-in.

## Why

The UI has many shared interactive modules and page-specific compositions. Typed props and domain types keep those interfaces explicit. FastAPI fits the existing Python audio ecosystem while the adapter seam prevents UI code from learning OmniVoice internals.

## Deferred

A native desktop host is Phase 05. Phase 01 uses a local web runtime so product structure can stabilize before packaging adds another failure surface.

