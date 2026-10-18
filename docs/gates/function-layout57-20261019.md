# Round57 — VM-FUNCTION-LAYOUT-01

Date: 2026-10-19. Baseline: 7c85ef10f127f667725c6532f8ef89da7a6585e7.

## Scope and boundaries

Left-edge VO/VP/VD/VI/LT navigation, function-specific right panels, Script settings
dock, provenance-based VO/VP output badges and compact multitrack column headers.
OmniVoice remains the primary generation family. OPEN-ENGINE-WORKFLOW-PLAN.md
records authorized future provider integration; this round installs no new
models, performs no ASR/TTS inference and does not claim new processors ready.
No backend implementation, model, PCM or saved project format changes.

## Regression and focused checks

- Script dock RED: the right-column target did not contain the settings group;
  GREEN: the same document accepts a sentence duration edit through the portal,
  Script remains editable and settings are outside its section.
- Prefix RED: no VO-prefixed accessible result existed. GREEN: VO/VP badges come
  from processor lineage, clicking returns the original output object and stored
  names remain unchanged. Malformed/null lineage does not classify as Patch.
- New navigation/prefix files initially failed import resolution before their
  implementation existed; after implementation their behavior checks pass.
- Focused five-file navigation/dock/prefix/output/manifest run:21passed,9.24s.
- Workspace/Script/registry focused run:88passed/4files,25.58s. Includes switching
  tabs without clearing Script, direct VO action rejection in another function,
  and returning to the existing VO controls. The old manifest expectation is
  updated only to reflect the requested ordering/new LT tab and planned status.
- Imported/OBS header containment RED before wrapper; GREEN2cases; complete
  two-file focused timeline run96passed. Existing mix/audio/scrub behavior tests
  retained. Worker typecheck initially found Element versus HTMLElement in a test;
  corrected the test type; typecheck passes.
- Read-only worker review found no concrete regression in navigation, dock,
  generation guard or result provenance. No skips/timeouts/quality thresholds
  added to the production test suite.

## Browser evidence

Own Vite dev server18441 and ignored fixture `apps/web/.scratch/dock57.*` use
actual WorkspaceShell/registry/Script/Timeline components and memory-only API
fixtures. The production controller was unavailable502; no shared runtime restart
or real-project writes were performed. An initial incomplete fixture activity
response caused an exception; supplying its real `{tasks,events,seq}` shape fixed
the fixture. This is not a live backend acceptance run.

- Desktop1440x900: left function tabs, full-height Script and right settings dock
  render. VO→VD→VP switches panels while retaining both Script rows. Planned VD
  exposes its actual unavailable state and no VO start action.
- Select row2, open structure settings, edit duration3.5s, switch to VD: the same
  duration stays3.5 and the dock identifies row2. The dock is inside the right
  column horizontally; that column scrolls to all setting groups.
- Dark/light themes inspected. Result fixtures display distinct VO and VP badges.
- Imported multitrack CỘT desktop: both headers are42px high and all four control
  bounds stay inside each header. Gain is above Level, labels at left, M/S vertical.
- Narrow640x900: each header281.984px wide,42px high; every control remains inside.
  Real mouse Mute/Solo toggles update labels/pressed state; Gain keyboard ArrowRight
  changes100→101. LAYER retains the compact left mixer arrangement.
- Screenshots `.scratch/dock57/workspace-dark.png`, `workspace-light.png`,
  `track-columns-dark.png`, `track-columns-narrow.png`. Fixture audio is synthetic
  waveform data; these checks do not establish audio quality or latency.

## Full verification

675 source/test/script input hashes frozen in `.scratch/dock57/frozen-inputs.json`.
Full frontend/typecheck/build and API output is retained in that directory.
Final source d3062ca: frontend1109passed/136files in312.67s; typecheck passes;
build191modules passes; API1150passed in608.09s with3existing/fixture warnings
(Starlette/httpx, audioop deprecation, intentional duplicate ZIP entry fixture).
All675 frozen source/test/script hashes match after completion. Diff check passes.
No full-gate retry, timeout increase or test/assertion weakening. These results do
not replace human listening or live device/provider acceptance. The OBS header
shares the implementation and has focused test coverage; real OBS device UI and
audio acceptance is not established by the imported-track browser fixture.

## Remaining gaps

New VibeVoice-ASR/CosyVoice/Sokuji/w-okada providers remain integration work with
real model/audio/device gates. VD/VI/LT are navigable preparation workspaces, not
completed processors. New exported filename prefixes and actual VD/VI/LT result
lineage belong to those processors. Existing source timing acoustic acceptance,
Checkpoint A and downstream processor gates remain open. No portable issued here.
