# Round50 — immediate playhead, one-row timing and shared color rules

Date: 2026-10-17. Owner feedback on round49. One bounded stabilization round.
ADR0107 / docs/UI-COLOR-RULES.md. Phase03 remains60%.

## Reproduced and fixed

- Three actual Timeline gesture tests (playhead, waveform, transport) fail with
  transform0px after pointerDown200px; time changes but the imperative playhead
  only paints on media playback events suppressed during scrubbing. Paint the
  requested transform immediately. A second RED test sends stale media timeupdate
  and durationchange while the pointer remains down: duration metadata was still
  repainting0px. Keep duration updates, suppress that clock repaint during scrub.
  All3 gestures now update450px/time45s before pointerUp; edge RAF pans also assert
  the playhead stays under the held pointer. Audio preview semantics remain.
- Replace round49 row-based collisions with single-row distribution. IN/OUT move
  outward for short intervals; keep duration centered when space allows. Shift
  the group at viewport edges, size exact source-time strings, compact when the
  viewport cannot fit the normal monospace labels. Four initial geometry failures
  reproduce narrow/edge/long-value layouts before the fix. No numeric values lost.
- User speaker/emotion colors previously reached text without contrast checks;
  warning fills could override only background while leaving pale profile text.
  Shared resolver and semantic foreground/background pairs now govern both sides.
  Theme updates use one shared root observer, not one observer per word.
- Default/static text uses audited semantic tokens. Dynamic emotion backgrounds
  precompose onto the declared field; opaque word/field surfaces keep the CSS
  backdrop equal to the resolver input. Selection/active/untrusted/collision pairs
  override hostile inline foreground AND background. Preserve passing custom colors
  and stored settings; adjust displayed lightness only when contrast fails.
- Shared muted/subtle/clone light-theme foregrounds failed the new standard-surface
  matrix (muted3.9126:1 on sunken, subtle4.4354:1 on app, clone4.3028:1 on sunken).
  Change shared tokens; the same test now requires >=4.5 on all standard surfaces.

## Enforcement and verification

- Pure contrast/alpha tests cover hex3/4/6/8, comma/space RGB/RGBA and sRGB syntax;
  invalid foreground fallback chooses the stronger neutral. Deterministic1000
  custom-color pairs preserve passing colors and require4.5:1 after resolving.
- Emotion matrix: both themes, opacity0/.34/.5/1, four light/dark/custom backdrops,
  every configured emotion and custom extremes. Exact rendered background matches
  the composite used for foreground evaluation.
- Actual stylesheet cascade test expands the real token values and loads product
  modules/waveform/subtitle-density/contrast CSS into jsdom. Hostile inline pale
  text and amber fill must still produce readable paired states in both themes.
  CSS/resolver parity prevents duplicated theme constants diverging.
- AST guard scans direct dynamic JSX text foregrounds across product TSX and follows
  local aliases/resolvers. Its own RED fixture rejects a raw profile color. This is
  a bounded guard, not complete CSS/data-flow analysis. Existing TypeScript7 package
  exposes version only; use the existing Rolldown AST parser instead of inventing
  an unavailable TypeScript compiler API. No dependency or test timeout changes.
- Focused Script/diarization/avatar/theme cases:71pass/4files/6.75s. Color/policy
  gate31pass/5files/5.33s before adding the shared-observer lifecycle case.
- Typecheck and production build pass (182modules). No backend source changed;
  full API1149pass/551.59s,3existing/fixture warnings. Final frontend broad result:1010pass/125files/148.56s. All602API/web
  input hashes match the frozen pre-run snapshot; diff check passes.

## Browser evidence and exact limit

Private production registry Timeline using actual PCM envelope adapter / Range206
server18422, Vite18421, synthetic600s pulse WAV, pale#caed70 Speaker. At intermediate
source state, dark theme shows all three labels at top489.1875px/height12; selected
subtitle uses rgb(45,30,26) on rgb(255,180,164). CUA real drag from(702,476) to(954,476)
recorded8distinct transform updates while pointer was still held:4488,4519,4551,
4582,4614,4645,4677,4708px. UI ends00:05:16.966. An owned harness MutationObserver
records transform changes only between pointerdown and pointerup. This is direct
in-progress visual update evidence, unlike audio time state alone.

Receipt: `.scratch/timeline50/browser-proof.json`. Screenshot was displayed inline
at that intermediate check; no final screenshot was saved. Later, after the user
said continue, CUA rejected a new tab: local browser use disabled in Work settings.
The final cross-page rendered sweep and final screenshot therefore remain open;
do not call the earlier screenshot acceptance of subsequent shared-CSS edits.
Actual CSS cascade/math/React tests cover those edits separately. Four private
server sessions stopped;18421–18424 free. Shared app/runtime was not restarted.

## Remaining boundaries

Rule-based color handling and regression gates replace per-widget color guesses;
they do not establish an exhaustive accessibility audit. Native popups, raster
waveform/text intersections, gradients and every hover/focus/disabled combination
still need rendered acceptance when affected. Text/state ratios are not proof of
speaker identity, speech timing or clipping sample precision. Round48 independent
acoustic anchors, Checkpoint A and downstream processor gates remain open.
