# Round86 — Readable imported footage, Reveal and STT dock (2026-10-22)

Scope: MEDIA-01, MEDIA-02 and UI-10. Owner explicitly selected new imports only;
existing footage folders/files are not renamed. ADR0134 records the layout and
controller boundaries. No owner project was used for test writes.

## Changes and diagnosis

Native/upload and followed-MKV creation hardcoded ID folders and source/analysis
role names. Multiple downstream readers also assumed the ID directory. New
imports now use a bounded safe footage stem plus stable ID, with original-name
prefixes for source, analysis, final MKV, final track WAV, waveform and STT audio
caches. New track labels retain footage name and stream index. One adapter resolves
both layouts for words, diarization, dataset/Patch evidence and MKV checkpoint
readers. Startup/Stop discover named checkpoints and validate parent IDs.

Original Reveal routing already selected the original machine-local locator,
including from a track. Windows previously sent `/select,<target>` as one
subprocess argument. Command parsing was a suspected cause of the Documents
fallback; a visual reproduction of that fallback is unavailable. The replacement
uses native Shell item selection and reports failures instead of ignoring an
Explorer exit code. Original/project routing and cache-disabled errors are covered
by existing endpoint tests; COM, parse, selection and cleanup have new coverage.

Speech to text, model choice and batch controls move into an Input module directly
below Recorder. The original controller/selection/queue callback remains shared
through a portal. Media Pool stays mounted when switching Library tabs, keeping
the right dock and model state available. Empty/processing state and pause/stop
behavior are retained. The model selector displays its selected value in the dock.

## Verification

- Full frontend: 1221 tests / 150 files / 178.11s. Earlier baseline during the
  round: 1220 / 150 / 180.32s. Latest focused MediaPool/Registry/manifest checks:
  91 / 3 files / 9.13s, including actual dock mounting and Library tab switches.
- `npm run typecheck` passes. Final `npm run build` passes, 213 modules / 472ms;
  JS `index-CorFWaWJ.js`, CSS `index-L8jOD_mz.css`.
- API group A: 136 pass / 49.34s / two existing warnings. Files: media_import_naming,
  desktop_reveal, stt_restart_recovery, project_media_library, dataset_compiler,
  sequential_diarization_queue, context_patch_source, context_patch_source_routes,
  context_patch_processor, api_startup_recovery_readiness.
- API group B: 55 pass / 116.24s / two existing warnings. Files: growing_mkv_follower,
  media_import_processor, media_track_materialization, growing_mkv_status_snapshot.
- Latest API group C, after naming the waveform/segment caches and extending COM
  checks: 51 pass / 103.57s / two existing warnings. Files: media_import_naming,
  desktop_reveal, growing_mkv_follower, audio_waveform_envelope. Final materialized
  track naming assertions: 7 pass / 7.49s. These groups overlap; they are not a full
  API count. Warnings are Starlette/httpx and audioop deprecation.

All API commands use `.venv/Scripts/python.exe -m pytest <explicit files> -q` from
the repository root. Frontend checks run in `apps/web`. No assertion, timeout,
coverage threshold or test is removed/disabled to obtain these results.

Real FFmpeg media tests verify source byte hashes, cache off/on copies, independent
track decoding and 24kHz mono PCM16/frame counts, complete final-tail PCM against
an independent decode, live writer progress, Stop, restart and project move.
The automatic-close/final-tail case now covers both new and legacy folder layouts.
Native Unicode WAV imports preserve source bytes and transcript sidecars after
moving the project to a Unicode path. Browser upload and duplicate-name imports
are covered. Native source/project Reveal endpoint routing passes with cache on/off.

Windows native probe passes actual COM initialization, SHParseDisplayName and
SHGetPathFromIDListW round-trip for `Phỏng vấn, buổi 1 & voice.mkv`; the selection
call is intercepted, verifies cidl=0 and the exact full path, and returns success.
This proves native item identity transfer, not a visible Explorer selection.
`.scratch/media86/native-shell-proof.json` records the probe.

Red checks initially catch opaque native naming (1), the undocked button (1) and
the previous Explorer command/error handling (2). The first broad backend run
reports 11 failures/42 pass because existing MKV tests hardcoded the old directory
layout. They now resolve the published layout, preserve every content/state
assertion, and add explicit named/legacy expectations. A subsequent 1 fail/76 pass
is a fixture expecting a leading dot despite the defined portable-name trimming;
the expectation is corrected to `wav`. Later groups above pass.

Isolated mutation in a copied app negates the new folder lookup condition; the
legacy/new coexistence regression fails as intended. Production files are never
mutated. `.scratch/media86/mutation.log` retains the killed mutation, and
`build-final.log` retains final build output.

Review covers correctness (new/old coexistence and durable resumption), readability
(shared path adapter, formatted STT controls), architecture (stable IDs/relative
paths, one queue owner), security (safe components/containment/no Shell command
parser), and performance (bounded successful-path cache and no new polling).

## Runtime and remaining acceptance

The source runtime was already running; read-only checks found OBS recording and
all channel captures idle, with no active activity tasks. A normal controller
restart through `/api/runtime/actions` loaded the backend. Controller PID72456
remains, API PID11064 and Studio PID79712 report running, lastError is null.
Health returns HTTP200 JSON; the served index references the final JS/CSS assets.
No controller termination or owner-file rename is performed.

Browser access is disabled in Work settings. Visible Input layout and actual
Explorer window selection remain owner-device UAT; no screenshot proof is claimed.
The prior Round84 full-API process-containment failure remains open. Do not repeat
the portable updater test against a live source stack until its termination calls
are isolated; the focused groups do not waive that gate. No portable release,
engine, recognition model or timing-policy change is part of this round.

Phase03 stays60%, Phase06 open. Stop86 after reviewed commit/push.

Product commits: cc7bd99 (storage/Reveal), 08fe408 (Input STT dock).
