# PORT-IMPORT-01 — connect Media Pool import through the real module registry

Date: 2026-10-12

## Owner report and reproduction

On the second machine, audio/video import created neither a footage slot nor
a notification. The source workspace populated `pendingNativeMediaPaths`, but
`ModuleRegistry.mediaPoolProps` dropped those paths and both confirmation/cancel
callbacks. It also dropped the pending import rows and retry callback. The
native import therefore stopped before the API import call for ordinary files;
queued failures from other import paths were invisible.

The existing component tests supplied the props directly; the workspace tests
mocked ModuleRegistry. Neither exercised the broken production connection.
Four new tests render the real registry branches (`media-pool`, `library-panel`)
and failed before the fix with missing pending footage/cache and error rows.

Command:
`npm test -- src/modules/registry/ModuleRegistry.test.tsx --pool=threads --maxWorkers=2`
reported **4 failed, 9 passed** before the fix. A default forks run first hit a
worker startup timeout and ran no tests; it is not counted as bug evidence.

The installed alpha 0.5.1 UI was also reproduced in the in-app browser with the
portable's embedded core Python and real API: clicking host Import returned a
WAV path, but the cache dialog and pending slot were both absent (counts 0).
The test harness substitutes only the OS file chooser and controller status;
the built UI, API routes, processor, FFmpeg and file repository are real.
Artifacts are under `.scratch/portable-import-debug`; user projects were untouched.

## Completed source scope

- Typed and forwarded native paths, confirmation/cancel, pending rows and retry
  through StudioContext, ModuleRegistry and LibraryPanel.
- Added regression coverage for both real module branches, cache choice,
  pending cache work, visible errors and retry dispatch.
- Source commit: `632548c53ba46c95e14652757343d8a8fa67bb03`.

## Source verification

- Affected frontend files: **117/117**, including all four new regressions.
- Full `npm test -- --pool=threads --maxWorkers=2`: **784/784**, 84 files,
  93.28 seconds.
- `npm run typecheck` and `npm run build`: pass. Built UI asset:
  `apps/web/dist/assets/index-C1Shkmgm.js`.
- `.venv/Scripts/python.exe -m pytest services/api/tests/test_media_track_materialization.py services/api/tests/test_native_media_file_picker.py -q`:
  **9/9**, 18.41 seconds. These include real FFmpeg track extraction and project
  relocation, with native dialog/reveal substituted in tests.
- Source UI with embedded core Python: choosing WAV showed the pending slot and
  checked Cache file dialog; confirming produced a real 0.5-second footage and
  analysis WAV. `source-after.png` records the visible source result.

## Release transfer

The creator automatically allocated **alpha 0.5.3** after the already-issued
source 0.5.2. The app-only pack contains 153 payload files; it reuses the existing
NoVibeVoice base. ZIP: `.scratch/portable-updates/Pro4Bro-AppUpdate-alpha-0.5.3-NoVibeVoice.zip`,
1,212,619 bytes (1.16 MiB), 157 archive entries. All 153 payload sizes and SHA256
hashes were checked inside the ZIP against `app-update.json`.

The actual `updates/App-alpha-0.5.3-NoVibeVoice/APPLY-UPDATE.bat` applied the pack
to the existing full portable: **30 passed, 0 failed**, `updated: true`,
`createdFromSource: false`, `appFiles: 153`, `modelLayerChanged: false`.
The base manifest SHA256 before and after was unchanged:
`E789A4C7625FAC21FCE647D889C36EE52CC2DA11D94E7478EDCDBBB5719E0D96`.
The gate took several minutes loading the STT/training Python imports. Its
successful result still measures installed imports/presence/hashes, not STT
accuracy or GPU performance.

## Actual updated-portable media smoke

The browser used the updated portable UI and API with that portable's embedded
core Python; data was isolated under `.scratch/portable-import-debug/portable-fixed`.
The harness returned test paths at the native chooser boundary and supplied the
controller's running status, without mocking media import or FFmpeg. No sidecar
STT or GPU inference was run.

- WAV with a Vietnamese filename: pending slot and cache dialog visible. With
  cache unticked, confirmation imported the file, showed success and retained
  `ORIGINAL FILE` in the footage row.
- MP4: real inspection, checked cache dialog, successful import and footage row.
- Two-track MKV: real inspection showed both tracks; completed-file cache
  confirmation produced the parent and both child tracks, two Timeline lanes
  and `Đã import 2 track` notification.
- A missing WAV produced an HTTP 400 and a visible `LỖI IMPORT` row with
  `Không tìm thấy file nguồn. Hãy chọn lại file gốc.` and `Thử lại`. Restoring the
  fixture and clicking that real button imported it and removed the error row.
- Reloading the browser and reopening the project retained four parent footage
  and two child tracks. No unexpected JavaScript exceptions were recorded.
- Embedded-core artifact command:
  `.scratch/portable-release/Pro4Bro-Portable-20261012-NoVibeVoice/.runtime/python/core/python.exe .scratch/portable-import-debug/artifacts.py`
  passed: four parents, two child tracks, **six real analysis WAVs** (including
  the MKV parent's preview). All were 24 kHz mono PCM16, 0.5 seconds except AAC
  decoding at 0.510833 seconds. Peaks were 4095 or 4257/32768, without clipping.
  Their playback API URLs returned HTTP 200 with RIFF data. Cached sources were
  byte-identical to the originals; the uncached WAV's source copy was absent as
  intended. Source and derivative paths remained relative within the project.

Screenshots: `before.png`, `source-after.png`, `portable-error.png`,
`portable-after.png` and `portable-reopened.png` in the debug artifact directory;
the numerical report is `portable-fixed/artifacts.json`. The test server was
stopped after verification; the explicitly named debug harness is not shipped.
Phase03 remains 60%.

## Remaining gap and exact next round

The agent has no connection to the owner's D-drive machine. Exact next round:
apply alpha 0.5.3 there, reopen the app from the portable root, import the same
problematic audio/video, then run the fixed-media STT benchmark. The simulated
file chooser here does not prove native dialog behavior or GPU quality there.
