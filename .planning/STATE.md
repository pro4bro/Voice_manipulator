---
current_phase: 3
current_phase_name: Voice Training
total_phases: 7
current_plan: 3
total_plans_in_phase: 4
status: In progress
progress: 60%
last_activity: 2026-09-22 — Completed Round 03-03B SpeakerEmbedder identity gate.
last_activity_desc: Model Sets now have a fail-closed, evidence-bearing identity gate; threshold calibration and the real acceptance run remain.
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (status reconciled 2026-09-22)

**Core value:** One portable project carries audio through transcription,
training, generation, conversion, and later LipSync with honest lineage.
**Current focus:** Phase 03 Voice Training — gated publication.

Detailed plan-vs-code evidence: `docs/PROJECT-STATUS.md`.

## Current Position

Phase: 3 of 7 (Voice Training)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-09-22 — Completed Round 03-03B SpeakerEmbedder identity gate.

Progress: [████████████░░░░░░░░] 60% artifact count (product phases: 1/7 complete)

The 60% figure is GSD's 6/10 plan-summary artifact count. It is not product
completion: historical Phase 02 summaries and a seam-only Phase 07 plan count,
while user-visible success criteria in Phases 2-7 remain open.

## Verification Baseline

Latest bounded LiveLink/UX round: `UX-09B` (2026-10-03).
`UX-09B` passes the controlled normal/OBS Layer/Column browser comparison
after repairing unbounded stacked Layer height, overlapping header controls and
column keyboard resize jumps. Final screenshot review also catches normal
transport clipping; its desktop board row now reserves enough height. A definite
responsive module height breaks the
viewport/60%-row feedback; headers wrap complete control groups, the selector
shrinks within its label and UNCUT remains visible. Explicit OBS column bases
keep actual width, separator value and 24px keyboard steps consistent.

Copied real two-track UX-08B archives and one imported analysis WAV exercise
12 browser cases at 750×884, 1280×720, 1024×576 and 853×480, all DPR 1. Header
geometry/hit centers pass; Layer playhead reaches both rows; pointer resize,
240px minimum and layout width retention pass. Normal and synchronized OBS
audio play, zoom/gain work, final console is empty and six original media hashes
remain unchanged. The smaller CSS viewports are not physical Windows DPI proof.
Evidence: `docs/gates/ux-09b-timeline-layout.md`, ignored `.scratch/ux-09b/`.

Frontend **55 files / 465 passed**, 119.38s with one worker; strengthened resize
regression goes red/green, focused suite 31 passes, typecheck/build/diff pass.
Backend 500 remains the carried 12L baseline, not rerun. Scratch services stop,
test ports return to free, browser override resets and test tab closes. Owner
registry/media, native plugin and engine source remain intact.

Exact next existing round: **UX-10B**, inspect six or more live OBS sources,
REC/PAUSE, Recorder/mixer outer scroll and physical Windows DPI. Browser archive
geometry does not prove those active-capture and OS-scale behaviors. Sustained
live latency, STT accuracy and the broader LIVELINK-08 matrix remain open.
No new alphabet round or completed product phase; Voice Training is unchanged.

Existing UX-08B footage lifecycle, CAPTURE-10B and 12L/12M gates remain
historical evidence.
The historical phase baseline below remains distinct from these focused checks.

- Backend: 364 passed.
- Frontend: 288 passed.
- TypeScript/Vite production build: passed.
- `git diff --check`: passed.
- `engines/OmniVoice`: no tracked modification.

## Accumulated Context

## Decisions Made

| Phase | Summary | Rationale |
| --- | --- | --- |
| 03 | Keep `ProjectVoice` and Voice Model Set distinct | One usable artifact cannot carry a coordinated set's identity, lineage, and gate guarantees. |
| 03 | Dataset Manifest remains engine-free | Exporters may change engine shape without changing portable project truth. |
| 05 | RVC gate remains failed/partial | Speed and pitch evidence cannot override failed cross-speaker CER or missing measurements. |

## Completed Contracts

- Stabilization W0-W4; R5 declined and R6 intentionally skipped.
- Phase 01, plans 03-01 and 03-02, and seam-only plan 07-01.
- 03-03 runtime/run/export/process/GPU/progress/cancel/resume foundation.
- Individual project voices, generation/output, and an RVC live-conversion slice.

## Pending Todos

No GSD todo files. Planned work remains in ROADMAP and PROJECT-STATUS.

## Blockers

- 03-03 still lacks backend-specific threshold calibration and one real gated publish run.
- 03-04 lacks durable sessions, measured capture/QC, finalization, tier policy, and identity lock.
- No checked-in sample project supplies consented, ready audio for the real training acceptance run.
- RVC similarity, cross-gender, loopback latency, and owner blind A/B are unmeasured.
- `audioop` blocks a clean Python 3.13 upgrade; Starlette test client emits an `httpx` deprecation warning.

## Deferred Items

| Category | Item | Status | Deferred At |
| --- | --- | --- | --- |
| STT review | Final per-word candidate reconciliation | Open | Phase 02 |
| Workspace | Six-zone docking and `WorkspaceSession` | Planned | Phase 04 |
| Manipulation | Isolation, dubbing, production patch/file workflows | Planned | Phase 05 |
| Video | LipSync implementation | Planned | Phase 06 |
| Distribution | Model delivery, security adapters, installer/updater | Planned | Phase 07 |

## Session

**Last Date:** 2026-09-22
**Stopped At:** Round 03-03B complete; the gate works and fails closed while thresholds are uncalibrated. Round 03-03C is next.
**Resume File:** None
