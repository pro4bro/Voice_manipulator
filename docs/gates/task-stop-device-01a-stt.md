# TASK-STOP-DEVICE-01A — real CUDA STT Stop

2026-10-07. STT slice passed; parent device acceptance remains open.

## Scope and fixture

Current source API/Studio on loopback18420/18481 and controller18419, isolated
registry/project under `.scratch/task-stop-device-01`. No product source change.
The fixture uses copied Vietnamese speech from the retained RVC/STT corpus,
repeated into three372.6-second WAVs, plus three74.52-second WAVs.
Original SHA256: `68002cbff88a26bd46b37d3400bd58da3461bdae19e17329e48f18bdb9b4d0cb`.
Faster Whisper Medium loads from existing cache with offline environment flags;
Studio reports CUDA. This is cancellation acceptance, not speech accuracy,
word-boundary, latency, speaker identity or physical recording acceptance.

## Observed results

- Actual browser keyboard activation: two Stop presses open the shared Yes/No
  dialog while inference runs. No removes the two queued footage, and the active
  footage progresses and completes a real transcript. Its worker remains warm.
- Next batch reuses worker79540; the real active job is tied to that PID.
  GPU sample during inference:6654MiB/36%. Confirmed Yes cancels the active
  footage, empties the queue and removes the owned worker. OS process lookup
  confirms PID79540 is gone; GPU sample afterwards:3668MiB/2%.
  GPU samples include other desktop processes and do not establish a speed budget.
- The complete transcript retained before cancellation remains unchanged. The
  cancelled asset's full record remains unchanged after acknowledgement while
  another footage runs. All six analysis PCM hashes and the source hash agree.
- A subsequent real STT completes on new worker73520, proving cancellation does
  not leave the inference slot or child protocol unusable.
- Automated evidence assertions pass in `.scratch/task-stop-device-01/verify.py`.
  `acceptance.json`, `hard-active.json`, `hard-after.json`, `rerun-active.json`
  and `control-events.jsonl` retain raw evidence. `no-ui.txt` and `yes-dialog.txt`
  record the browser state; console checks and suite results are recorded below.

## Recovery and evidence limits

The first attempted portable Studio launch resolved the older runtime module:
its interpreter ignores the environment PYTHONPATH. That attempt is excluded.
The fixture launcher now explicitly prepends `services/stt_studio` before import;
the read-only fixture diagnostic confirms the exact source file and worker PID.
The normal launcher already copies product Studio source into its runtime.

Mouse dispatch, new-tab attachment and browser screenshot capture failed in this
session. Keyboard activation and DOM inspection worked; no new screenshot claim
is made. The original browser visibility setting is restored on final cleanup.
Fixtures are retained for the immediately following diarization slice; final
service/token cleanup is recorded in that slice.

## Checks and next scope

Frontend:560 tests/63 files pass; typecheck and production build pass. Studio:22
tests pass with the two existing deprecation warnings. Browser console: no
warnings/errors. Full API initially reports643 pass/4 fail inside the restricted
sandbox: listener enumeration and Windows taskkill tree confirmation are denied.
All four pass when rerun outside the sandbox (6.74s); this is an execution
permission difference, not a product fix. Complete host API rerun:647 pass,
two existing warnings,183.19s. Logs: `full-api-host.log`, `full-frontend.log`,
`full-studio.log`, `typecheck.log` and `build.log` under the fixture directory.
`git diff --check` passes. No training/generation model claim.
Next: TASK-STOP-DEVICE-01B — community-1 diarization Stop/No/Yes/rerun using
the existing configured access and cached weights. Training Resume additionally
needs the owner's selected project/Speaker and compatible manifest/checkpoint;
the async owner question remains pending. Growing MKV/OBS and other engines
retain their own model/device prerequisites.
