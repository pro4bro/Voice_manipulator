# Round77 — subtitle typography and held audition

Date: 2026-10-21. Repository HEAD at start: `029c0a3`.
The checkout already contained round65–76 LipSync work. Its initial diff and
file hashes are saved under `.scratch/scrub77/`; this round adds the requested
subtitle and audition behavior without completing another product slice.

## Red evidence and fix

`python -X utf8 .scratch/scrub77/font-probe.py red` reproduces clipped Vietnamese
ink in 18/18 cases at font scales .96, 1.08 and 1.4. Increasing line height fixes
clipping but leaves the screenshot's internal gaps. The isolated shaping probe
then reproduces 11 bad tone advances, including 4.8px added by Georgia Pro at
9.6px for `tuần`, `chắc` and decomposed `chắc`. Changing only the font to Arial
removes those advances. Final production CSS passes all 18 ink/advance checks.
Text bytes and subtitle source intervals are unchanged.

Before implementation, focused web tests failed 5 cases: position offsets,
held repetition, range exposure and the missing Preference control. The API
preference roundtrip also failed because the field did not exist. Logs:
`red.log`, `api-red.log`, `font-red.json`, `font-shaping-red.json`.

ADR0126 records the implementation: three persisted positions, center default,
120ms grains, source/removed-region clipping, held repetition, faint shared-bounds
overlays and cancellation/release cleanup. Existing auto-pan and normal playback
positions remain on the pointer clock; the audition media clock starts earlier
for center/end modes. Four existing multitrack/OBS test cases now explicitly
expect that 60ms centered offset and still check exact logical position on release.

## Verification

- Focused initial integration suite: 183 tests / 6 files passed before the final
  metadata guard; current full-suite results are recorded below.
- Headless Chromium, real HTMLAudioElement and an owned 8s mono PCM16 WAV at
  24kHz, peak 6000/32768: all three positions repeatedly start at their expected
  5.000 / 4.940 / 4.880s anchors while held, share overlay bounds and stop on
  release. Final media clock restores to 5s, overlay disappears, no new play calls
  appear afterward and no page errors occur. `audition-browser.json` and
  `held-end-preview.png` hold evidence. This isolated fixture does not provide
  a production PCM-envelope endpoint; the image proves typography and overlay,
  not successful loading of a real project waveform.
- Font probe checks actual Windows browser shaping/ink metrics at three CSS
  scales, including composed and decomposed Vietnamese. `font-green.json/png`
  hold the corrected results; the ordinary dark Timeline also renders them in
  the real-media probe. Physical Windows DPI modes are not claimed.
- Regression tests cover multi-channel silence/mute/rate preservation, removed
  boundaries, empty source endpoints, sub-millisecond timer bounds, late play
  promises, old preference defaults, save/reopen, validation and source cleanup.
- Preservation audit: 75 unrelated initially changed/untracked files retain
  their exact SHA256; 365 prior added lines in the shared source/ledger bodies
  remain present. The two current-activity metadata fields advance to round77;
  the previous round76 body remains intact. `preservation.json` holds the audit.

| Final gate | Result |
| --- | --- |
| `npm test` from `apps/web` | 1175 passed / 145 files, 170.64s |
| `npm run typecheck` | Pass |
| `npm run build` | Pass, 205 modules |
| Root `.venv/Scripts/python.exe -m pytest services/api/tests -q` | 1232 passed, 3 existing warnings, 606.48s |
| `git diff --check` | Pass |

Final logs: `frontend-verified.log`, `typecheck-verified.log`, `build-verified.log`
and `api-final.log` under `.scratch/scrub77/`. The first full frontend run exposed
floating-point delay rounding and an empty-endpoint clock regression; both were
fixed without relaxing their assertions, followed by the green full runs. The
final metadata guard also has its own short/unloaded multitrack regression case.
No timeouts, skips or assertion thresholds were relaxed. The API warnings are
the existing Starlette/httpx and audioop deprecations plus a duplicate-ZIP fixture.

## Limits

The browser probe exercises an isolated source fixture; it does not claim native
installed-portable or second-device acceptance, perceptual listening quality or
new engine/model artifacts. Existing media and upstream engine code are untouched.
The original LipSync edits remain in the shared checkout. No portable was issued
in this round. Phase03 stays at 60%; the existing Phase06 gates remain open.
