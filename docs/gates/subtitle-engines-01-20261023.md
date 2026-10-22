# SUBTITLE-ENGINES-01 — selectable subtitle alignment engines

Owner request: integrate MFA, stable-ts and EasyAligner into Input's right-column
subtitle refinement panel, with engine selection, separate settings and explicit
Start. This named bounded round is independent of the concurrent expressive
rounds92–96; it does not advance their phase/progress or claim their completion.

## Implementation

- Always-visible selector, engine-local parameter values, missing runtime/model
  reasons, selected-word scope and manual locks. Selection/parameter changes
  invalidate pending ghosts and fence late responses.
- New `/subtitle-alignment/engines` and `/engine-preview` routes use strict
  per-engine schemas. They preserve prior alignment endpoints.
- Private offline CPU workers use existing transcript words, measured boundaries
  and nullable failures. No STT call, invented fallback boundaries, text changes,
  or automatic source edits. Source hash/count/order, movement bounds and stale
  source checks are enforced before publication and Apply.
- Existing ghost/Apply/Restore UI and receipt path are reused. Collisions with
  changed and unchanged words remain visible. Optional old offset/waveform rules
  start disabled and use the selected engine's evidence.
- Setup pins weights/revisions and verifies Whisper SHA256 plus HF LFS/Git blob
  hashes. Critical runtime files/metadata match a successful import probe receipt.
  Catalog checks cheap verified stat receipts; dispatch hashes weights again.

## Verification recorded during development

- Initial route/adapter RED:10 expected failures (missing endpoints/module).
- Core alignment/logic/methods + new engine tests:70 passed at that point.
- New engine/MFA/neural worker tests:30 passed at that point.
- Neural setup checksum tests:4 passed. Updated engine + setup:19 passed.
- Manual-lock mutation in an isolated in-memory module is rejected by the real
  scoped/manual regression test (`review != locked`); working source unchanged.
- Frontend panel/registry worker check:9 tests, typecheck passed.
- Final source typecheck/build after UI validation correction:passed,214 modules.
- First full frontend run:986 tests/147 files passed,4 worker bootstrap timeouts
  (no tests executed in those four files). Full serial repeat:1229 passed/1 failed across151 files,450.92s; the light
  Timeline CSS case exceeds its unchanged5s timeout. That case plus the two new
  panel/registry files pass in a focused13-test run (6.60s). Later focused
  attempts also encountered worker bootstrap timeouts before running panel tests,
  with both forks and threads. No case/assertion/timeout was weakened. The whole
  frontend gate is not green.
- Final related API check:103 passed/1 warning in7.78s, including the final CPU-profile setup checks.
- Final panel/registry check after setup completed:9 passed/2 files in5.60s; no worker bootstrap error in this run.
- Final MFA setup-only check:16 passed, including CPU/GPL profile rejection without mutation.
- Full API snapshot:1454 passed/6 failed/3 warnings in1283.63s. All six failures
  concern asynchronous/process timing outside subtitle alignment: Context Patch
  completion, controller bind, OBS finalize acknowledgement (0.328s vs0.3s),
  PowerShell catalog startup, VibeVoice embedded import, Voice Changer worker boot.
  Isolated repeat:5 passed/1 failed in77.73s; VibeVoice still exceeds its unchanged
  60s import limit. Logs: `.scratch/subtitle-engines/api-full.log` and
  `api-isolated.log`. The complete backend gate is not green.

## Real media and model evidence

Fixture: first8s of the existing read-only local analysis voice,25 transcript
words. Copy SHA256 `6cabc77b7758d6306402b0efa5a2f6f1f9c15ad4279df44bff1a6ee30c8eb6c3`.
Source copy is PCM16 mono24kHz; neural workers deliberately resample to16kHz
in memory and record derivative PCM hash/sample count. Files under
`.scratch/subtitle-engines/fixture` are ignored; original media remains untouched.

| Engine | Real worker evidence |
| --- | --- |
| stable-ts2.19.1 | Official Whisper base, CPU, Refine enabled/precision0.1:25/25 measured words,27.52s inference; exact source word sequence/hash retained. |
| EasyAligner0.3.3 | Pinned Apache Vietnamese Wav2Vec2:25/25 measured words,8.77s inference; exact source word sequence/hash retained. |
| MFA3.4.3 | Vietnamese MFA v3, CPU Kaldi:25/25 measured words,13.66s warmed run. Raw output has39 intervals; only14 explicit `<eps>` gaps are filtered, then exact word correspondence is required. |

These counts establish measured artifact production, not timing accuracy.
Overlapping voices and ambiguous boundaries require listening and comparison to
the owner's corrected reference. No accuracy percentage or learned offset rule
is claimed. A preview can include imperfect high-score proposals.

## Browser verification environment

Private scratch project at `.scratch/subtitle-engines/browser-data`, served on
127.0.0.1:18589 using the real app/API and built frontend. A scratch-only wrapper
supplies read-only launcher status so no managed runtime is restarted. Product
source/model calls are real; this status fixture is not acoustic evidence.
Observed separate forms/parameters and unavailable guards, then all three engines
available after setup. Real UI runs:stable-ts24 changed/1 manual locked,
EasyAligner23 changed/1 manual locked, MFA24 changed/1 manual locked. Conflicts
with changed/unchanged words were shown. The fixture has one deliberately manual
word:its text/start/end/source remain unchanged through Apply. Its trust flag
becomes false while a new neighbor overlaps it, as the existing quality reconciler
requires. Restore returns the exact original words/text. Audio SHA stays unchanged.
Screenshot: `.scratch/subtitle-engines/stable-ghost.png`; proposal/input/output
receipts are in the scratch project jobs folder. No owner project was modified.

## Result and remaining gap

The three-engine selector, parameter dispatch and reversible preview workflow are
implemented and verified on real local voice through all three providers. Both
private runtimes and VI/EN assets are installed on this workstation; English
acoustic quality is not benchmarked. MFA setup uses the published release sizes
and acoustic ZIP CRC because the official release API supplies no asset SHA
digest, and records local SHA receipts for later checks. LGPL FFmpeg and CPU
Kaldi/PyTorch profiles are explicit. Model/runtime folders stay outside Git.

Full-app timing/bootstrap gates remain non-green as described above; this round
does not fix unrelated runtime startup tests or change their limits. No portable
release or benchmark-level word-timing accuracy is claimed. Existing expressive
rounds92–96 retain their own status and work. Owner timing/reference comparison
across overlapping voices remains further evaluation, not a learned rule.
