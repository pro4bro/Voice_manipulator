# VM-SCRIPT-LAYER-UX-01 — 2026-10-24

## Delivered

Script generation activity is in the right settings column. Row Profile changes
and unassignment work directly; only explicit checkboxes open bulk actions.
Version snapshots drive strong pending/faded fixed highlights, including timed
words, deletion anchors and edits made while a Fix runs. Full resets snapshots
and old Fix layers. Disjoint Fix regions remain separate clips at their known
text coordinates; uncertain timing retains the existing whole-row fallback.

Master/subtitles/layers use the same measured zoom/scroll/playhead. There is one
top ruler and a bottom navigator/transport. Each clip requests its real source
IN/OUT waveform, displaying only its upper half. Layer number/Mute/Solo are shown.
Transfers preserve timecodes, source IN and frame count; horizontal displacement
is rejected by the API. Composition replacement retains the open Version's view.

## Automated evidence

- Final `npm test`: **163 files, 1307 passed**, 195.35s.
  Log: `.scratch/vm-script-layer-ux-final2-frontend.log`.
- Final `npm run typecheck`: pass. `npm run build`: pass, **228 modules**.
- Root `.venv/Scripts/python.exe -m pytest services/api/tests -q`: Worker run
  **1607 passed, 1 failed, 3 warnings**, 879.73s. The sole failure was
  `test_vibevoice_streaming.py::test_embedded_runtime_imports_streaming_package_from_the_correct_checkout`
  at its existing 60s timeout. The exact test alone passed in **20.36s** with one
  warning. This is the previously recorded suite-contention import failure;
  the full API gate is not represented as an all-green run.
- Lead final focused API command on `test_voice_composition.py`,
  `test_voice_output_sessions.py`, `test_voice_version_fix.py` and
  `test_voice_version_generation.py`: **55 passed, 2 warnings**, 18.94s.
  Log: `.scratch/vm-script-layer-ux-final-backend.log`.
- `git diff --check` and staged diff checks: pass.

## Browser and artifact evidence

An isolated HTTP app on port18129 used an owned synthetic sine-wave project under
`.scratch/vm-script-layer-ux-uat`; no owner media, model or production project was
edited and no speech model inference was started for UAT. Its temporary runtime
status response described the test server only.

- Real browser verified direct Speaker switch and unassignment, model clearing,
  no bulk toolbar on selector use, and one top ruler/zero duplicate layer rulers.
- At zoom2, Master and layer canvas both measured **3296px** at the desktop
  breakpoint. Earlier 1280px viewport verification measured both **2128px** and
  both track starts at **199px**. Solo/render replacement retained zoom2.
- Tested dark/light at 1864×900 and the default 1280×720. The layer pane scrolls
  independently while navigator/transport remain below it. Temporary viewport
  and theme overrides were reset and the temporary tab closed.
- Browser moved the `bright` clip from Fix1 to Full and back, retaining
  **1.000–2.000s**, SourceIN0 and one-second source duration. Start is read-only.
- Two same-row regions occupied **1–2s** and **3–4s** in one Fix layer. Browser
  DOM reported faded `bright`/`dream` and pending `village` after reopen.
- HTTP WAV is **mono PCM16, 24kHz, 120000 frames/5s**. Five interior samples across
  Full/Fix/Full/Fix/Full intervals match the selected immutable source samples.
  Solo also produced silence outside the selected Fix regions. Source WAV
  SHA-256 values remained unchanged after Solo and layer transfers.
- Final Full+Fix download SHA-256:
  `9c8917bbee188a089755b536df40b1511d7772987ade4f016a71d6ea3924d5b6`.
  JSON, WAV and dark/light screenshots remain in that owned evidence folder.

## Limits and closeout

Legacy manifests have no recoverable historical Full text; their last generated
snapshot initializes the baseline, so faded highlights for pre-upgrade Fixes
cannot be reconstructed. Source word timing must be trusted and text-matched for
small-span Fixes; otherwise the existing safe row fallback remains. Synthetic
PCM validates composition and UI, not a speech engine's acoustic quality.

API commit `412c4ac`; frontend commit `0a8e763`. ADR0143 and
`docs/VOICE-VERSION-LAYERS.md` record the contract. Phase03 remains60%, Phase06
open. This bounded round is complete; stop here.
