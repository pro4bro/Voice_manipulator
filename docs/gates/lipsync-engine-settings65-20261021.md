# LipSync engine source/settings gate — round 65 — 2026-10-21

## Delivered

Three upstream Git checkouts are installed under ignored `.runtime/engines/lipsync`.
Origins and commits are recorded in `.runtime/open-engines-install.json`:

| Checkout | Commit |
| --- | --- |
| MuseTalk | 0a89dec45a0192b824e3cf4daf96c239440c5ed8 |
| LatentSync | a229c3948406bc2cf6eaf4873e662e70c6a04746 |
| Wav2Lip | bac9a81e63ecc153202353372e5724b83d9e6322 |

The provisioner supports repeatable `--repo` selection and merges repository
receipts without losing previously installed entries. A second run verified all
three origins/commits. All three checkouts have clean Git status. The earlier
hardlinked research/MuseTalk snapshot remains intact.

Task-scoped catalog entries feed three choices on LipSync's right column with
source presence, blocked render status and usage notes. Selected-engine settings
reuse ParameterForm groups, validation, independent session drafts and reset.

| Engine | Implemented settings UI |
| --- | --- |
| MuseTalk | version, offline/realtime mode, bbox shift, extra margin, parsing mask, cheek widths, audio context padding, image FPS, batch, GPU ID, offline float16, coordinate-cache switches, realtime skip-save-images |
| LatentSync | inference steps, sync guidance, seed and DeepCache |
| Wav2Lip | static frame, image FPS, resize factor, rotation, no-smoothing, detection/inference batch sizes, four padding values, four crop values and four constant-box values |

Specs cite source commits. MuseTalk batch defaults follow offline 8/realtime 20.
Paths for checkpoints/configuration/input/output and the bundled VAE family
belong to installation/project resolution. Training and benchmark programs,
realtime avatar preparation, custom model registration and actual invocation
are not implemented by these panels. Wav2Lip vector/frame validation is part of
the later adapter; current numeric fields alone are not render approval.

The authorized implementation plan is `docs/LIPSYNC-IMPLEMENTATION-PLAN.md`,
with stable LIP-01 through LIP-06 requirements and local `.scratch/lipsync` tasks.
It specifies visible top-layer intervals, recurring face identities with manual
correction, Speaker Profile/voice-turn mapping, multi-face composition and
selective re-render after Voice Over edits. ADR0122 records the boundary.

## Verification

- Final frontend: 1,148 tests passed in 139 files, 157.91 seconds. Focused
  settings/workspace: 5 passed across 2 files, using shipped descriptor values.
  Tests exercise separate drafts, resets, invalid numbers, realtime batch default
  and conditional controls while render remains disabled.
- Typecheck and production build passed; Vite transformed 196 modules.
- Final full API suite: 1,211 passed, 3 existing dependency/fixture warnings,
  580.25 seconds. Catalog/default and provisioning tests are included.
- Three upstream checkouts and engines/OmniVoice have clean status;
  git diff --check passed. Runtime/model assets are excluded from Git.
- Test integration fixes: added the catalog API to WorkspaceShell's mock;
  placed filesystem-backed descriptor tests in the existing JSX test convention
  rather than adding Node-only types to the browser TypeScript configuration.

## Remaining acceptance

Generate/After/face replacement stay disabled. No checkpoints, isolated runtime,
face model, analysis, persistent composition or rendered output is claimed.
No visual browser or real-media quality acceptance was performed this round.
Next: portable multi-clip/layer editing with a shared Preview/render visibility
schedule, then the first real engine artifact gate. The full multi-person flow
is not yet runnable from the page.
