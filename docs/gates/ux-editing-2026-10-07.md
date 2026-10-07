# Import, organization and time-aware editing gate — 2026-10-07

Scope: the nine rounds in `docs/UX-EDITING-PLAN-2026-10-07.md`, authorized by
the owner to run together. Older phase, recognition and physical acceptance
budgets retain their meaning. Original media and upstream engines are preserved.

## Delivered behavior

- Multiple native/upload files, app cache-choice dialog, individual pending,
  caching and failure rows, and additional import batches while work continues.
- Portable virtual folders/subfolders, manual footage order and drag moves;
  per-project save generations prevent stale responses losing new organization.
- Explicit table/prose switch, exact native text/selection overlay, inline and
  context editing, copy/paste, and Find/Replace. Explicit word edits preserve
  the correct remaining anchor even when adjacent words repeat.
- Unchanged anchors and punctuation survive; deleted words lose their timing.
  Insertions between anchors interpolate evenly with small gaps, retain
  unverified provenance, pulse and provide a delayed status explanation.
- Recognizer word spacing preserves original boundaries in `sourceTiming`.
- Shared subtitle inline edit/insertion and Script synchronization; middle-click
  promotion, waveform IN/OUT placement, audition, advance and cancellation.
- Persisted working range/cut sections, gray excluded source time, playback skip,
  non-destructive restoration, and matching processor/dataset exclusions.
- Right-edge object-list scrolling and blank selection gutters. Blocking STT
  publication/mapping work runs outside the API event loop.

## Automated checks

Implementation checkpoints (subsequent integration fixes remain separate commits):

| Round | Initial checkpoint |
| --- | --- |
| IMPORT-UX-01 | `a5bfbb9` |
| MEDIA-ORG-01 | `046b23b`, stale-save `a3346e8`, import/delete lifecycle `f9eaed1` |
| SCRIPT-EDIT-01 / WORD-EDIT-01 | `5ad7438`, duplicate/punctuation follow-up `23ac3cd` |
| WORD-GAP-01 | `5091e34`, retained-boundary regression `a20be98` |
| TIMELINE-EDIT-01 | `0967ee4`, archived wrapper integration `60af5f2`, OBS toolbar/context `9907b04`, imported toolbar `b113a45`, gain units `dbbb0db` |
| TIMELINE-RANGE-01 | backend `b9fe2ee`, shared editor `0967ee4` |
| LIST-UX-01 | `61a9980`; event-loop regression in `b9fe2ee` |

Final frontend: `npm --prefix apps/web test -- --run`:
**550 passed in 62 files, 19.24 seconds**. Typecheck and production build pass;
105 modules, CSS `index-Di3u7sx1.css` 244.96 kB and JS `index-BCCe06nA.js`
736.51 kB. Logs: `.scratch/ux-editing/frontend-final.log`,
`typecheck-final.log` and `build-final.log`. Normal `git diff --check` passes.
Backend: `.venv/Scripts/python.exe -m pytest services/api/tests -q`:
**588 passed, two existing deprecation warnings, 163.60 seconds**.
Log: `.scratch/ux-editing/backend-final.log`.

Regressions include duplicate-word anchor identity, retained punctuation,
untrusted interpolation, seam mapping at compact interval boundaries, dataset
exclusion walls, generated-output compatibility, asynchronous publication,
queued imports, folder races, promotion/drag and partial Uncut restoration.

An initial complete backend run exposed generated assets without
`working_range`; compatible defaults were restored, focused tests passed and
the entire backend was rerun. A frontend integration assertion also needed the
new explicit word argument in its mock. These failures are retained in local
logs; final results are from a fresh complete run.

OBS focused validation also exercised the shared editor's mount-reset event
alongside the two promotion events; its assertion now distinguishes that reset.
Rendering an archived empty transcript uses an empty word list, matching the
subtitle insertion contract. The focused OBS/common editing set passed 40 tests.
The final imported/OBS wrapper set passed 47 tests. Browser review caught an
archive gain-unit mismatch: 100 percent was reaching the common editor as
100 dB. Both wrappers now convert preview percentages to dB and back, including
zero and mute; regressions verify 100 percent = 0 dB and +6 dB = 199.526 percent.
The entire frontend suite was rerun after this repair.

## Real PCM evidence

`.scratch/ux-editing/pcm-proof.json` records actual bundled FFmpeg execution
through `MediaImportProcessor._prepare_processing_audio` and the diarization
audio adapter. No recognizer/model was invoked for this proof.

Synthetic source: 10 seconds, stereo 48 kHz PCM s16, working [2,8], removed [4,6].
Both derivatives retain [2,4] + [6,8], exactly four seconds:

| Artifact | Format | Frames | Correspondence |
| --- | --- | ---: | --- |
| STT processing WAV | mono 24 kHz PCM s16 | 96,000 | Retained source tone sequence; peak errors 0.25 Hz within 0.5 Hz FFT half-bin tolerance |
| Diarization WAV | stereo 48 kHz PCM s16 | 192,000 | Exact retained source sample bytes |

Source SHA-256 remains
`d1f40290aba0ea15c5c5d9221fa146cec014c6aeb6a56da432229c9aa3056b94`.
All outputs have zero clipped samples. Cut seams are direct source joins with
no inserted fade; measured sample discontinuities are retained in the report.
This proves interval/format preservation, not the perceptual quality of a cut.
The first FFT assertion incorrectly demanded an exact fractional-Hz peak from
a 1 Hz FFT grid; the corrected half-bin tolerance and measured errors are saved.

## Browser proof

Owned isolated controller/API ports 18319/18320 served the production build and
a copied synthetic project. A separate fixture listener answered Studio health;
it did not run recognition or generation. Official user services were left
running. Evidence: `.scratch/ux-editing/browser-proof.json` and
`.scratch/ux-editing/browser-proof.png`.

Observed in the actual browser:

- Multi-file chooser accepted two WAVs, the app import dialog handled the batch,
  asset count grew from three to five, and import stayed enabled. No browser
  JavaScript cache dialog appeared. Fast imports did not expose a long pending
  animation in the screenshot; delayed component regressions cover that state.
- Folder/subfolder creation, table inline edit without changing display mode,
  prose copy matching visible text, paste, and Find/Replace worked.
- Subtitle inline editing updated Script. Script middle-click entered timeline
  promotion; left-click canceled it.
- Working [2.1,5.6], Cut at 2.8 and deletion of [0,2.8] skipped playback to
  retained audio; selected Uncut restored removed/cut state and retained marks.
- Reopening retained text, word edits, working range and folder hierarchy.
  All three known original WAV hashes matched unchanged input bytes.
- Layout inspection found and repaired clipped folder controls, a collapsed
  waveform stage and subtitle hit targets blocked by older CSS. Media Pool
  scrolling reaches the panel border, with usable inside padding. Light/dark
  views were inspected and the final dark state retained. No console errors.

The final production build also reopened a real two-stream synthetic MKA
archive. Both child assets retained working [2.1,5.6], cut point 2.8 and removed
[0,2.8]; excluded intervals shaded both waveform and subtitle rows. Measured
waveform height was 83 px and caption height 27 px. Script middle-click opened
the common editor without a promotion feedback loop, with correct 0 dB gain;
subtitle right-click exposed Edit/Delete, Edit opened the inline field, and
Escape canceled it. Returning restored the multichannel view. Screenshot:
`.scratch/ux-editing/archive-browser-proof.png`. The final browser console had
no errors. The fixture now has eight assets; all three original source hashes
still match. Native audition was not run by the health-only Studio fixture.

## Remaining device acceptance

Use `docs/UX-EDITING-OWNER-CHECKS.md`: native Windows selection/cache handling,
real GPU-heavy STT interaction latency, and audible middle-drag scrubbing on the
actual audio device, including archived OBS. Component tests establish event
semantics; the browser session cannot prove physical audio or native DPI.
Restart the normal app to load the changed API before those checks.

The older nine near-term parent gates and Phase 03-04 remain open at their
documented prerequisites. Frozen CER19.62% still fails the 15% budget; the
reported replay latency is not physical OBS acceptance. No phase completion,
model quality improvement or relaxed budget is inferred from this UX gate.
