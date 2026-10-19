# Round61 — TIMELINE-EDGE-SPEAKER-01

Date: 2026-10-19. Baseline: `d6d8fdc`. One bounded stabilization round.

## Owner requirements and implementation

- Accelerate edge dragging by pointer band: 10% viewport width/sec at90%/10%,
  20% at95%/5%, 30% at100%/0%, and40% outside. Interior10%–90% does not auto-pan.
  Exact intervals and symmetry are specified in ADR0118. Keep source boundary
  exceptions, safe playhead holding, fractional frame progress and cancellation.
- Explain/fix the orange-to-green subtitle line after the playhead passes.
  This was not a Speaker Profile change: the old orange manual-timing bottom
  border was overwritten by `.is-past` green border paint. Ordinary words also
  omitted the speaker underline property supplied to manual text.
- Apply the assigned/inherited profile to the bottom edge of all readable
  subtitle boxes, independently of playback/selection/warnings. Explicit null
  assignments remain unassigned. Move manual timing paint to the orange top
  edge and document both cues in Note. Blue manual-text classification remains.

No saved word timing, project format, user media, engine/backend source, models
or dependencies changed. No portable package issued. Shared drag acceleration
also reaches promoted word timing, imported multitrack and archived OBS; full
overview transport and live follow retain their current semantics.

## RED evidence

`npm test -- --maxWorkers=1 src/modules/timeline/drag-autoscroll.test.ts
src/modules/timeline/SubtitleFeedback.test.tsx` failed3/passed19 before the fix:

- Outside scroll moved20px instead of80px for a200px viewport.
- A single held drag changing to95% reached22 source seconds instead of23.
- Ordinary/inherited profile underline property was empty instead of`#caed70`.

Log: `.scratch/edge61/red.log`. Browser computed CSS independently reproduced
the reported effect before editing production code: edited normal word bottom
changed from`rgb(255,103,69)` to`rgba(143,180,59,.35)` on `.is-past`; its speaker
cue property was empty. Manual text already retained its profile border.
Evidence: `.scratch/edge61/speaker-red.json`.

## Verification

| Check | Result |
| --- | --- |
| Focused six-file timeline/menu suite, `npm test -- --maxWorkers=1` | **138 passed**, 30.41s |
| Full `npm test` | **1130 passed / 136 files**, 149.48s |
| `npm run typecheck` | Pass |
| `npm run build` | Pass, 191 modules, 936ms Vite build |
| Root `.venv/Scripts/python.exe -m pytest services/api/tests -q` | **1207 passed**, 3 warnings, 677.64s |
| `git diff --check` | Pass |

Logs under `.scratch/edge61/`: `focused.log`, `frontend.log`, `typecheck.log`,
`build.log`, `api.log`.
The API warnings remain Starlette/httpx deprecation, audioop deprecation and an
intentional duplicate ZIP entry fixture. No gate retries or suppressed failures.

New speed matrix covers15positions ×3viewport widths ×3source spans, including
exact thresholds and both sides. A single RAF drag changes bands, direction and
returns to the interior; release stops it. Round60 source-boundary/resize tests
remain. No timeouts, worker limits, skips or assertion thresholds were weakened.

### Intentional updates to existing speed tests

- First-band tests now point at92.5%/7.5% rather than95%/5%, retaining their
  exact100px/sec and source-time assertions. The fractional accumulation test
  likewise moves from98.75% to92.5% to keep its original80px/sec check.
- Ordinary playhead/waveform safe-edge tests and promoted middle-button timing
  tests retain their outside pointers and now assert400px/sec instead of100.
- Imported and archived OBS first-band tests retain their original ruler,
  playback target, release and click-suppression assertions at92.5%.

These inputs/expectations change because the owner explicitly changed the speed
contract. Existing tests were not deleted or made less precise.

## Browser CSS evidence and limits

Isolated source Timeline fixture `apps/web/.scratch/edge61.html/.tsx`, served
on port18443 with round60's range-capable synthetic WAV fixture. Actual browser
computed styles cover2themes ×4states (before/active/past/selected) ×4words:
assigned green timing edit, inherited orange, blue manual text and explicitly
unassigned timing edit. All32bottom-border checks retained the expected profile
color or transparency. Orange edited top edges remain across states; blue text
uses state/theme-aware foreground/background pairs. Speaker assignments were
never mutated by the playhead.

Evidence: `.scratch/edge61/speaker-green.json`, `speaker-after-dark.png`.
This proves actual CSS cascade and React state painting. Speed checks use mocked
RAF clocks/geometry, not a claimed native held mouse capture acceptance run.
Installed portable UAT remains separate. Only the owned test tab/server are
closed after verification; no user project or user-owned tab is edited.

Manual diff review covers thresholds, symmetric direction changes, physical
source limits, inherited/explicit-null profile semantics and stable state paint.
Phase03 stays60%; existing acoustic/Checkpoint A/provider/device/full processor
acceptance gates remain open.
