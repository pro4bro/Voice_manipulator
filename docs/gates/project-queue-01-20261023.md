# PROJECT-QUEUE-01 — persistent operation Queue

Owner approved the footage-based mockup before implementation. One bounded round;
Phase03 remains60%, Phase06 remains open. See `docs/PROJECT-QUEUE.md`, ADR0139.

## Delivered

- Status opens Queue. Footage combines Import/STT/Align Subtitle/diarization under
  parent footage, preserving track identity. Current actual operations have equal
  weight; unknown progress propagates. Older attempts remain history; every active
  concurrent attempt stays visible. Running orange, pending blue, completed gray.
- Training/Generate/Lip Sync/Export/Other tabs, expandable task children, leaf-only
  aggregate for Generate, active/attention and successful Done sections. Keyboard
  focus, Escape and arrow-key tabs; stale project responses are fenced.
- Project-owned atomic receipts under `jobs/task-queue/tasks.json`. Process creation
  time plus instance identity prevents PID reuse from reviving stale tasks. Dead
  owners become interrupted. Browser import batches reserve atomically before
  serial uploads; retry uses a new attempt. Reservation failure starts no upload.
- Measured upload/copy/download bytes, STT/diarization/training counters and neural
  context groups; stage-only model loading, MFA, FFmpeg and unknown live totals.
  Alignment exposes progress locally and in Status/Queue. Done means validated
  proposal available, with explicit Ghost Preview/Apply unchanged.
- Reporting covers ordinary/growing imports, batch and live STT, OBS archive
  finalization, diarization, training, direct/Script generation, Voice Fix/Patch,
  Output Timing Repair and LipSync. Native downloads explicitly identify exports.
  Unreported project mutations lasting over5s receive an Other receipt. Existing
  executors own scheduling, stopping and artifact validation.

## Verification

| Check | Actual result |
|---|---|
| Full frontend snapshot |154 files,1262 passed,187.86s.|
| Final changed frontend cases |4 files,26 passed,5.11s; includes OBS archive grouping, Queue, panel and export.|
| Final typecheck/build |Pass,217 transformed modules.|
| Full backend integration snapshot |1535 passed,1 failed,1032.91s. Existing VibeVoice embedded import exceeded60s.|
| Isolated unchanged VibeVoice case |1 passed,48.39s; no timeout/gate change.|
| Final persistence/API/Activity checks |23 passed,5.65s; atomic reservation rollback, PID reuse, portable move, parallel writes and terminal states.|
| Final Fix/Patch/Timing/Live STT/middleware |60 passed,62.23s.|
| OBS finalization/ingest/detail/retained-script |33 passed,16.33s.|
| Live/restart/startup recovery |34 passed,23.17s.|
| Import/growing source focused checks |46 passed,128.41s; later retry-receipt regression1 passed.|
| Alignment adapters/workers focused checks |63 passed; panel10 passed during integration.|

Full suites were captured during integration; subsequent bounded changes received
the listed focused checks. Full backend is not claimed green. Existing warnings:
Starlette/httpx, Python audioop, duplicate ZIP test entry; React act warnings in
the full frontend log. No test was skipped/deleted and no budget was relaxed.

The apparent backend pause was inspected using a disposable py-spy installation:
it was processing `voice_render` audio measurements, not a Queue lock cycle.

## Real artifacts and browser

Disposable project and evidence: `.scratch/project-queue-01-artifacts/`.

- A real3s16kHz mono PCM16 WAV was imported/cached through the API and exported as
  verified3s24kHz mono PCM16. Source SHA256 remained
  `1a8756df902b6687a7a91f3623aff7c14a50530f8e4792a7274a8816cc6e4bfa`.
  Import/export receipts survived a new app instance and separate API process.
- Two real imports were reserved; the first streamed96257 multipart bytes over
  about31s, the second waited and then imported. Browser showed one running/one
  pending and the original Done slot. At38400 bytes:39.9% in Queue,40% in Status,
 46.6% tab mean=(100+39.9+0)/3. Both subsequently completed and moved to Done.
  After API restart, the browser retained all3 Footage Done slots and1 Export
  Done slot. Escape closed Queue and restored focus to its Status button.
- Browser used the real production build/API on isolated port18590, with only a
  read-only shim for the launcher's separate `/api/runtime/status` surface.
  Omitting that launcher surface initially returned SPA HTML during hub startup;
  adding the fixture route resolves it. No product startup change is inferred.
- Real-browser inspection caught an undefined `--surface` token making the modal
  transparent. Corrected to existing `--surface-panel`; opaque rendering verified.
- New EasyAligner subprocess/sidecar path aligned25/25 words in the existing8s
  fixture. Loading stage, measured1/1 context group and validation stage observed;
  final sidecar completed=total=1. The41.41s CPU run includes concurrent unrelated
  runtime-import checks, so this is execution evidence, not a speed benchmark.
  Source SHA256 unchanged:
  `6cabc77b7758d6306402b0efa5a2f6f1f9c15ad4279df44bff1a6ee30c8eb6c3`.

No owner project/manual subtitle or source media was modified. No new model,
dependency or engine source enters Git. Temporary browser tabs close and the
test server stops after inspection; disposable probes/media/reports stay ignored.

## Limits

History begins with this reporting version; previous runs are not reconstructed.
Queue is not a new scheduler: restart/resume/cancel remain owned by each feature.
Global runtime-only tasks stay in Status; containing project work receives a
project receipt. Engines without trustworthy totals display indeterminate stages.
Alignment accuracy/overlap limitations and existing runtime gates remain open.

Stop this bounded round after commit/push.
