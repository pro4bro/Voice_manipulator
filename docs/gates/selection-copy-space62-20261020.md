# Round62 — SELECTION-DUPLICATE-SPACE-01

Date: 2026-10-20. One bounded Script/Timeline feedback round.

## Owner requirements

- Hide footage content, waveform and transport detail in Script and Timeline
  until footage is selected.
- Alt plus left drag duplicates one or several selected subtitle words, shows
  translucent copies above the subtitle while dragging, and drops them at the
  pointer position.
- Space plays or pauses the Timeline.

## Implementation and limits

The module registry gates unselected footage views, including stale take data.
Opening footage or a selected OBS recording restores the existing surfaces.
Voice Manipulator, Voice Changer and an active Reading Session keep their own
source context. Ordinary and imported Timeline playback use a scoped Space shortcut;
the OBS overview already supported it.

The copied subtitle starts at the exact drop time and carries relative word
spacing. Existing words are retained. Occupied suffix timing ripples right and
is marked untrusted together with the copies; source intervals remain in
`sourceTiming`. The Script text is updated in the same operation. A drop that
cannot fit before the footage end is rejected with an error. This operation
does not synthesize or modify audio, so the new cues require timing review.

## Verification

| Check | Result |
| --- | --- |
| Focused Timeline, imported Timeline, registry and word-timing tests | 88 passed / 4 files |
| Full frontend `npm test` | 1138 passed / 136 files, 165.48s |
| `npm run typecheck` | Pass |
| `npm run build` | Pass, 191 modules |
| Root `.venv/Scripts/python.exe -m pytest services/api/tests -q` | 1207 passed, 3 warnings, 663.29s on full retry |
| `git diff --check` | Pass |

Focused tests cover empty selection even with stale take data; exact drop time,
group spacing, occupied suffix provenance, out-of-bounds rejection, ghost before
release, Script text and punctuation, Escape cancellation and ordinary/imported
Space toggles. No browser pointer-capture or installed-portable acceptance is
claimed in this round. No source media, models, project schema or engine code
changed. Phase03 remains at 60%; acoustic/provider/processor gates are separate.

## API retry evidence

The initial full API run passed 1206 tests and timed out once in
`test_embedded_runtime_imports_streaming_package_from_the_correct_checkout`
after its fixed 60-second subprocess deadline (3 warnings; 797.49s). No UI code
participates in that test. The exact test passed alone in 20.17s, with one
existing warning. The unchanged full suite retry passed all 1207 tests in
663.29s with 3 warnings. No assertion or timeout was relaxed.
