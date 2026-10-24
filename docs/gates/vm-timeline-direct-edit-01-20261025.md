# VM-TIMELINE-DIRECT-EDIT-01 verification — 2026-10-25

## Delivered

Removed the bottom selected-clip form. Top Timeline toolbar now operates on the
Version composition: selected Cut/Uncut/Delete/Reset and Move up/down. Pointer
drag transfers vertically with capture/cancel and layer edge scrolling. Timecode
and source range stay locked. Master is taller; layers scroll vertically and
share horizontal zoom/pan with Master/subtitles. Script Enter/paste and typed
speaker-looking labels no longer auto-split rows; transcript rows follow speaker
turns from dedicated diarization or manual/Profile assignment.

ADR0144 and `docs/VOICE-VERSION-LAYERS.md` define semantics, migration and limits.
Implementation commits: API `b189e5e`, frontend `8c928a4`.

## Automated evidence

- `npm test` from `apps/web`: final full run **164 files, 1315 tests passed**,
  186.63s; log `.scratch/vm-direct-edit-final-frontend.log`.
- Final focused Script/domain/layer/toolbar/integration run after the last Script
  boundary regression: **6 files, 53 tests passed**, 7.57s.
- Final `npm run typecheck` passes. Final `npm run build` passes, **229 modules**.
- First frontend full run: 1314 pass / one unchanged OBS RAF queue test failed.
  Exact isolated retry passes; final full run above also passes. No test skipped
  or weakened to resolve it.
- Full `.venv/Scripts/python.exe -m pytest services/api/tests -q`: **1615 pass,
  1 fail, 3 warnings**, 912.25s. Failure is the existing VibeVoice embedded Python
  import exceeding its 60s subprocess timeout. Isolated retry also times out:
  **1 fail, 1 warning**, 61.07s. The full backend gate is therefore not green.
  Timeout and runtime/import implementation are unchanged in this round.
  Node: `services/api/tests/test_vibevoice_streaming.py::test_embedded_runtime_imports_streaming_package_from_the_correct_checkout`.
- Final focused backend composition/Version/session/lifecycle checks after the
  UNCUT priority correction: **56 passed**, 2 warnings, 20.01s.
- Lead reviewed the diff and `git diff --check` passes. UNCUT regression covers
  overlapping clips between otherwise contiguous pieces, preventing priority
  changes. Clone/reset source retention and generation baseline behavior tested.

## Browser and real media evidence

Owned isolated project only: `.scratch/vm-script-layer-ux-uat`, served on local
port18129 by `.scratch/vm_script_layer_ux_server.py`. Synthetic mono PCM16, 24kHz,
120000 frames/5s; no model generation or owner media changes. Readiness responses
are fixture responses and are not evidence of engine/model readiness.

- Native toolbar CUT at2.501s splits Full. UNCUT restores one piece. Both WAVs
  preserve the original PCM exactly. DELETE right piece leaves silence after it
  except the still enabled Fix at3–4s. RESET restores Full plus both disjoint Fixes.
- Native captured drag moves Full from layer1 to2, preserving clip ID, source,
  timeline start0 and120000 frame count. Same-layer priority changes actual mix.
  MOVE up restores the original mix exactly. Edge scrolling occurs during drag.
- Eight additional empty fixture layers verify a10-layer vertical list. Scroll
  reaches Layer10 (`scrollTop559`) and horizontal wheel pans Master/layers
  (`scrollLeft1056`). Reset restores the saved two-layer generation arrangement.
- Master waveform measured112px high (previous layout70px). Dark/light checked
  at1864×900, with1280×720 scrolling also exercised. One top ruler; bottom
  navigator/transport remain visible; no bottom form.
- Native paste of multiline Vietnamese text with `An:`/`Bình:` prefixes, blank
  lines and tab plus Enter preserves two preexisting rows. Text mode append of a
  speaker-looking label stays in row2. Original fixture text restored afterward.
- `.scratch/vm-direct-edit-uat/{before,cut,uncut,deleted,reset,moved,moved-back,final}`
  hold JSON/WAV evidence. All source SHA256 values remain unchanged. Final/reset
  WAV SHA256: `9c8917bbee188a089755b536df40b1511d7772987ade4f016a71d6ea3924d5b6`.
  Delete WAV: `43f958fc85ca0ed3ca7abe05cbfc8d1fb9bf85079402df9c0e24551165768a9f`.
  Moved WAV: `cca34d70289f1ebf96fccb14ae01df6747e846f6ffe0f3dfe697ac2b2b28c1f0`.
- Screenshots: `.scratch/vm-direct-edit-uat/dark.png` and `light.png`.

## Remaining gap

Unrelated VibeVoice import timeout remains unresolved; real-model listening is
still outside this synthetic UI/composition round. Horizontal clip positioning
awaits the owner's future behavior decision. Legacy RESET can only restore the
arrangement present at migration. Phase03 remains60%; Phase06 remains open.
